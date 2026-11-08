// Payout worker — sends queued $OWP from the house wallet. That wallet is
// the same one that receives deposits and SOL buys: admin, treasury, and
// payout are one key. Run this OFF the web server so Vercel never holds
// the private key:
//
//   PAYOUT_WALLET_KEY='[...]' node scripts/payout-worker.mjs
//
// Safety rails:
//   - MAX_PAYOUT_OWP per withdrawal or prize (default 1,000,000 whole tokens).
//   - MAX_BUY_OWP per SOL purchase (default 1,000,000,000). A launch-curve
//     buy of a fraction of a SOL is already more than the withdrawal cap.
//   - Bigger rows wait for a human in /admin.
//   - Marks the row "sent" with the tx signature before moving on; re-running
//     never double-pays.
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const RPC_FALLBACKS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];
function rpcFetch(primary) {
  const urls = [...new Set([primary, ...RPC_FALLBACKS])];
  return async (_input, init) => {
    let last = null;
    for (const url of urls) {
      const res = await fetch(url, init);
      if (res.status !== 403 && res.status !== 429) return res;
      last = res;
    }
    return last;
  };
}
// Public mint. OWP_MINT overrides it. The retired Ribbit mint is not a fallback.
const OWP_MINT_FALLBACK = "GE8JGUE6ssrnFh4FSv9iwniYCwucB15PupT97uVRpump";
const MINT_ADDRESS = process.env.OWP_MINT || OWP_MINT_FALLBACK;
const MINT = new PublicKey(MINT_ADDRESS);
const INTERVAL_MS = Number(process.env.PAYOUT_INTERVAL_MS ?? 15_000);

// The signer is the house wallet (the same key as admin / treasury / Phantom).
// It can move the whole treasury. Keep it on this box only — never in Vercel.
//
// Key material, in order of preference (never log it, never write it back out):
//   1. PAYOUT_WALLET_KEY        — the keypair JSON array itself, via env /
//                                 secrets manager / `systemd-creds` (no plain
//                                 key file on disk — preferred).
//   2. CREDENTIALS_DIRECTORY    — systemd LoadCredential=payout-wallet:… drops
//                                 the decrypted secret here at service start.
//   3. PAYOUT_KEYPAIR_PATH      — a keypair JSON file (legacy; keep it chmod
//                                 600 and OUT of any repo/backup).
function loadSecretKey() {
  if (process.env.PAYOUT_WALLET_KEY) return process.env.PAYOUT_WALLET_KEY;
  const credDir = process.env.CREDENTIALS_DIRECTORY;
  if (credDir && fs.existsSync(`${credDir}/payout-wallet`)) {
    return fs.readFileSync(`${credDir}/payout-wallet`, "utf8");
  }
  if (process.env.PAYOUT_KEYPAIR_PATH) {
    return fs.readFileSync(process.env.PAYOUT_KEYPAIR_PATH, "utf8");
  }
  return null;
}
const secretJson = loadSecretKey();
if (!secretJson) {
  console.error(
    "No payout hot-wallet key. Provide ONE of: PAYOUT_WALLET_KEY (the keypair " +
      "JSON array, via env/secrets manager), a systemd credential named " +
      "'payout-wallet' (LoadCredential), or PAYOUT_KEYPAIR_PATH (key file). " +
      "This key is the house wallet. Do not put it in Vercel."
  );
  process.exit(1);
}
let signer;
try {
  signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretJson)));
} catch {
  // Deliberately no echo of the value — it's key material.
  console.error("Payout wallet key is not a valid keypair JSON array.");
  process.exit(1);
}

const prisma = new PrismaClient();
const connection = new Connection(RPC, {
  commitment: "confirmed",
  fetch: rpcFetch(RPC),
});

const payoutWallet = signer.publicKey.toBase58();
console.log(`Payout worker up. Wallet: ${payoutWallet}. Mint: ${MINT_ADDRESS}`);
if (process.env.TREASURY_WALLET && process.env.TREASURY_WALLET !== payoutWallet) {
  console.warn(
    "TREASURY_WALLET differs from this signer. The house is meant to be one wallet."
  );
} else {
  console.log("Single-wallet mode: deposits, SOL buys, and payouts use this signer.");
}

// The mint account's owner is the token program. Until that account exists,
// payouts wait in the queue instead of this process exiting.
let mintReady = false;
let tokenProgram = null;
let decimals = Number(process.env.OWP_DECIMALS ?? process.env.RIBBIT_DECIMALS ?? 6);
let fromAta = null;

async function ensureMint() {
  if (mintReady) return true;
  try {
    const info = await connection.getAccountInfo(MINT);
    if (!info || info.data.length < 45) {
      console.error("$OWP mint account is not on mainnet yet — payouts wait.");
      return false;
    }
    const owner = info.owner.toBase58();
    if (owner === TOKEN_PROGRAM_ID.toBase58()) tokenProgram = TOKEN_PROGRAM_ID;
    else if (owner === TOKEN_2022_PROGRAM_ID.toBase58()) tokenProgram = TOKEN_2022_PROGRAM_ID;
    else {
      console.error(`$OWP mint owner ${owner} is not a token program — payouts wait.`);
      return false;
    }
    decimals = info.data[44];
    fromAta = getAssociatedTokenAddressSync(MINT, signer.publicKey, true, tokenProgram);
    mintReady = true;
    console.log(`$OWP mint ready. Decimals ${decimals}. Program ${owner}.`);
    return true;
  } catch (e) {
    console.error(`mint lookup failed: ${e.message}`);
    return false;
  }
}

