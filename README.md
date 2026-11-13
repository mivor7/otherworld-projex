# Other World Projex — $OWP Bounty Arcade

![Solana](https://img.shields.io/badge/Solana-Mainnet-purple?logo=solana)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-teal?logo=prisma)
![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red)

**[🌐 otherworldprojex.xyz](https://www.otherworldprojex.xyz)**

Bounty arcade on Solana. Deposit **$OWP** to the house wallet, play and bid
from the in-app balance, hunt bounties, and withdraw anytime. The same wallet
pays out automatically.

The team does not trade that wallet to move the $OWP market. People buy and
sell the token themselves, and they win or lose it on the games. On Frog Flip
and Pond Dice the only cut is a **4% house edge**. The source is public so
the rules can be read. That is not a license to copy the app. Read
[`WHITEPAPER.md`](WHITEPAPER.md) and [`COPYRIGHT`](COPYRIGHT).

> **Taking over the project?** Start with [`ONBOARDING.md`](ONBOARDING.md) — the
> operator's handoff (gotchas, mental models, deploy + payout runbook).

## Ownership

mivor7 wrote the software in this repository. The full notice is
[`COPYRIGHT`](COPYRIGHT). All rights reserved. Publishing the source is not
a license to copy it, to deploy it, or to run a site or a token on it.

The deployment mivor7 runs is
[https://www.otherworldprojex.xyz](https://www.otherworldprojex.xyz). The
only token that deployment uses is $OWP, at the mint published in
[`COPYRIGHT`](COPYRIGHT).

mivor7 does not run otherworldprojex.io or otherworldprojex.com. The
deployment above is not affiliated with them or with any token offered
through them. The X account `@OWProjex` (`https://x.com/OWProjex`) is not an
account of that deployment.

Git history in this repository starts on 15 July 2026. The first commit is
authored `m <msl.tvc@gmail.com>`. The same day includes commits authored
`OWP Build <dev@otherworldprojex.com>`. The bulk of the history is authored
`q33wx <43555740+q33wx@users.noreply.github.com>` — that noreply id is this
same GitHub user, id 43555740. Current commits are authored
`R <43555740+mivor7@users.noreply.github.com>`. The GitHub repository was
created on 21 September 2026 under mivor7. This note records that history.
It is not a court order.

- **Games**: tables — Frog Flip (coinflip), Pond Dice (roll-under),
  Blackjack, wagered in whole $OWP; free arcade — Hopper, Frogris, Worm Frog.
  Commit–reveal fairness — every round independently verifiable at `/fairness`.
- **Balance**: a deposit transfers $OWP to the house wallet and credits the
  app. Withdrawal requests are paid by the payout worker from that wallet.
- **Auction house**: bid $OWP from the same balance on house or community listings.
  Escrowed bids, instant refunds on outbid, anti-snipe extensions, and a
  community "apply to list" flow with admin review.
- **Bounties**: fixed $OWP prizes. A table pool fills from a share of the
  house edge (`bountyPotShare × houseEdge` $OWP per 1 $OWP wagered) and pays
  when the pot reaches the prize. Free arcade pools pay weekly. One open
  bounty per game; every eligible winner is paid pro-rata, automatically.
- **Treasury**: live on-chain balances at `/treasury`; SOL custody via a small
  Anchor program with multisig admin + daily payout cap (`program/`).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Prisma + Postgres (Neon)
· @solana/web3.js + wallet-adapter · Anchor (treasury program).

## Local development

```bash
npm install
cp .env.example .env          # fill in the two Neon DATABASE_URLs
npx prisma migrate dev        # applies migrations to your database
npm run db:seed               # launch auctions + episode contracts
DEV_FAUCET=true NEXT_PUBLIC_DEV_FAUCET=true npm run dev
```

Open http://localhost:3000. With the dev faucet on you can sign in with any
wallet (Phantom/Solflare/Backpack), grab 100 free credits on `/games`, and
play without burning real tokens.

## Architecture in one minute

```
Browser (wallet signs everything; keys never leave the user)
 │  sign-in: ed25519 signature over a server nonce  → JWT cookie
 │  deposit: user transfers $OWP to the house wallet → verified → in-app balance
 │  buy:     user sends SOL to the house wallet → verified → $OWP queued at the Raydium spot
 ▼
Next.js API routes (Vercel serverless)
 │  provably-fair engine: outcome = HMAC-SHA256(serverSeed, clientSeed:nonce)
 │  credits ledger: append-only, atomic, race-guarded
 │  auctions: escrow-locked bids, lazy settlement, anti-snipe
 ▼
Postgres (Prisma)          Solana RPC (verification + live treasury stats)

Money out (never from the web server):
 - scripts/payout-worker.mjs  → $OWP withdrawals, capped per-tx
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

1. **Database**: a Neon Postgres store connected through the Vercel
   marketplace injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`
   (direct, used for migrations) automatically.
2. **Vercel**: import the repo, set the remaining env vars from
   `.env.example` — at minimum `SESSION_SECRET`, a **paid RPC URL** (both the
   server and `NEXT_PUBLIC_` variants), `TREASURY_WALLET`, `ADMIN_WALLETS`.
   The `vercel-build` script runs `prisma migrate deploy` on every deploy.
3. **Domain**: point `otherworldprojex.xyz` at the Vercel project
   (Settings → Domains; update the DNS A/CNAME records at the registrar).
4. **Treasury**: deploy `program/` (see its README), make a
   [Squads](https://squads.so) multisig the admin, set `TREASURY_WALLET` to the
   vault PDA. Until the program is deployed you can start with the multisig
   address itself — deposits/escrow still verify against it.
5. **Payout worker**: run `npm run payout-worker` on a separate box with
   `PAYOUT_WALLET_KEY` set to the house wallet (the same wallet as
   `ADMIN_WALLETS` / `TREASURY_WALLET` / Phantom). `OWP_MINT` overrides the
   published mint; leave it unset to use that default. The worker waits if
   the mint account is not on mainnet yet. You can skip it and pay
   withdrawals by hand in `/admin`. `PAYOUT_INTERVAL_MS` tunes the polling
   cadence; the admin panel's "Pause the payout worker" switch stops it
   remotely. Website buys (`/api/owp/buy`) are SOL in, $OWP out, from this
   same wallet, at the Raydium price.
6. Leave `DEV_FAUCET` **unset** in production (the route also hard-refuses
   when `NODE_ENV=production`).

## Honest limitations (read before launch)

- **Withdrawal/prize payouts are semi-custodial**: deposited $OWP sits in
  the house wallet, and the payout worker signs with that same key. The
  Anchor program hard-limits SOL custody, but SPL escrow with on-chain
  refunds would be the next upgrade if volume grows.
- **The house edge math is transparent but the treasury must stay solvent** —
  keep enough $OWP in the treasury account to cover queued withdrawals and
  bounty pools. `/treasury` shows both sides.
- **Gambling compliance is jurisdiction-specific.** Burn-to-play with
  credit prizes sits in a gray zone in many places; get advice before
  marketing this as real-money gaming.
- The Anchor program ships with tests but **has not been audited**.

## Repo map

```
src/app/            pages (games, auctions, bounties, treasury, fairness,
                    whitepaper, account, admin)
src/app/api/        route handlers (auth, burn, games, auctions, bounties,
                    me, admin…)
src/lib/            config, fairness engine, credits ledger, bounty engine,
                    eligibility, Solana verification
src/components/     wallet/session providers, navbar, UI kit, game hooks
prisma/             schema, migrations, seed
scripts/            payout worker, prod smoke test, e2e suites, data utilities
program/            Anchor treasury vault (SOL custody, daily cap, multisig)
```
