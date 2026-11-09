# Taking over Other World Projex ($OWP)

A practical handoff for the next developer. This is the **operator's guide** — the
non-obvious knowledge, mental models, and runbook. For the product/architecture
overview read `README.md`; for the raw deploy checklist read `DEPLOY.md`; every
env var is documented in `.env.example`. This file is what those don't tell you.

**What it is:** a production Solana gaming app. Players deposit $OWP to the
house wallet and get an in-app balance. They play provably-fair games (Frog
Flip, Pond Dice, Blackjack, plus free arcade games Hopper / Frogris / Worm),
bid in auctions, and hunt bounties paid in $OWP. Withdrawals are requested in
the app and paid automatically from that same wallet.
It is **live in production** on Vercel + Neon + Solana mainnet.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Prisma 6 +
Postgres (Neon) · @solana/web3.js + wallet-adapter · an Anchor program in
`program/` for SOL custody.

---

## 1. Read this before you touch anything — the five landmines

These are the things that are NOT obvious from the code and will cost you a day
each if you learn them the hard way. They are why the app broke repeatedly during
its build-out.

### 1.1 The $OWP mint, and do not hardcode its token program
The launched mint is `GE8JGUE6ssrnFh4FSv9iwniYCwucB15PupT97uVRpump`
(`src/lib/owp-mint.ts`). `OWP_MINT` and `NEXT_PUBLIC_OWP_MINT` override it.
Do not point either at the retired Ribbit mint
`EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump`.

Pump.fun `create_v2` coins are Token-2022. Older coins are classic SPL. The
server, the browser, and the payout worker read the mint account's owner and
pass that program id into every ATA and transfer. Do not hardcode
`TOKEN_2022_PROGRAM_ID` again. Until the mint account exists on mainnet,
buys, deposits, and payouts fail closed.

Buys (`POST /api/owp/buy`): the user sends SOL to the house wallet. The
server prices it from the pump.fun bonding curve (spot, not a curve swap;
Dexscreener only after the curve migrates) and queues a `Withdrawal` of kind
`buy`. The payout worker sends $OWP from that same wallet. Rejecting a buy
does not credit app balance, and the SOL stays in the house wallet. The
private key stays on the payout box, never on Vercel.

There is no staking pool and no Meteora pool. `STAKE_POOL_ADDRESS` is not
read. Do not point the site at an old pool, and do not link `@OWProjex` —
that X account is not this project's. The product statement is
`WHITEPAPER.md`: the team does not trade the house wallet to move the
market, and the cut on Frog Flip and Pond Dice is the 4% house edge.

### 1.2 This is a **modified** Next.js 16 (see `AGENTS.md` / `CLAUDE.md`)
APIs, conventions, and file layout can differ from the Next.js you know and from
your training data. **Read the relevant guide in `node_modules/next/dist/docs/`
before writing framework code**, and heed deprecation notices. Don't assume.

### 1.3 Vercel environment variables are **write-only**
`vercel env pull` returns 11-character bracketed *placeholders*, not the real
values. **Never** pull env and re-push it — you will overwrite real secrets with
placeholders. (This once locked the owner out of `/admin` by clobbering
`ADMIN_WALLETS`.) To change one var, set that one var explicitly. `NEXT_PUBLIC_*`
vars are baked in at **build** time, so changing them requires a redeploy to take
effect.

### 1.4 Deploys: push to `main` auto-deploys — but always verify
The repo is git-connected to Vercel; pushing `main` builds and ships production
(this is the normal path). After EVERY deploy run `node scripts/prod-smoke.mjs`
— never assume. The CLI (`npx vercel deploy --prod --yes`) remains available to
ship a build without pushing (e.g. for review) or if the webhook ever misses.

### 1.5 Live-data GET routes need `export const dynamic = "force-dynamic"`
Any route that reads current DB state must opt out of static caching or it will
serve stale data. Routes that read cookies (auth) force dynamic automatically;
the rest must declare it. Grep for it — most API routes have it.

---

## 2. Local development

