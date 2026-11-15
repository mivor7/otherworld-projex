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
//   - Bigger rows wait for a human in /admin. They do not hold up the rows
//     behind them.
//   - Every payout's signature is recorded BEFORE it is broadcast, and a row
//     is only re-sent once its previous transaction is proven dead on-chain.
//     A crash, a timeout, or a flaky RPC never causes a second payment. The
//     rules live in scripts/payout-core.mjs.
//   - PAYOUT_CREATE_TOKEN_ACCOUNTS=false stops the house paying the rent
//     (~0.002 SOL) to open a recipient's missing $OWP account. Those payouts
//     then wait until the recipient opens one. Leave it unset unless someone
//     is farming that rent by closing their account between withdrawals.
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createPayoutEngine } from "./payout-core.mjs";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const RPC_FALLBACKS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
];
// A hung RPC call must not wedge the worker (it did once, mid-claim), so
// every request has a deadline. A request that times out or is refused moves
// on to the next endpoint. Repeating a send on another endpoint is safe: it
// is the same signed transaction, and the network accepts it at most once.
const RPC_TIMEOUT_MS = 20_000;
function rpcFetch(primary) {
  const urls = [...new Set([primary, ...RPC_FALLBACKS])];
  return async (_input, init) => {
    let last = null;
    let failure = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) });
        if (res.status !== 403 && res.status !== 429) return res;
        last = res;
      } catch (e) {
        failure = e;
      }
    }
    if (last) return last;
    throw failure ?? new Error("no RPC endpoint answered");
  };
}
// Public mint. OWP_MINT overrides it. The retired Ribbit mint is not a fallback.
const OWP_MINT_FALLBACK = "w63qPqQwjjgtCkgypRTCTMeWH9vfJaH6xtFGJpTAray";
const MINT_ADDRESS = process.env.OWP_MINT || OWP_MINT_FALLBACK;
const MINT = new PublicKey(MINT_ADDRESS);
const whole = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
// At least a second between passes, whatever the env says.
const INTERVAL_MS = Math.max(1_000, whole(process.env.PAYOUT_INTERVAL_MS, 15_000));

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

const engine = createPayoutEngine({
  prisma,
  connection,
  signer,
  mint: MINT,
  options: {
    maxPayoutWhole: whole(process.env.MAX_PAYOUT_OWP ?? process.env.MAX_PAYOUT_RIBBIT, 1_000_000),
    maxBuyWhole: whole(process.env.MAX_BUY_OWP, 1_000_000_000),
    createTokenAccounts: process.env.PAYOUT_CREATE_TOKEN_ACCOUNTS !== "false",
    fallbackDecimals: whole(process.env.OWP_DECIMALS ?? process.env.RIBBIT_DECIMALS, 6),
  },
});

// "processing" rows with a signature are settled by the engine from chain
// state. Rows WITHOUT one were claimed by an admin's "Pay now" and never
// finished — only that admin knows whether money moved.
const adminClaims = await prisma.withdrawal.findMany({
  where: { status: "processing", signature: null },
});
for (const wd of adminClaims) {
  console.error(
    `⚠ ${wd.id}: claimed in /admin but never marked sent (${wd.amountRaw} raw → ${wd.destination}). ` +
      "Check the chain, then mark it sent or release it in /admin."
  );
}

for (;;) {
  await engine.cycle().catch((e) => console.error("cycle failed:", e.message));
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
