// The payout engine moves real tokens and a payment cannot be taken back, so
// these tests are about one thing above all: a withdrawal is paid once.
//
// The database is real. The chain is a fake that can be told to land, drop,
// reject, or lose track of a transaction — the situations a live RPC produces
// and a test validator will not. Transactions are built and signed by the real
// @solana/web3.js and @solana/spl-token, and the fake decodes what it is sent.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import bs58 from "bs58";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  decodeTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { prisma } from "@/lib/db";
import { BLOCKHASH_LIFETIME, createPayoutEngine, isPreflightRejection } from "../../scripts/payout-core.mjs";
import { cleanup, HAS_DB, makeUser } from "./helpers";

const DECIMALS = 6;
const RAW = 10n ** BigInt(DECIMALS);

type Mode = "land" | "drop" | "preflight" | "fail-on-chain" | "error-but-lands" | "error-and-drops";
type Status = { err: unknown; confirmationStatus: "processed" | "confirmed" | "finalized" } | null;

/** Just enough of a Solana RPC for the engine, with the failure modes scripted. */
class FakeChain {
  height = 10_000;
  finalizedLag = 32;
  mode: Mode = "land";
  mintExists = true;
  /** Whether the node answers for signatures older than its short-term memory. */
  hasHistory = true;
  statuses = new Map<string, Status>();
  /** Signatures the node has forgotten (landed, but no history to find them). */
  forgotten = new Set<string>();
  /** Every distinct transaction that reached the network. */
  broadcast = new Map<string, Transaction>();
  sendCalls = 0;
  statusCalls = 0;
  failStatusLookups = false;
  onBlockhash: (() => Promise<void>) | null = null;

  async getAccountInfo() {
    if (!this.mintExists) return null;
    const data = Buffer.alloc(82);
    data[44] = DECIMALS;
    return { owner: TOKEN_PROGRAM_ID, data };
  }
  async getLatestBlockhash() {
    if (this.onBlockhash) await this.onBlockhash();
    return {
      blockhash: bs58.encode(Keypair.generate().publicKey.toBytes()),
      lastValidBlockHeight: this.height + BLOCKHASH_LIFETIME,
    };
  }
  async sendRawTransaction(raw: Buffer) {
    this.sendCalls++;
    const tx = Transaction.from(raw);
    const signature = bs58.encode(tx.signature!);
    if (this.mode === "preflight") {
      throw new Error(
        "Simulation failed. \nMessage: Transaction simulation failed: Error processing Instruction 1: custom program error: 0x1. \nLogs: []"
      );
    }
    const lands = this.mode === "land" || this.mode === "error-but-lands" || this.mode === "fail-on-chain";
    if (this.mode !== "drop" && this.mode !== "error-and-drops") this.broadcast.set(signature, tx);
    if (lands && !this.statuses.has(signature)) {
      this.statuses.set(signature, {
        err: this.mode === "fail-on-chain" ? { InstructionError: [1, { Custom: 1 }] } : null,
        confirmationStatus: "confirmed",
      });
    }
    if (this.mode === "error-but-lands" || this.mode === "error-and-drops") {
      throw new Error("fetch failed");
    }
    return signature;
  }
  async getSignatureStatuses(sigs: string[]) {
    this.statusCalls++;
    if (this.failStatusLookups) throw new Error("503 Service Unavailable");
    return {
      value: sigs.map((s) => (this.forgotten.has(s) && !this.hasHistory ? null : this.statuses.get(s) ?? null)),
    };
  }
  async getBlockHeight(commitment?: string) {
    return commitment === "finalized" ? this.height - this.finalizedLag : this.height;
  }
  /** Let enough blocks pass that a blockhash issued now is dead beyond doubt. */
  expireEverything() {
    this.height += BLOCKHASH_LIFETIME + 64 + this.finalizedLag + 1;
  }
}

// The engine only calls log() and error(); typed as Console because that is its default.
const quiet = { log: () => {}, error: () => {} } as unknown as Console;

