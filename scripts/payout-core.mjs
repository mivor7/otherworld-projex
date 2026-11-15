// Payout engine — the part of the payout worker that decides what to send and
// what happened to it. scripts/payout-worker.mjs wires it to the real house
// key, RPC, and database; tests/integration/payout-engine.test.ts drives it
// against a fake chain.
//
// An on-chain payment cannot be taken back, so one rule shapes everything
// here: a withdrawal is only ever re-sent once its previous transaction is
// PROVEN dead. The steps that make that provable:
//
//   1. Sign first. The transaction's signature is known before anything is
//      broadcast.
//   2. Claim the row and record that signature in one statement. From then
//      on the database knows exactly which transaction may have paid the row.
//   3. Never guess from an error. A send that throws may still have reached
//      the network. The row is settled only from chain state:
//        · the signature is confirmed          → the row is sent
//        · the signature failed on-chain       → it can never pay; re-queue
//        · the signature is unknown, its blockhash has expired at finalized
//          commitment (plus a margin), AND "unknown" can be trusted
//                                              → it can never land; re-queue
//        · anything else                       → wait and look again
//
// "Unknown can be trusted" matters because an RPC node only remembers recent
// signatures (about two minutes) unless it keeps transaction history. Asked
// about an older one, a node without history answers "unknown" for a payment
// that landed. So an unknown signature is only believed when either
//   · this process has been asking about it without a long gap since it was
//     sent — a landing would have been seen while the node still had it — or
//   · the RPC has proven it serves history, by finding one of our own older
//     payouts.
// When neither holds, the row stays "processing" for a human. That is the
// rare case: the worker died mid-send, came back late, on an RPC without
// history, and the transaction is not on the chain it can see.
//
// Rows in "processing" WITHOUT a signature were claimed by an admin's
// "Pay now" in /admin and are never touched here.
import bs58 from "bs58";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

/** A blockhash is accepted for this many blocks after it was produced. */
export const BLOCKHASH_LIFETIME = 150;

const DEFAULTS = {
  /** Largest withdrawal or prize sent without a human, in whole tokens. */
  maxPayoutWhole: 1_000_000,
  /** Largest SOL purchase sent without a human, in whole tokens. */
  maxBuyWhole: 1_000_000_000,
  /** Open the recipient's token account when it is missing. The house pays its rent. */
  createTokenAccounts: true,
  /** Used only until the mint account can be read. */
  fallbackDecimals: 6,
  /** Rows taken per cycle. */
  batch: 5,
  /** How often an in-flight transaction is checked. */
  pollMs: 2_000,
  /** How often the same signed transaction is re-broadcast while unconfirmed. */
  resendMs: 4_000,
  /** How long one cycle watches a transaction before moving on. */
  watchMs: 30_000,
  /** Finalized blocks to wait past a blockhash's expiry before calling it dead. */
  expiryMargin: 64,
  /**
   * Longest gap between two answered status lookups for the watch on a
   * transaction to still count as unbroken. An RPC node forgets a signature
   * roughly two minutes after it lands; this stays well inside that.
   */
  maxLookupGapMs: 60_000,
  /** A sent payout this old is past any node's short-term memory. */
  historyProbeAgeMs: 10 * 60_000,
  /** How often to retry proving history while it is unproven. */
  historyProbeEveryMs: 10 * 60_000,
  /** First retry delay after a failed attempt; doubles each time. */
  backoffMs: 30_000,
  maxBackoffMs: 15 * 60_000,
};

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The RPC ran the transaction and refused to forward it. This is the one
 * send error that proves nothing was broadcast.
 */
export function isPreflightRejection(error) {
  return /Transaction simulation failed/i.test(String(error?.message ?? ""));
}