```bash
git clone https://github.com/mivor7/otherworld-projex.git
cd otherworld-projex
cp .env.example .env                    # fill in DATABASE_URL + SESSION_SECRET at minimum
npm install                             # runs `prisma generate` on postinstall
npm run db:deploy                       # apply migrations to your DB
npm run db:seed                         # optional: seed auctions + episode contracts
DEV_FAUCET=true NEXT_PUBLIC_DEV_FAUCET=true npm run dev
```

Open http://localhost:3000. With the dev faucet on you can sign in with any
wallet (Phantom/Solflare/Backpack), grab 100 free credits on `/games`, and play
without spending real tokens. **`DEV_FAUCET` must never be set in production** —
the faucet route also hard-refuses when `NODE_ENV=production`, but don't rely on
that alone.

You can point local dev at the **production Neon DB** (the app has a single prod
database). Be careful: there is no staging DB. If you do, you're touching live
data. Prefer a separate Neon branch for development.

---

## 3. The mental models

### 3.1 The economy (money in)
- Users **deposit $OWP**. The transfer goes to the house wallet and is
  verified on-chain (`POST /api/deposits/verify`). The full amount credits
  `User.ribbitBalance`. There are no chips and no burn-to-play.
- Users can **buy $OWP** with SOL (`POST /api/owp/buy`). That SOL lands in
  the house wallet. The payout is $OWP at the live pump.fun price, queued as
  a `Withdrawal` kind `buy`. It does not credit `ribbitBalance`. Pausing
  deposits does not pause this buy.
- Games and bids spend that balance. `adjustOwp` moves whole tokens and
  refuses a debit that would eat $OWP locked in bids. The ledger
  (`src/lib/credits.ts`) is append-only. **Respect that pattern.**
- A withdrawal request debits the unlocked balance and queues a `Withdrawal`.
  The payout worker sends it. The house edge stays in the wallet because only
  the payout, not the full wager, is credited back.
- Games have a configurable **house edge** (`HOUSE_EDGE`, default 4%).

### 3.2 The bounty engine — read `src/lib/bounty.ts`
This is the most-iterated, most-subtle subsystem. The final design:

- Credit-game bounties are **rake-funded pots** (owner-approved redesign,
  2026-07-27 — it replaced a gross-wager trigger whose margin knob could never
  track real revenue). A pot has a **prize** (the target) and an optional
  **seed** (`Bounty.seedRibbit`, the house's declared head start = its only
  cost per fill). The pot earns `bountyPotShare × houseEdge` $OWP per 1 $OWP
  wagered (defaults 0.5 × 0.04 = 0.02) and pays the moment it reaches the prize. If the bounty's
  **`autoRenew`** switch is on (the default; editable live in the admin
  create/edit forms) a fresh round opens automatically with the same
  prize/seed and **`round` + 1** (rounds are auto-numbered and shown to
  players everywhere); switched off, the round is final and the table waits
  for a new bounty. Arcade weeklies renew the same way.
  The public mechanics live on `/bounties#how-pots-work` with the live
  numbers — keep that section truthful if the formula ever changes.
- The fill threshold (`requiredCreditSpend(prize, seed)`) is derived
  server-side and re-derived whenever prize/seed/economy settings change.
  Solvency is structural: when the meter fills, the house has collected the
  funded portion `1/potShare` times over, so **every fill leaves the house
  ahead** (minus only the seed it chose). A pot that never fills costs
  nothing.