function wholeToRaw(whole) {
  return BigInt(Math.round(Number(whole) * 10 ** decimals));
}

// Rows stuck in "processing" mean a previous run died between sending and
// marking. NEVER auto-retry those — verify on-chain first, then resolve in
// /admin (mark sent with the signature, or reject to refund).
const limbo = await prisma.withdrawal.findMany({ where: { status: "processing" } });
for (const wd of limbo) {
  console.error(
    `⚠ ${wd.id}: stuck in "processing" (${wd.amountRaw} raw → ${wd.destination}). ` +
      "Check the chain before resolving in /admin."
  );
}

async function processQueue() {
  if (!(await ensureMint())) return;
  const maxPayout = wholeToRaw(process.env.MAX_PAYOUT_OWP ?? process.env.MAX_PAYOUT_RIBBIT ?? 1_000_000);
  const maxBuy = wholeToRaw(process.env.MAX_BUY_OWP ?? 1_000_000_000);
  // Admin kill switch: the queue keeps accepting requests, but nothing is
  // claimed or sent while payouts are paused from the House controls panel.
  const paused = await prisma.houseSetting.findUnique({
    where: { key: "payoutsPaused" },
  });
  if (paused?.value === "true") {
    console.log("⏸ payouts paused from the admin panel — skipping this pass");
    return;
  }
  const pending = await prisma.withdrawal.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  for (const wd of pending) {
    const cap = wd.kind === "buy" ? maxBuy : maxPayout;
    if (wd.amountRaw > cap) {
      console.log(
        `↷ ${wd.id}: above ${wd.kind === "buy" ? "MAX_BUY_OWP" : "MAX_PAYOUT"}, leaving for manual review`
      );
      continue;
    }
    // Claim the row BEFORE touching the chain — if an admin rejected (and
    // refunded) it a moment ago, or another worker instance grabbed it, we
    // must not send. An on-chain payment is irreversible.
    const claimed = await prisma.withdrawal.updateMany({
      where: { id: wd.id, status: "pending" },
      data: { status: "processing" },
    });
    if (claimed.count === 0) {
      console.log(`↷ ${wd.id}: no longer pending, skipping`);
      continue;
    }
    try {
      const dest = new PublicKey(wd.destination);
      const toAta = getAssociatedTokenAddressSync(MINT, dest, true, tokenProgram);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          signer.publicKey, toAta, dest, MINT, tokenProgram
        ),
        createTransferCheckedInstruction(
          fromAta, MINT, toAta, signer.publicKey, wd.amountRaw, decimals, [], tokenProgram
        )
      );
      // Hard ceiling: the public RPC can hang indefinitely (it wedged the
      // whole worker once, mid-claim). After 90s we assume the transaction
      // MAY have been broadcast and stop touching this row automatically.
      const signature = await Promise.race([
        sendAndConfirmTransaction(connection, tx, [signer]),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                Object.assign(
                  new Error("send timed out after 90s — transaction MAY have broadcast"),
                  { maybeSent: true }
                )
              ),
            90_000
          )
        ),
      ]);
      await prisma.$transaction([
        prisma.withdrawal.update({
          where: { id: wd.id },
          data: { status: "sent", signature, processedAt: new Date() },
        }),
        prisma.treasuryEvent.create({
          data: {
            kind: "payout",
            amount: wd.amountRaw,
            asset: "RIBBIT",
            note:
              wd.kind === "bounty"
                ? `Bounty prize → ${wd.destination.slice(0, 4)}…`
                : wd.kind === "buy"
                  ? `Sold $OWP to ${wd.destination.slice(0, 4)}…`
                  : `Withdrawal to ${wd.destination.slice(0, 4)}…`,
            ref: signature,
          },
        }),
      ]);
      console.log(`✓ ${wd.id}: paid ${wd.amountRaw} raw → ${wd.destination} (${signature})`);
    } catch (e) {
      // CRITICAL split: if the transaction may already be on the chain, a
      // retry would PAY TWICE. Confirmation timeouts (web3.js attaches the
      // signature) and our 90s ceiling both mean "maybe broadcast" — keep
      // the row claimed, preserve the signature, and hand it to a human.
      const sig = e?.signature;
      if (sig || e?.maybeSent) {
        if (sig) {
          await prisma.withdrawal.updateMany({
            where: { id: wd.id, status: "processing" },
            data: { signature: sig },
          });
        }
        console.error(
          `⚠ ${wd.id}: ${e.message} — LEFT IN "processing"${sig ? ` (sig ${sig})` : ""}. ` +
            "Verify on-chain, then resolve in /admin (mark sent, or release if nothing landed). Never auto-retried."
        );
        continue;
      }
      // Failed strictly BEFORE broadcast — safe to release for a retry.
      await prisma.withdrawal.updateMany({
        where: { id: wd.id, status: "processing" },
        data: { status: "pending" },
      });
      console.error(`✗ ${wd.id}: ${e.message} — will retry next cycle`);
    }
  }
}

for (;;) {
  await processQueue().catch((e) => console.error("cycle failed:", e.message));
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
