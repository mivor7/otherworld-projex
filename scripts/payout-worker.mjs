// Payout worker — pays queued $RIBBIT withdrawals/prizes from a DEDICATED
// hot wallet (a float the owners top up), NEVER the treasury key. Run it OFF
// the web server (ops box, or a locked-down container) so no deployment ever
// holds a private key:
//
//   PAYOUT_KEYPAIR_PATH=~/payout-hot-wallet.json node scripts/payout-worker.mjs
//
// Safety rails:
//   - MAX_PAYOUT_RIBBIT per withdrawal (default 1,000,000) — bigger ones wait
//     for a human in /admin.
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
} from "@solana/spl-token";

// $RIBBIT is an SPL Token-2022 mint — pass its program id to every ATA
// derivation and transfer or the payout targets the wrong account/program.
const TP = TOKEN_2022_PROGRAM_ID;

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const MINT = new PublicKey(
  process.env.RIBBIT_MINT ?? "EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump"
);
const DECIMALS = Number(process.env.RIBBIT_DECIMALS ?? 6);
const MAX_PAYOUT = BigInt(
  Math.round(Number(process.env.MAX_PAYOUT_RIBBIT ?? 1_000_000) * 10 ** DECIMALS)
);
const INTERVAL_MS = Number(process.env.PAYOUT_INTERVAL_MS ?? 15_000);

// The worker signs with a dedicated PAYOUT HOT WALLET — NOT the treasury.
// Keep only a working float in it, topped up from the treasury (ideally a
// cold/multisig). That way the treasury key never lives on this box, and the
// most this process could ever move is the hot-wallet balance.
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
      "Use a SEPARATE hot wallet funded from the treasury — never the treasury key."
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
const connection = new Connection(RPC, "confirmed");
const fromAta = getAssociatedTokenAddressSync(MINT, signer.publicKey, true, TP);

const payoutWallet = signer.publicKey.toBase58();
console.log(`Payout worker up. Hot wallet: ${payoutWallet}`);
if (process.env.TREASURY_WALLET && process.env.TREASURY_WALLET === payoutWallet) {
  console.warn(
    "⚠ Payout hot wallet == TREASURY_WALLET. For security, use a SEPARATE hot " +
      "wallet and fund it from the treasury, so the treasury key never touches this box."
  );
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
    if (wd.amountRaw > MAX_PAYOUT) {
      console.log(`↷ ${wd.id}: above MAX_PAYOUT, leaving for manual review`);
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
      const toAta = getAssociatedTokenAddressSync(MINT, dest, true, TP);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          signer.publicKey, toAta, dest, MINT, TP
        ),
        createTransferCheckedInstruction(
          fromAta, MINT, toAta, signer.publicKey, wd.amountRaw, DECIMALS, [], TP
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