- The meter still counts **gross wager** (monotonic — the bar only rises,
  the owner's hard requirement). Each wagered $OWP advances the pot by
  `bountyPotShare × houseEdge`.
- **Eligibility (anti-sybil), in `src/lib/ranked.ts`.** To share a prize a wallet
  must (1) have deposited ≥ `RANKED_MIN_BURNED_RIBBIT` $OWP *lifetime*, and
  (2) deposited ≥ `RANKED_MIN_WINDOW_BURNED_RIBBIT` *inside the bounty window*.
  Rule 2 is the sybil multiplier: splitting play over N wallets costs N× fresh
  deposits every window. Set either to 0 to disable it.
  Table bounties also require `RANKED_MIN_TABLE_VOLUME` whole $OWP wagered and a
  **net-positive** result to win.
- Winners are paid **pro-rata** by performance (net $OWP / score), summing to
  exactly the prize. Payout is queued as a `Withdrawal` (kind `bounty`) — same
  hardened, human-gated payout path as balance withdrawals. Nothing is ever paid
  from the web server.
- `BOUNTY_AUTO_PAY` gates all automatic settlement. While it's off, nothing
  auto-pays and admins award manually. Auto-settlement is **lazy** — it fires on
  reads (e.g. the bounties list) like auction settlement.
- **One open bounty per game** is enforced (server 409 + disabled create button).
  Two on one game breaks the meter (a game page shows only one) and the economy
  (both fill from the same play and both pay). To swap, close/cancel the current
  one first.

### 3.3 Provable fairness — read `src/lib/fairness.ts`
Commit–reveal: the server publishes `hash(serverSeed)` before you play, the
outcome is `HMAC-SHA256(serverSeed, clientSeed:nonce)`, and the seed is revealed
after so anyone can verify at `/fairness`. Don't break the commit-before-play
ordering. Arcade leaderboards use signed single-use run tokens + score/elapsed
sanity checks to deter spoofing.

### 3.4 What players see (recently added)
- The game-page bounty panel (`src/components/bounty-standings.tsx`) shows a
  signed-in player, **up front**, whether they're eligible and if not exactly
  which rule is unmet (with a Deposit CTA) — so nobody grinds a bounty they
  can't win.
- The **account page** shows a live **"Bounty winnings"** ledger (settled prizes
  + payout status via `/api/me/bounties`) and a real-time **"Your live bounty
  standings"** board (rank among all players, net/score, and — only when they're
  actually in line to be paid — their projected pro-rata share; polling
  `/api/me/bounties/live` every 8s) so a player who stopped playing can still see
  where they stand and watch a share they're in line for move. A projected
  payout is never shown as a blanket "reward waiting" — only to players actually
  positioned to win it.

---

## 4. Repo map

```
src/app/            pages: games/, auctions/, bounties/, treasury/, fairness/,
                    account/, admin/, leaderboard/, about/
src/app/api/        route handlers, grouped by domain (see below)
src/lib/            all business logic (see below)
src/components/     wallet/session providers, navbar, UI kit, game hooks
prisma/             schema.prisma, migrations/, seed.mjs
scripts/            payout worker, e2e suites, smoke test, data utilities
program/            Anchor treasury vault (SOL custody, daily cap, multisig)
```

**`src/lib/` — where the logic lives:**
| File | Responsibility |
| --- | --- |
| `config.ts` / `client-config.ts` | env → typed config; `toRaw`/`fromRaw` (6-dp $OWP) |
| `settings.ts` | `houseConfig()` — live-tunable settings (HouseSetting table, 10s cache) |
| `db.ts` | Prisma client + `jsonSafe` (BigInt-safe JSON) |
| `api.ts` | `handler`/`ok`/`err`/`requireSession`/`requireAdmin` wrappers |
| `credits.ts` | append-only credits ledger, atomic guards |
| `fairness.ts` | commit–reveal engine |
| `games.ts`, `blackjack.ts`, `*-sim.ts` | per-game logic |
| `bounty.ts` | bounty ranking, triggers, pro-rata payout, auto-settle |
| `ranked.ts` | prize-board eligibility (burn/spend gates), bounty pool budget |
| `solana.ts` | on-chain verification + treasury/wallet balance reads (token program detected from the mint) |
| `session.ts` | ed25519 sign-in, JWT cookie, admin check |
| `ratelimit.ts` | request throttling |

**`src/app/api/` domains:** `auth`, `burn`, `deposits`, `owp`, `credits`, `games`,
`arcade`, `auctions`, `listings`, `bounties`, `withdrawals`, `treasury`,
`leaderboard`, `activity`, `me`, `config`, `upload`, `dev`, and `admin/*`
(`overview`, `settings`, `bounties`, `bounty-review`, `auctions`, `applications`,
`users`, `withdrawals`).

---

## 5. Money architecture

The app is **semi-custodial**. The owner's decision: **one wallet** is the
admin wallet, the treasury, and the payout signer. Do not split them back apart.

1. **The web app holds NO private keys.** It verifies incoming deposits and
   queues outgoing withdrawals as `Withdrawal` rows.
