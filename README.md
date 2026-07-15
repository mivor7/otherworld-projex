# Other World Projex — $RIBBIT Bounty Arcade 🐸

Decentralized gaming platform on Solana: burn **$RIBBIT** to play
provably-fair games, bid in community auctions, hunt bounties — all backed by
one transparent treasury.

- **Games**: Frog Flip (coinflip), Pond Dice (roll-under), Hopper (free arcade).
  Commit–reveal fairness — every round independently verifiable at `/fairness`.
- **Burn-to-play**: users burn $RIBBIT from their own wallet; the burn is
  verified on-chain and converted to play credits. Supply only goes down.
- **Auction house**: bid deposited $RIBBIT on house or community listings.
  Escrowed bids, instant refunds on outbid, anti-snipe extensions, and a
  community "apply to list" flow with admin review.
- **Bounties**: weekly leaderboard pools + one-off challenges, funded by the
  house take (50% treasury / 30% prize pools / 20% ops — configurable).
- **Treasury**: live on-chain balances at `/treasury`; SOL custody via a small
  audited-by-design Anchor program with multisig admin + daily payout cap
  (`program/`).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Prisma (SQLite dev /
Postgres prod) · @solana/web3.js + wallet-adapter · Anchor (treasury program).

## Local development

```bash
npm install
cp .env.example .env          # defaults work out of the box
npx prisma migrate dev        # creates dev.db
npm run db:seed               # demo auctions + bounties
DEV_FAUCET=true NEXT_PUBLIC_DEV_FAUCET=true npm run dev
```

Open http://localhost:3000. With the dev faucet on you can sign in with any
wallet (Phantom/Solflare/Backpack), grab 100 free credits on `/games`, and
play without burning real tokens.

## Architecture in one minute

```
Browser (wallet signs everything; keys never leave the user)
 │  sign-in: ed25519 signature over a server nonce  → JWT cookie
 │  burn:    user burns $RIBBIT  → POSTs tx sig     → server verifies on-chain → credits
 │  deposit: user transfers to treasury ATA → POSTs tx sig → verified → bid balance
 ▼
Next.js API routes (Vercel serverless)
 │  provably-fair engine: outcome = HMAC-SHA256(serverSeed, clientSeed:nonce)
 │  credits ledger: append-only, atomic, race-guarded
 │  auctions: escrow-locked bids, lazy settlement, anti-snipe
 ▼
Postgres (Prisma)          Solana RPC (verification + live treasury stats)

Money out (never from the web server):
 - scripts/payout-worker.mjs  → $RIBBIT withdrawals, capped per-tx
 - program/ (Anchor vault)    → SOL custody: multisig admin + on-chain daily cap
```

### Security model

| Threat                        | Defense                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Server rigs game outcomes     | Commit–reveal: seed hash published before play, verifiable after   |
| Replayed/faked burn or deposit| On-chain verification + unique tx-signature constraint             |
| Double-spend race on credits  | Guarded atomic decrements inside DB transactions                   |
| Stolen web-server credentials | Treasury key never on the server; program caps daily SOL outflow   |
| Bid sniping                   | 2-minute anti-snipe extension window                               |
| Leaderboard spoofing          | Signed single-use run tokens + elapsed-time/score sanity checks    |

## Deploying to production (Vercel + same domain)

1. **Database**: create a Postgres DB (Vercel Postgres / Neon / Supabase).
   In `prisma/schema.prisma` change `provider = "sqlite"` → `"postgresql"`,
   then `npx prisma migrate dev --name init-pg` locally against it once.
2. **Vercel**: import the repo, set env vars from `.env.example` —
   at minimum `DATABASE_URL`, `SESSION_SECRET`, a **paid RPC URL** (both the
   server and `NEXT_PUBLIC_` variants), `TREASURY_WALLET`, `ADMIN_WALLETS`.
   Build command: `prisma migrate deploy && next build`.
3. **Domain**: point `otherworldprojex.com` at the Vercel project
   (Settings → Domains; update the DNS A/CNAME records at the registrar).
4. **Treasury**: deploy `program/` (see its README), make a
   [Squads](https://squads.so) multisig the admin, set `TREASURY_WALLET` to the
   vault PDA. Until the program is deployed you can start with the multisig
   address itself — deposits/escrow still verify against it.
5. **Payout worker**: run `npm run payout-worker` on a separate box with
   `TREASURY_KEYPAIR_PATH` (or skip it and pay withdrawals manually in
   `/admin` — every payout is queued, nothing moves without a signature).
6. Leave `DEV_FAUCET` **unset** in production (the route also hard-refuses
   when `NODE_ENV=production`).

## Honest limitations (read before launch)

- **Withdrawal/prize payouts are semi-custodial**: $RIBBIT the users deposit
  for auctions sits in the treasury token account, and payouts are made by the
  ops keypair/multisig. The Anchor program hard-limits SOL custody, but SPL
  escrow with on-chain refunds would be the next upgrade if volume grows.
- **The house edge math is transparent but the treasury must stay solvent** —
  keep enough $RIBBIT in the treasury account to cover queued withdrawals and
  bounty pools. `/treasury` shows both sides.
- **Gambling compliance is jurisdiction-specific.** Burn-to-play with
  credit prizes sits in a gray zone in many places; get advice before
  marketing this as real-money gaming.
- The Anchor program ships with tests but **has not been audited**.

## Repo map

```
src/app/            pages (games, auctions, bounties, treasury, fairness, admin)
src/app/api/        route handlers (auth, burn, games, auctions, admin…)
src/lib/            config, fairness engine, credits ledger, Solana verification
src/components/     wallet/session providers, navbar, UI kit
prisma/             schema, migrations, seed
scripts/            payout worker
program/            Anchor treasury vault (SOL custody, daily cap, multisig)
```
