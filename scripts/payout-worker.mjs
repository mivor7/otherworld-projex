// Treasury payout worker — pays queued $RIBBIT withdrawals from the treasury
// token account. Run this OFF the web server (ops box, or a locked-down
// container) so the web deployment never holds the treasury key:
//
//   TREASURY_KEYPAIR_PATH=~/treasury.json node scripts/payout-worker.mjs
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
} from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const MINT = new PublicKey(
  process.env.RIBBIT_MINT ?? "EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump"
);
const DECIMALS = Number(process.env.RIBBIT_DECIMALS ?? 6);
const MAX_PAYOUT = BigInt(
  Math.round(Number(process.env.MAX_PAYOUT_RIBBIT ?? 1_000_000) * 10 ** DECIMALS)
);
const INTERVAL_MS = Number(process.env.PAYOUT_INTERVAL_MS ?? 15_000);

const keypairPath = process.env.TREASURY_KEYPAIR_PATH;
if (!keypairPath) {
  console.error("Set TREASURY_KEYPAIR_PATH to the treasury keypair JSON file.");
  process.exit(1);
}
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
);

const prisma = new PrismaClient();
const connection = new Connection(RPC, "confirmed");
const fromAta = getAssociatedTokenAddressSync(MINT, signer.publicKey, true);

console.log(`Payout worker up. Treasury: ${signer.publicKey.toBase58()}`);

async function processQueue() {
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
    try {
      const dest = new PublicKey(wd.destination);
      const toAta = getAssociatedTokenAddressSync(MINT, dest, true);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          signer.publicKey, toAta, dest, MINT
        ),
        createTransferCheckedInstruction(
          fromAta, MINT, toAta, signer.publicKey, wd.amountRaw, DECIMALS
        )
      );
      const signature = await sendAndConfirmTransaction(connection, tx, [signer]);
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
            note: `Withdrawal to ${wd.destination.slice(0, 4)}…`,
            ref: signature,
          },
        }),
      ]);
      console.log(`✓ ${wd.id}: paid ${wd.amountRaw} raw → ${wd.destination} (${signature})`);
    } catch (e) {
      console.error(`✗ ${wd.id}: ${e.message} — will retry next cycle`);
    }
  }
}

for (;;) {
  await processQueue().catch((e) => console.error("cycle failed:", e.message));
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