2. **One house wallet.** Deposits of $OWP land in this wallet and credit the
   in-app balance. Withdrawals leave from it. Set `ADMIN_WALLETS` to that
   pubkey. `TREASURY_WALLET` and `PAYOUT_WALLET` fall back to the first admin
   wallet when they are unset — set all three public addresses to the same
   pubkey so the site, the worker, and Phantom agree. The browser learns the
   address from `/api/config` when `NEXT_PUBLIC_TREASURY_WALLET` is empty.
   `/treasury` shows the on-chain balance.
3. **The payout box holds that wallet's key.** `PAYOUT_WALLET_KEY` (preferred),
   a systemd credential named `payout-wallet`, or `PAYOUT_KEYPAIR_PATH`
   (`chmod 600`, never in a repo). This is deliberate: the Phantom wallet is
   the treasury and the signer. A stolen payout box can move the whole
   treasury. **Never put the private key in Vercel.**
4. **Big payouts wait for a human.** Withdrawals above `MAX_PAYOUT_OWP`
   (default 1,000,000 whole tokens) are not auto-sent; an admin processes
   them in `/admin`. SOL buys use `MAX_BUY_OWP` (default 1,000,000,000),
   because a small SOL buy is already more than the withdrawal cap at the
   launch price. "Pay now" signs from the connected admin wallet, which is
   this same wallet.
5. SOL custody is a separate Anchor program in `program/` (multisig admin +
   on-chain daily cap). **It ships with tests but has NOT been audited.** It
   is not the $OWP wallet.

---

## 6. Configuration: env vs. live House controls

Two layers:
- **Env vars** (`.env.example` documents all) set the **defaults** and the things
  that can't change at runtime (RPC, mint, secrets, treasury address, admin list).
- **House controls** in `/admin` write to the `HouseSetting` table and override
  the numeric economy knobs **live** (house edge, wager limits, bounty share,
  eligibility thresholds, auto-pay switch, and a
  remote "pause payout worker" switch). `houseConfig()` reads them with a ~10s
  cache and re-clamps to safe bounds. So most economy tuning happens in the admin
  UI, not by redeploying.

Before a real launch: `ADMIN_WALLETS`, `TREASURY_WALLET`, `PAYOUT_WALLET`, and
`NEXT_PUBLIC_TREASURY_WALLET` should all be the same pubkey. The mint defaults
to the published $OWP address; set `OWP_MINT` / `NEXT_PUBLIC_OWP_MINT` only to
override it. Reset any test-override House settings, and raise
`RANKED_MIN_WINDOW_BURNED_RIBBIT` from any low test value to a meaningful bar.

---

## 7. The deploy runbook (memorize this)

The git webhook is unreliable, so deploys are explicit. The Vercel CLI is authed
as **uwxsgs**, project **uwxsgs-projects/otherworld-projex**, production alias
**otherworld-projex.vercel.app** (custom domain: otherworldprojex.xyz).

```bash
# 1. Verify locally first
npm run lint
npm run build

# 2. Deploy to production (note the deployment URL it prints)
npx vercel deploy --prod --yes

# 3. Point the stable alias at the new deployment (webhook won't do this)
npx vercel alias set <new-deployment-url> otherworld-projex.vercel.app

# 4. Smoke-test live prod (22 checks against the real site)
node scripts/prod-smoke.mjs

# 5. Only then commit + push (commits are authored as R, the mivor7 account)
git add -A
git -c user.name="R" -c user.email="43555740+mivor7@users.noreply.github.com" \
  commit -m "..."
git push
```

`vercel-build` runs `prisma migrate deploy && next build`, so **committed
migrations apply automatically on deploy** — no manual migration step in prod.

---

## 8. Operating the app

### The admin panel (`/admin`, gated by `ADMIN_WALLETS`)
- **House controls** — live-tune all economy knobs (see §6), toggle auto-pay,
  pause the payout worker.
- **Bounty management** — create/edit/delete/close/award bounties; one-open-per-
  game enforced; shows award counts.
- **Payouts** — process queued withdrawals directly ("Pay now" signs from the
  connected admin wallet), or mark ones paid elsewhere. Shows the
  house-wallet float.
- **Users / auctions / applications** — moderation, ban, listing review.