describe.skipIf(!HAS_DB)("payout engine", () => {
  const signer = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  let chain: FakeChain;
  let clock: number;
  const made: string[] = [];

  function engine(options: Record<string, unknown> = {}) {
    return createPayoutEngine({
      prisma,
      connection: chain,
      signer,
      mint,
      log: quiet,
      // Time only moves when the engine sleeps, so a 30s watch runs instantly.
      sleep: async (ms: number) => void (clock += ms),
      now: () => clock,
      options,
    });
  }

  async function queue(
    whole: bigint,
    over: Partial<{ kind: string; status: string; signature: string | null; createdAt: Date; processedAt: Date }> = {}
  ) {
    const user = await makeUser(0);
    const dest = Keypair.generate().publicKey.toBase58();
    const wd = await prisma.withdrawal.create({
      data: { userId: user.id, amountRaw: whole * RAW, destination: dest, ...over },
    });
    made.push(wd.id);
    return wd;
  }
  const row = (id: string) => prisma.withdrawal.findUniqueOrThrow({ where: { id } });

  beforeEach(async () => {
    chain = new FakeChain();
    clock = 1_700_000_000_000;
    // The engine works the whole queue; start each test from an empty one,
    // and without an older "sent" row that could prove RPC history by accident.
    await prisma.withdrawal.deleteMany({ where: { id: { in: made.splice(0) } } });
    await prisma.withdrawal.deleteMany({ where: { status: { in: ["pending", "processing"] } } });
    await prisma.houseSetting.deleteMany({ where: { key: "payoutsPaused" } });
  });
  afterEach(async () => {
    await prisma.treasuryEvent.deleteMany({ where: { kind: "payout" } });
    await prisma.houseSetting.deleteMany({ where: { key: "payoutsPaused" } });
  });
  afterAll(async () => {
    await prisma.withdrawal.deleteMany({ where: { id: { in: made } } });
    await cleanup();
  });

  it("pays a queued withdrawal with the right amount to the right account", async () => {
    const wd = await queue(250n);
    const stats = await engine().cycle();
    expect(stats.sent).toBe(1);

    const after = await row(wd.id);
    expect(after.status).toBe("sent");
    expect(after.processedAt).not.toBeNull();
    expect(chain.broadcast.size).toBe(1);

    const [[signature, tx]] = [...chain.broadcast];
    expect(after.signature).toBe(signature);
    expect(tx.feePayer!.equals(signer.publicKey)).toBe(true);
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    const transfer = decodeTransferCheckedInstruction(tx.instructions[1], TOKEN_PROGRAM_ID);
    const dest = new PublicKey(wd.destination);
    expect(transfer.data.amount).toBe(250n * RAW);
    expect(transfer.data.decimals).toBe(DECIMALS);
    expect(transfer.keys.mint.pubkey.equals(mint)).toBe(true);
    expect(transfer.keys.owner.pubkey.equals(signer.publicKey)).toBe(true);
    expect(transfer.keys.source.pubkey.equals(getAssociatedTokenAddressSync(mint, signer.publicKey))).toBe(true);
    expect(transfer.keys.destination.pubkey.equals(getAssociatedTokenAddressSync(mint, dest))).toBe(true);

    const event = await prisma.treasuryEvent.findFirstOrThrow({ where: { ref: signature } });
    expect(event.amount).toBe(250n * RAW);
  });

  it("records the signature before the transaction is broadcast", async () => {
    const wd = await queue(10n);
    let seenAtSend: { status: string; signature: string | null } | null = null;
    const send = chain.sendRawTransaction.bind(chain);
    chain.sendRawTransaction = async (raw: Buffer) => {
      seenAtSend ??= await row(wd.id);
      return send(raw);
    };
    await engine().cycle();
    expect(seenAtSend!.status).toBe("processing");
    expect(seenAtSend!.signature).toBe((await row(wd.id)).signature);
  });

  it("does not let rows above the cap hold up the rows behind them", async () => {
    // Six oversized rows, all older than the one that can be paid. The old
    // worker took "the oldest five", skipped them all, and never got further.
    const old = new Date(clock - 3_600_000);
    const big = [];
    for (let i = 0; i < 6; i++) big.push(await queue(2_000_000n, { createdAt: new Date(old.getTime() + i) }));
    const small = await queue(500n);
    const stats = await engine().cycle();
    expect((await row(small.id)).status).toBe("sent");
    expect(stats.heldForReview).toBe(6);
    for (const b of big) expect((await row(b.id)).status).toBe("pending");
    expect(chain.broadcast.size).toBe(1);
  });

  it("applies the larger cap to SOL purchases and the smaller one to withdrawals", async () => {
    const buy = await queue(50_000_000n, { kind: "buy" });
    const bounty = await queue(50_000_000n, { kind: "bounty" });
    await engine().cycle();
    expect((await row(buy.id)).status).toBe("sent");
    expect((await row(bounty.id)).status).toBe("pending");
  });

  it("pays once when the send errors but the transaction lands anyway", async () => {
    // The classic double-pay: the RPC accepts the transaction, the response is
    // lost, the caller sees a network error and tries again with a new one.
    chain.mode = "error-but-lands";
    const wd = await queue(100n);
    const e = engine();
    await e.cycle();
    await e.cycle();
    await e.cycle();
    expect((await row(wd.id)).status).toBe("sent");
    expect(chain.broadcast.size).toBe(1);
  });

  it("keeps a dropped transaction's row claimed until the blockhash is provably dead", async () => {
    chain.mode = "error-and-drops";
    const wd = await queue(100n);
    const e = engine();
    await e.cycle();
    const claimed = await row(wd.id);
    expect(claimed.status).toBe("processing");
    expect(claimed.signature).not.toBeNull();

    // Not expired yet — at confirmed commitment, or at finalized without the margin.
    chain.height += BLOCKHASH_LIFETIME + chain.finalizedLag + 10;
    await e.cycle();
    expect((await row(wd.id)).status).toBe("processing");

    // Expired beyond doubt, and watched the whole time: safe to re-queue.
    chain.expireEverything();
    await e.cycle();
    const released = await row(wd.id);
    expect(released.status).toBe("pending");
    expect(released.signature).toBeNull();
    expect(chain.broadcast.size).toBe(0);

    // It backs off, then is paid by a fresh transaction.
    chain.mode = "land";
    await e.cycle();
    expect((await row(wd.id)).status).toBe("pending");
    clock += 31_000;
    await e.cycle();
    const paid = await row(wd.id);
    expect(paid.status).toBe("sent");
    expect(paid.signature).not.toBe(claimed.signature);
    expect(chain.broadcast.size).toBe(1);
  });

  it("re-queues at once when the RPC refuses the transaction at simulation", async () => {
    chain.mode = "preflight";
    const bad = await queue(100n);
    const e = engine();
    const first = await e.cycle();
    expect(first.released).toBe(1);
    const after = await row(bad.id);
    expect(after.status).toBe("pending");
    expect(after.signature).toBeNull();
    expect(chain.broadcast.size).toBe(0);

    // The failing row backs off, so it cannot starve a row queued after it.
    chain.mode = "land";
    const good = await queue(5n);
    const calls = chain.sendCalls;
    await e.cycle();
    expect((await row(good.id)).status).toBe("sent");
    expect((await row(bad.id)).status).toBe("pending");
    expect(chain.sendCalls).toBe(calls + 1);
  });

  it("backs off longer each time the same row fails", async () => {
    chain.mode = "preflight";
    const wd = await queue(100n);
    const e = engine();
    await e.cycle();
    expect(e.cooldown.get(wd.id).until - clock).toBe(30_000);
    clock += 30_001;
    await e.cycle();
    expect(e.cooldown.get(wd.id).until - clock).toBe(60_000);
    clock += 60_001;
    await e.cycle();
    expect(e.cooldown.get(wd.id).until - clock).toBe(120_000);
  });

  it("re-queues a transaction that landed and failed on-chain", async () => {
    chain.mode = "fail-on-chain";
    const wd = await queue(100n);
    await engine().cycle();
    const after = await row(wd.id);
    expect(after.status).toBe("pending");
    expect(after.signature).toBeNull();
    expect(await prisma.treasuryEvent.count({ where: { kind: "payout" } })).toBe(0);
  });

  it("waits while a transaction is only 'processed'", async () => {
    const wd = await queue(100n);
    const e = engine({ watchMs: 4_000 });
    const send = chain.sendRawTransaction.bind(chain);
    chain.sendRawTransaction = async (raw: Buffer) => {
      const sig = await send(raw);
      chain.statuses.set(sig, { err: null, confirmationStatus: "processed" });
      return sig;
    };
    await e.cycle();
    expect((await row(wd.id)).status).toBe("processing");
    chain.statuses.set((await row(wd.id)).signature!, { err: null, confirmationStatus: "finalized" });
    await e.cycle();
    expect((await row(wd.id)).status).toBe("sent");
  });

  it("re-broadcasts the same signed transaction while it is unconfirmed, never a new one", async () => {
    chain.mode = "drop";
    await queue(100n);
    const seen = new Set<string>();
    const send = chain.sendRawTransaction.bind(chain);
    chain.sendRawTransaction = async (raw: Buffer) => {
      seen.add(bs58.encode(Transaction.from(raw).signature!));
      return send(raw);
    };
    await engine().cycle();
    expect(chain.sendCalls).toBeGreaterThan(3);
    expect(seen.size).toBe(1);
  });

  it("finishes a payout that an earlier run broadcast before it died", async () => {
    const signature = bs58.encode(Buffer.alloc(64, 7));
    const wd = await queue(100n, { status: "processing", signature });
    chain.statuses.set(signature, { err: null, confirmationStatus: "finalized" });
    const stats = await engine().cycle();
    expect(stats.sent).toBe(1);
    expect((await row(wd.id)).status).toBe("sent");
    expect(chain.sendCalls).toBe(0);
  });

  it("does not re-queue an inherited row on an RPC that has not proven it keeps history", async () => {
    // The dangerous case. The earlier run's payout LANDED, long enough ago
    // that this node has forgotten it. "Unknown signature" is not "unpaid".
    const signature = bs58.encode(Buffer.alloc(64, 9));
    const wd = await queue(100n, { status: "processing", signature });
    chain.statuses.set(signature, { err: null, confirmationStatus: "finalized" });
    chain.forgotten.add(signature);
    chain.hasHistory = false;
    const e = engine();
    await e.cycle();
    chain.expireEverything();
    await e.cycle();
    await e.cycle();
    const after = await row(wd.id);
    expect(after.status).toBe("processing");
    expect(after.signature).toBe(signature);
    expect(chain.sendCalls).toBe(0);
  });

  it("re-queues an inherited row once the RPC has proven it keeps history", async () => {
    // An older payout of ours that the node can still find is the proof.
    const proof = bs58.encode(Buffer.alloc(64, 3));
    await queue(1n, { status: "sent", signature: proof, processedAt: new Date(clock - 3_600_000) });
    chain.statuses.set(proof, { err: null, confirmationStatus: "finalized" });

    const signature = bs58.encode(Buffer.alloc(64, 5));
    const wd = await queue(100n, { status: "processing", signature });
    const e = engine();
    await e.cycle();
    expect((await row(wd.id)).status).toBe("processing");
    chain.expireEverything();
    await e.cycle();
    expect((await row(wd.id)).status).toBe("pending");
  });

  it("does not trust 'unknown' after a gap in its own watch", async () => {
    // The transaction lands, the RPC is unreachable for a few minutes, and by
    // the time it answers again the node has forgotten the signature.
    chain.mode = "error-but-lands";
    chain.hasHistory = false;
    const wd = await queue(100n);
    const e = engine({ watchMs: 4_000 });
    chain.failStatusLookups = true;
    await e.cycle();
    const signature = (await row(wd.id)).signature!;
    expect((await row(wd.id)).status).toBe("processing");

    clock += 5 * 60_000;
    chain.expireEverything();
    chain.forgotten.add(signature);
    chain.failStatusLookups = false;
    await e.cycle();
    await e.cycle();
    expect((await row(wd.id)).status).toBe("processing");
    expect(chain.broadcast.size).toBe(1);
  });

  it("never touches a row an admin claimed for a manual payment", async () => {
    const wd = await queue(100n, { status: "processing", signature: null });
    const e = engine();
    await e.cycle();
    chain.expireEverything();
    await e.cycle();
    expect((await row(wd.id)).status).toBe("processing");
    expect(chain.sendCalls).toBe(0);
    expect(chain.statusCalls).toBe(0);
  });

  it("sends nothing new while payouts are paused, but still settles what is in flight", async () => {
    const signature = bs58.encode(Buffer.alloc(64, 11));
    const inFlight = await queue(100n, { status: "processing", signature });
    chain.statuses.set(signature, { err: null, confirmationStatus: "confirmed" });
    const waiting = await queue(100n);
    await prisma.houseSetting.create({ data: { key: "payoutsPaused", value: "true" } });
    const stats = await engine().cycle();
    expect(stats.paused).toBe(true);
    expect((await row(inFlight.id)).status).toBe("sent");
    expect((await row(waiting.id)).status).toBe("pending");
    expect(chain.sendCalls).toBe(0);
  });

  it("does not send a row an admin rejected a moment before the claim", async () => {
    const wd = await queue(100n);
    chain.onBlockhash = async () => {
      await prisma.withdrawal.update({ where: { id: wd.id }, data: { status: "rejected" } });
    };
    const stats = await engine().cycle();
    expect(stats.skipped).toBe(1);
    expect((await row(wd.id)).status).toBe("rejected");
    expect(chain.sendCalls).toBe(0);
  });

  it("lets only one of two workers send the same row", async () => {
    const wd = await queue(100n);
    await Promise.all([engine().cycle(), engine().cycle()]);
    expect((await row(wd.id)).status).toBe("sent");
    expect(chain.broadcast.size).toBe(1);
  });

  it("leaves another worker's in-flight transaction alone", async () => {
    // Worker B has been up a long time. Worker A broadcasts; B must not decide
    // A's transaction is dead just because B has never heard of it.
    chain.mode = "drop";
    const b = engine();
    await b.cycle();
    const a = engine({ watchMs: 2_000 });
    const wd = await queue(100n);
    await a.cycle();
    const signature = (await row(wd.id)).signature!;
    chain.height += BLOCKHASH_LIFETIME - 5; // still valid: A's transaction can land
    await b.cycle();
    await b.cycle();
    const mid = await row(wd.id);
    expect(mid.status).toBe("processing");
    expect(mid.signature).toBe(signature);
  });

  it("opens the recipient's token account only when told to", async () => {
    await queue(100n);
    await engine({ createTokenAccounts: false }).cycle();
    const [tx] = [...chain.broadcast.values()];
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions[0].programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it("claims nothing until the mint exists", async () => {
    chain.mintExists = false;
    const wd = await queue(100n);
    await engine().cycle();
    expect((await row(wd.id)).status).toBe("pending");
    expect(chain.sendCalls).toBe(0);
  });

  it("recognises a preflight rejection and nothing else as proof of no broadcast", () => {
    expect(isPreflightRejection(new Error("Simulation failed. \nMessage: Transaction simulation failed: Blockhash not found"))).toBe(true);
    expect(isPreflightRejection(new Error("fetch failed"))).toBe(false);
    expect(isPreflightRejection(new Error("503 Service Unavailable"))).toBe(false);
    expect(isPreflightRejection(new Error("The operation was aborted due to timeout"))).toBe(false);
    expect(isPreflightRejection(undefined)).toBe(false);
  });
});