export function createPayoutEngine({
  prisma,
  connection,
  signer,
  mint,
  options = {},
  log = console,
  sleep = defaultSleep,
  now = () => Date.now(),
}) {
  const opt = { ...DEFAULTS, ...options };
  /** @type {{ tokenProgram: PublicKey, decimals: number, fromAta: PublicKey } | null} */
  let mintInfo = null;
  /** Rows that failed recently: id → { fails, until }. Skipped until `until`. */
  const cooldown = new Map();
  /**
   * What this process knows about each in-flight transaction, keyed
   * `${id}:${signature}`:
   *   bound     highest block height at which it can still land
   *   own       this process signed and broadcast it
   *   lastOkAt  when a status lookup last got an answer
   *   unbroken  no gap longer than maxLookupGapMs between answers since it was sent
   */
  const flights = new Map();
  const history = { proven: false, checkedAt: -Infinity };
  const warned = new Set();
  let lastHeldForReview = -1;

  function backoff(id) {
    const fails = (cooldown.get(id)?.fails ?? 0) + 1;
    const delay = Math.min(opt.backoffMs * 2 ** (fails - 1), opt.maxBackoffMs);
    cooldown.set(id, { fails, until: now() + delay });
    return Math.round(delay / 1000);
  }

  /**
   * Does this RPC still know a payout of ours that is too old for any node's
   * short-term memory? If so, "unknown signature" from it means "never landed".
   */
  async function historyProven() {
    if (history.proven) return true;
    if (now() - history.checkedAt < opt.historyProbeEveryMs) return false;
    history.checkedAt = now();
    try {
      const old = await prisma.withdrawal.findFirst({
        where: {
          status: "sent",
          signature: { not: null },
          processedAt: { lt: new Date(now() - opt.historyProbeAgeMs) },
        },
        orderBy: { processedAt: "desc" },
        select: { signature: true },
      });
      if (!old?.signature) return false;
      const res = await connection.getSignatureStatuses([old.signature], {
        searchTransactionHistory: true,
      });
      history.proven = !!res.value[0];
      if (history.proven) log.log("RPC serves transaction history — stale rows can be settled automatically.");
    } catch {
      // Unproven. Try again later.
    }
    return history.proven;
  }

  // The mint account's owner is the token program. Until that account
  // exists, payouts wait in the queue.
  async function ensureMint() {
    if (mintInfo) return true;
    try {
      const info = await connection.getAccountInfo(mint);
      if (!info || info.data.length < 45) {
        log.error("$OWP mint account is not on mainnet yet — payouts wait.");
        return false;
      }
      let tokenProgram;
      if (info.owner.equals(TOKEN_PROGRAM_ID)) tokenProgram = TOKEN_PROGRAM_ID;
      else if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) tokenProgram = TOKEN_2022_PROGRAM_ID;
      else {
        log.error(`$OWP mint owner ${info.owner.toBase58()} is not a token program — payouts wait.`);
        return false;
      }
      const decimals = info.data[44];
      mintInfo = {
        tokenProgram,
        decimals,
        fromAta: getAssociatedTokenAddressSync(mint, signer.publicKey, true, tokenProgram),
      };
      log.log(`$OWP mint ready. Decimals ${decimals}. Program ${tokenProgram.toBase58()}.`);
      return true;
    } catch (e) {
      log.error(`mint lookup failed: ${e.message}`);
      return false;
    }
  }

  function wholeToRaw(whole) {
    const decimals = mintInfo?.decimals ?? opt.fallbackDecimals;
    return BigInt(Math.round(Number(whole) * 10 ** decimals));
  }

  /** Rows the worker may send on its own: within the cap for their kind. */
  function withinCaps() {
    return [
      { kind: "buy", amountRaw: { lte: wholeToRaw(opt.maxBuyWhole) } },
      { kind: { not: "buy" }, amountRaw: { lte: wholeToRaw(opt.maxPayoutWhole) } },
    ];
  }

  function payoutNote(wd) {
    const to = `${wd.destination.slice(0, 4)}…`;
    if (wd.kind === "bounty") return `Bounty prize → ${to}`;
    if (wd.kind === "buy") return `Sold $OWP to ${to}`;
    return `Withdrawal to ${to}`;
  }

  /** processing(signature) → sent. Guarded, so it happens at most once. */
  async function markSent(wd, signature) {
    const done = await prisma.$transaction(async (tx) => {
      const updated = await tx.withdrawal.updateMany({
        where: { id: wd.id, status: "processing", signature },
        data: { status: "sent", processedAt: new Date() },
      });
      if (updated.count === 0) return false;
      await tx.treasuryEvent.create({
        data: {
          kind: "payout",
          amount: wd.amountRaw,
          asset: "RIBBIT",
          note: payoutNote(wd),
          ref: signature,
        },
      });
      return true;
    });
    flights.delete(`${wd.id}:${signature}`);
    cooldown.delete(wd.id);
    if (done) log.log(`✓ ${wd.id}: paid ${wd.amountRaw} raw → ${wd.destination} (${signature})`);
    return done;
  }

  /**
   * processing(signature) → pending, for a transaction proven dead. The
   * signature is cleared so the next attempt records its own, and the row
   * backs off so one bad row cannot spin or starve the queue.
   */
  async function release(wd, signature, reason) {
    const updated = await prisma.withdrawal.updateMany({
      where: { id: wd.id, status: "processing", signature },
      data: { status: "pending", signature: null },
    });
    flights.delete(`${wd.id}:${signature}`);
    if (updated.count === 0) return false;
    log.error(`✗ ${wd.id}: ${reason} — nothing was paid. Retrying in ${backoff(wd.id)}s.`);
    return true;
  }

  async function settleKnown(wd, signature, status) {
    // "processed" is one node's view of one fork. Wait for the cluster.
    const settled =
      status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized";
    if (!settled) return "waiting";
    if (status.err) {
      await release(wd, signature, `transaction failed on-chain (${JSON.stringify(status.err)})`);
      return "released";
    }
    await markSent(wd, signature);
    return "sent";
  }

  /**
   * Settle one "processing" row from chain state.
   * Returns "sent", "released", or "waiting". Never throws.
   */
  async function resolve(wd) {
    const signature = wd.signature;
    if (!signature) return "waiting";
    const key = `${wd.id}:${signature}`;
    try {
      const lookup = () =>
        connection
          .getSignatureStatuses([signature], { searchTransactionHistory: true })
          .then((r) => r.value[0]);

      const status = await lookup();
      if (status) return await settleKnown(wd, signature, status);

      // The chain has not seen it. It can still land until its blockhash expires.
      let flight = flights.get(key);
      if (!flight) {
        // Signed by an earlier run of the worker. Its blockhash is no newer
        // than right now, so it cannot outlive the current height + lifetime.
        // How long ago it was sent is unknown, so this watch does not count
        // as unbroken: only an RPC with history can vouch for "unknown".
        flight = {
          bound: (await connection.getBlockHeight("confirmed")) + BLOCKHASH_LIFETIME,
          own: false,
          lastOkAt: now(),
          unbroken: false,
        };
        flights.set(key, flight);
        return "waiting";
      }
      if (now() - flight.lastOkAt > opt.maxLookupGapMs) flight.unbroken = false;
      flight.lastOkAt = now();

      const finalized = await connection.getBlockHeight("finalized");
      if (finalized <= flight.bound + opt.expiryMargin) return "waiting";

      // Expired. Look once more: it may have landed after the first lookup.
      const late = await lookup();
      if (late) return await settleKnown(wd, signature, late);

      if (flight.unbroken || (await historyProven())) {
        await release(wd, signature, "transaction expired without landing");
        return "released";
      }
      if (!warned.has(key)) {
        warned.add(key);
        log.error(
          `⚠ ${wd.id}: ${signature} expired and this RPC does not show it, but the RPC ` +
            "has not proven it keeps history, so that is not proof it never landed. " +
            'LEFT IN "processing". Check the signature on an explorer, then in /admin ' +
            "mark it sent, or release it if it is not there."
        );
      }
      return "waiting";
    } catch (e) {
      log.error(`… ${wd.id}: could not check ${signature} (${e.message}) — still processing`);
      return "waiting";
    }
  }

  /** Settle every row an earlier cycle or an earlier run left in flight. */
  async function reconcile() {
    const limbo = await prisma.withdrawal.findMany({
      where: { status: "processing", signature: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    const outcomes = { sent: 0, released: 0, waiting: 0 };
    for (const wd of limbo) outcomes[await resolve(wd)]++;
    return outcomes;
  }

  /** Send one pending row. Returns "sent", "released", "waiting", or "skipped". */
  async function send(wd) {
    const { tokenProgram, decimals, fromAta } = mintInfo;
    let tx, signature, raw, lastValidBlockHeight;
    try {
      const dest = new PublicKey(wd.destination);
      const toAta = getAssociatedTokenAddressSync(mint, dest, true, tokenProgram);
      tx = new Transaction();
      if (opt.createTokenAccounts) {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            signer.publicKey, toAta, dest, mint, tokenProgram
          )
        );
      }
      tx.add(
        createTransferCheckedInstruction(
          fromAta, mint, toAta, signer.publicKey, wd.amountRaw, decimals, [], tokenProgram
        )
      );
      const latest = await connection.getLatestBlockhash("confirmed");
      lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = signer.publicKey;
      tx.sign(signer);
      signature = bs58.encode(tx.signature);
      raw = tx.serialize();
    } catch (e) {
      // Nothing is signed or claimed yet. The row is still pending.
      log.error(`✗ ${wd.id}: could not build the transaction (${e.message}). Retrying in ${backoff(wd.id)}s.`);
      return "skipped";
    }

    // Claim the row and record the signature BEFORE touching the chain. If an
    // admin rejected (and refunded) it a moment ago, or another worker took
    // it, this matches nothing and the signed transaction is thrown away.
    const claimed = await prisma.withdrawal.updateMany({
      where: { id: wd.id, status: "pending" },
      data: { status: "processing", signature },
    });
    if (claimed.count === 0) {
      log.log(`↷ ${wd.id}: no longer pending, skipping`);
      return "skipped";
    }
    flights.set(`${wd.id}:${signature}`, {
      bound: lastValidBlockHeight,
      own: true,
      lastOkAt: now(),
      unbroken: true,
    });
    const inFlight = { ...wd, signature };

    try {
      await connection.sendRawTransaction(raw, { preflightCommitment: "confirmed" });
    } catch (e) {
      if (isPreflightRejection(e)) {
        await release(inFlight, signature, e.message.split("\n").slice(0, 2).join(" ").trim());
        return "released";
      }
      // It may have been broadcast. Chain state decides, below.
      log.error(`… ${wd.id}: send errored (${e.message}) — checking the chain before anything else`);
    }

    const deadline = now() + opt.watchMs;
    let lastSend = now();
    while (now() < deadline) {
      await sleep(opt.pollMs);
      const outcome = await resolve(inFlight);
      if (outcome !== "waiting") return outcome;
      if (now() - lastSend >= opt.resendMs) {
        lastSend = now();
        // Same bytes, same signature: the network accepts it at most once.
        connection.sendRawTransaction(raw, { skipPreflight: true }).catch(() => {});
      }
    }
    log.error(
      `⚠ ${wd.id}: ${signature} is not confirmed after ${Math.round(opt.watchMs / 1000)}s. ` +
        'Left in "processing". It is settled automatically once the chain shows whether it landed.'
    );
    return "waiting";
  }

  /** One pass: settle what is in flight, then send what is due. */
  async function cycle() {
    const stats = { sent: 0, released: 0, waiting: 0, skipped: 0, paused: false, heldForReview: 0 };
    const settled = await reconcile();
    stats.sent += settled.sent;
    stats.released += settled.released;
    stats.waiting += settled.waiting;

    if (!(await ensureMint())) return stats;

    // Admin kill switch: the queue keeps accepting requests, but nothing new
    // is claimed or sent while payouts are paused from the House controls.
    // Transactions already broadcast are still settled above.
    const paused = await prisma.houseSetting.findUnique({ where: { key: "payoutsPaused" } });
    if (paused?.value === "true") {
      log.log("⏸ payouts paused from the admin panel — skipping this pass");
      stats.paused = true;
      return stats;
    }

    // Rows above the cap wait for a human. They are filtered out in the
    // query, not skipped after it: taking "the oldest five" and then skipping
    // the big ones stops the whole queue as soon as five big rows are waiting.
    stats.heldForReview = await prisma.withdrawal.count({
      where: { status: "pending", NOT: { OR: withinCaps() } },
    });
    if (stats.heldForReview !== lastHeldForReview) {
      lastHeldForReview = stats.heldForReview;
      if (stats.heldForReview > 0) {
        log.log(`↷ ${stats.heldForReview} payout(s) above the cap are waiting for manual review in /admin`);
      }
    }

    const t = now();
    // Forget rows that stopped failing long ago (paid by hand, rejected, …).
    for (const [id, c] of cooldown) if (c.until + opt.maxBackoffMs * 4 < t) cooldown.delete(id);
    const cooling = [...cooldown].filter(([, c]) => c.until > t).map(([id]) => id);
    const pending = await prisma.withdrawal.findMany({
      where: {
        status: "pending",
        OR: withinCaps(),
        ...(cooling.length > 0 ? { id: { notIn: cooling } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: opt.batch,
    });

    for (const wd of pending) stats[await send(wd)]++;
    return stats;
  }

  return { cycle, reconcile, resolve, ensureMint, cooldown, flights };
}