### The payout worker (`scripts/payout-worker.mjs`)
A long-running Node process: every `PAYOUT_INTERVAL_MS` (~15s) it polls the
shared Neon DB for pending `Withdrawal` rows and sends them from the house
wallet. It needs that wallet's key (`PAYOUT_WALLET_KEY` or
`PAYOUT_KEYPAIR_PATH`), the `.env` (`DATABASE_URL`, `SOLANA_RPC_URL`), and
internet. `OWP_MINT` is optional — the published mint is the fallback. The
worker reads the mint's token program itself and waits, rather than exiting,
if the mint account is not on mainnet yet. SOL buys (kind `buy`) auto-send
up to `MAX_BUY_OWP`. Run it on any always-on box — **systemd**
(auto-restart on boot/crash, recommended for launch), **pm2**, or **tmux**
(testing only; dies on reboot). It's optional: you can skip it entirely and
clear payouts by hand in `/admin`. The key on this box is the treasury key.

### Data utilities in `scripts/`
- `prod-smoke.mjs` — 22-check live verification. Run after every deploy.
- `reset-bounties.mjs`, `purge-test-data.mjs` — housekeeping.
- `*-e2e.mjs` — see §9 (caution: they hit the real DB).

---

## 9. Testing

- **`scripts/prod-smoke.mjs`** — the reliable one. ~32 checks against live
  prod; run it after every deploy.
- **`economy-e2e.mjs`, `games-e2e.mjs`, `admin-e2e.mjs`, `waitlist-e2e.mjs`** — end-to-end suites,
  self-cleaning (they create test users/bounties and delete them in a `finally`
  block, and park/restore any standing open bounties). Run with a base URL, e.g.
  `node scripts/economy-e2e.mjs https://otherworld-projex.vercel.app`.
  - They compute expected bounty triggers from the app's live formula, so they
    track the credit price/split/margin — no hardcoded thresholds.
  - ⚠️ They hit the **production Neon DB** (the app's only DB) — don't run them
    while someone is playing/testing. They self-clean, but pick a quiet window.
  - Every suite **pauses payouts** (`payoutsPaused` house setting) for its run
    and restores the owner's exact setting afterward, so a live payout worker
    can never pay a suite-created withdrawal on-chain. Real user withdrawals
    queued during a run are simply paid on the next worker pass after it ends.
    If a run is killed hard mid-cleanup, payouts may be left paused — flip the
    switch back in /admin House controls.
  - `admin-e2e.mjs` needs `TEST_ADMIN_KEYPAIR` (JSON `{wallet, secret}` of an
    admin wallet) — the owner holds it.
  - Last verified green against prod: economy 20/20, games 34/34.

There is no unit-test harness. Type-checking (`npm run build`) and lint are the
first line of defense; the smoke test is the second.

---

## 10. Known limitations & open work

- **Auction house is still under development** — the page carries an "under
  development" notice. The bidding/escrow backend exists; the front-of-house UX
  is unfinished.
- **Semi-custodial** (§5). SPL escrow with on-chain refunds would be the next
  hardening step if volume grows.
- **The Anchor program is unaudited.** Get it audited before it holds meaningful
  SOL.
- **Gambling compliance is jurisdiction-specific.** Wagering $OWP is a legal
  gray area in many places — get advice before marketing this as real-money
  gaming.
- **Treasury solvency is a manual responsibility.** Keep enough $OWP in the
  treasury to cover queued withdrawals and bounty pools; `/treasury` shows both
  sides.

---

## 11. Secrets, access, and who owns what

- **Secrets are NOT in this repo.** They live in Vercel (write-only) and with the
  owner. `.env.example` names them; get real values from the owner.
- **The house wallet** is one pubkey: admin, treasury, and payout. Get it
  from the owner. This guide intentionally omits private keys and specific
  operational addresses. The mint address is not in the repo until launch.
- **Never commit** a `.env`, a keypair file, or any secret. Never place a private
  key in Vercel.
- The owner controls Vercel, Neon, the domain registrar, the treasury multisig,
  and the token. You'll need them to grant access to each.

---

*When something behaves inexplicably on-chain, your first suspect is the mint's
token program (§1.1). When a deploy "didn't take," your first suspect is the alias step (§7).
When the numbers look off, read `bounty.ts` and `ranked.ts` before assuming a bug
— the economy is more deliberate than it looks.*
