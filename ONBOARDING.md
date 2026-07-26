# Taking over Other World Projex ($RIBBIT)

A practical handoff for the next developer. This is the **operator's guide** — the
non-obvious knowledge, mental models, and runbook. For the product/architecture
overview read `README.md`; for the raw deploy checklist read `DEPLOY.md`; every
env var is documented in `.env.example`. This file is what those don't tell you.

**What it is:** a production Solana gaming app. Users buy play-credits with the
$RIBBIT token (part burned, part to the house treasury), play provably-fair
games (Frog Flip, Pond Dice, Blackjack, plus free arcade games Hopper / Frogris
/ Worm), bid in auctions, and hunt fixed-prize bounties paid in real $RIBBIT.
It is **live in production** on Vercel + Neon + Solana mainnet.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Prisma 6 +
Postgres (Neon) · @solana/web3.js + wallet-adapter · an Anchor program in
`program/` for SOL custody.

---

## 1. Read this before you touch anything — the five landmines

These are the things that are NOT obvious from the code and will cost you a day
each if you learn them the hard way. They are why the app broke repeatedly during
its build-out.

### 1.1 $RIBBIT is an SPL **Token-2022** token — not a classic SPL token
This is the single biggest gotcha. The mint
`EVHtwfyWoHmUM5RHi3td31sNKCc8f83XKT44ZDqnpump` is owned by the Token-2022
program (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`), **not** the classic
Token program. Every `@solana/spl-token` call — `getAssociatedTokenAddressSync`,
transfer/burn instructions, ATA creation — **must** be passed
`TOKEN_2022_PROGRAM_ID`. If you omit it, the SDK silently defaults to the classic
program, derives the wrong ATA, and the transaction fails on-chain with
`InvalidAccountData`. This affects `src/components/use-chain.ts`, `src/lib/solana.ts`,
and `scripts/payout-worker.mjs`. When in doubt, `simulateTransaction` against
mainnet — classic fails, 2022 succeeds.

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
git clone <repo>                       # q33wx/otherworld-projex on GitHub
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
- Users **buy credits** with $RIBBIT in one on-chain transaction. The purchase
  is split: `BUY_BURN_SHARE` (default 50%) is **burned** (deflation), the rest
  is transferred to the **treasury** as real house revenue. Price is
  `RIBBIT_PER_CREDIT` (default 100 $RIBBIT / credit).
- Pure **burn-for-credits** (100% burn, no treasury) remains as a fallback and
  works even before a treasury is configured.
- Every burn/deposit is **verified on-chain** server-side (the client POSTs a tx
  signature; the server confirms it and enforces a unique-signature constraint
  so a signature can't be replayed).
- Games have a configurable **house edge** (`HOUSE_EDGE`, default 4%). The
  credits ledger (`src/lib/credits.ts`) is append-only and every balance change
  is a guarded atomic DB decrement/increment inside a transaction — this is what
  prevents double-spend races. **Respect that pattern** when you touch balances.

### 3.2 The bounty engine — read `src/lib/bounty.ts`
This is the most-iterated, most-subtle subsystem. The final design:

- Credit-game bounties are **rake-funded pots** (owner-approved redesign,
  2026-07-27 — it replaced a gross-wager trigger whose margin knob could never
  track real revenue). A pot has a **prize** (the target) and an optional
  **seed** (`Bounty.seedRibbit`, the house's declared head start = its only
  cost per fill). The pot earns
  `bountyPotShare × houseEdge × (1 − buyBurnShare) × ribbitPerCredit`
  $RIBBIT per credit wagered — its share of the edge the house actually
  collects — and pays the moment it reaches the prize, then **re-opens
  automatically** with the same prize/seed.
- The fill threshold (`requiredCreditSpend(prize, seed)`) is derived
  server-side and re-derived whenever prize/seed/economy settings change.
  Solvency is structural: when the meter fills, the house has collected the
  funded portion `1/potShare` times over, so **every fill leaves the house
  ahead** (minus only the seed it chose). A pot that never fills costs
  nothing.
- The meter still counts **gross wager** (monotonic — the bar only rises,
  the owner's hard requirement), but each wagered credit now advances the pot
  by its true expected revenue contribution instead of pretending volume was
  fresh money.
- **Eligibility (anti-sybil), in `src/lib/ranked.ts`.** To share a prize a wallet
  must (1) have spent ≥ `RANKED_MIN_BURNED_RIBBIT` on credits *lifetime*, and
  (2) spent ≥ `RANKED_MIN_WINDOW_BURNED_RIBBIT` *inside the bounty window*. "Spend"
  counts both burns and buys. Rule 2 is the sybil multiplier: splitting play over
  N wallets costs N× fresh spend every window. Set either to 0 to disable it.
  Table bounties also require `RANKED_MIN_TABLE_VOLUME` credits wagered and a
  **net-positive** result to win.
- Winners are paid **pro-rata** by performance (net credits / score), summing to
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
  which rule is unmet (with a Buy-credits CTA) — so nobody grinds a bounty they
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
| `config.ts` / `client-config.ts` | env → typed config; `toRaw`/`fromRaw` (6-dp $RIBBIT) |
| `settings.ts` | `houseConfig()` — live-tunable settings (HouseSetting table, 10s cache) |
| `db.ts` | Prisma client + `jsonSafe` (BigInt-safe JSON) |
| `api.ts` | `handler`/`ok`/`err`/`requireSession`/`requireAdmin` wrappers |
| `credits.ts` | append-only credits ledger, atomic guards |
| `fairness.ts` | commit–reveal engine |
| `games.ts`, `blackjack.ts`, `*-sim.ts` | per-game logic |
| `bounty.ts` | bounty ranking, triggers, pro-rata payout, auto-settle |
| `ranked.ts` | prize-board eligibility (burn/spend gates), bounty pool budget |
| `solana.ts` | on-chain verification + treasury/wallet balance reads (Token-2022!) |
| `session.ts` | ed25519 sign-in, JWT cookie, admin check |
| `ratelimit.ts` | request throttling |

**`src/app/api/` domains:** `auth`, `burn`, `deposits`, `credits`, `games`,
`arcade`, `auctions`, `listings`, `bounties`, `withdrawals`, `treasury`,
`leaderboard`, `activity`, `me`, `config`, `upload`, `dev`, and `admin/*`
(`overview`, `settings`, `bounties`, `bounty-review`, `auctions`, `applications`,
`users`, `withdrawals`).

---

## 5. Money architecture & the golden rules

The app is **semi-custodial** but designed so a stolen web server can't drain
funds. Internalize these — they are non-negotiable:

1. **The web app holds NO private keys.** It only ever *verifies* incoming
   on-chain transactions and *queues* outgoing ones as `Withdrawal` rows.
2. **Treasury = the public reserve.** Holds founders' holdings + all app revenue
   (auction deposits + the house share of credit buys). Ideally a Squads
   multisig / cold wallet. Its key **never** touches any server. Its balance is
   shown publicly at `/treasury`.
3. **Payout hot wallet = a SEPARATE wallet** with only a working float, topped up
   from the treasury as it drains. The off-server payout worker
   (`scripts/payout-worker.mjs`) signs from THIS wallet. Give it the key via
   **one** of (preferred first): `PAYOUT_WALLET_KEY` (the keypair JSON array
   itself, from an env var / secrets manager), a systemd credential named
   `payout-wallet` (`LoadCredential=` — encrypted at rest, decrypted only for
   the service), or `PAYOUT_KEYPAIR_PATH` (legacy key file — `chmod 600`, never
   in a repo or backup). The worst this process can ever move is the hot-wallet
   balance.
   **Never put the treasury key on the ops box. Never put any private key in
   Vercel** — only the *public* address (`PAYOUT_WALLET`) so `/admin` can show
   the float.
4. **Big payouts wait for a human.** Withdrawals above `MAX_PAYOUT_RIBBIT` are
   not auto-sent; an admin processes them in `/admin`.
5. SOL custody is handled by the Anchor program in `program/` (multisig admin +
   on-chain daily cap). **It ships with tests but has NOT been audited.**

---

## 6. Configuration: env vs. live House controls

Two layers:
- **Env vars** (`.env.example` documents all) set the **defaults** and the things
  that can't change at runtime (RPC, mint, secrets, treasury address, admin list).
- **House controls** in `/admin` write to the `HouseSetting` table and override
  the numeric economy knobs **live** (house edge, wager limits, credit price,
  buy/burn share, bounty margin, eligibility thresholds, auto-pay switch, and a
  remote "pause payout worker" switch). `houseConfig()` reads them with a ~10s
  cache and re-clamps to safe bounds. So most economy tuning happens in the admin
  UI, not by redeploying.

Before a real launch: make sure `TREASURY_WALLET == NEXT_PUBLIC_TREASURY_WALLET`,
reset any test-override House settings, and raise `RANKED_MIN_WINDOW_BURNED_RIBBIT`
from any low test value to a meaningful bar.

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

# 5. Only then commit + push (commits are authored as q33wx)
git add -A
git -c user.name="q33wx" -c user.email="43555740+q33wx@users.noreply.github.com" \
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
  connected admin wallet via Token-2022), or mark ones paid elsewhere. Shows the
  payout hot-wallet float.
- **Users / auctions / applications** — moderation, ban, listing review.

### The payout worker (`scripts/payout-worker.mjs`)
A long-running Node process: every `PAYOUT_INTERVAL_MS` (~15s) it polls the
shared Neon DB for pending `Withdrawal` rows and sends them from the hot wallet.
It needs the hot-wallet keypair (`PAYOUT_KEYPAIR_PATH`), the `.env`
(`DATABASE_URL`, `SOLANA_RPC_URL`), and internet. Run it on any always-on box —
**systemd** (auto-restart on boot/crash, recommended for launch), **pm2**, or
**tmux** (testing only; dies on reboot). It's optional: you can skip it entirely
and clear payouts by hand in `/admin`. Never run it against the treasury key.

### Data utilities in `scripts/`
- `prod-smoke.mjs` — 22-check live verification. Run after every deploy.
- `reset-bounties.mjs`, `purge-test-data.mjs` — housekeeping.
- `*-e2e.mjs` — see §9 (caution: they hit the real DB).

---

## 9. Testing

- **`scripts/prod-smoke.mjs`** — the reliable one. 22 checks against live prod;
  run it after every deploy.
- **`economy-e2e.mjs`, `games-e2e.mjs`, `admin-e2e.mjs`** — end-to-end suites,
  self-cleaning (they create test users/bounties and delete them in a `finally`
  block, and park/restore any standing open bounties). Run with a base URL, e.g.
  `node scripts/economy-e2e.mjs https://otherworld-projex.vercel.app`.
  - They compute expected bounty triggers from the app's live formula, so they
    track the credit price/split/margin — no hardcoded thresholds.
  - ⚠️ They hit the **production Neon DB** (the app's only DB) — don't run them
    while someone is playing/testing. They self-clean, but pick a quiet window.
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
- **Gambling compliance is jurisdiction-specific.** Burn-to-play with credit
  prizes is a legal gray area in many places — get advice before marketing this
  as real-money gaming.
- **Treasury solvency is a manual responsibility.** Keep enough $RIBBIT in the
  treasury to cover queued withdrawals and bounty pools; `/treasury` shows both
  sides.

---

## 11. Secrets, access, and who owns what

- **Secrets are NOT in this repo.** They live in Vercel (write-only) and with the
  owner. `.env.example` names them; get real values from the owner.
- **Wallet addresses** (treasury, payout hot wallet, admin wallets) — get them
  from the owner. This guide intentionally omits private keys and specific
  operational addresses. The mint address is public and in `.env.example`.
- **Never commit** a `.env`, a keypair file, or any secret. Never place a private
  key in Vercel.
- The owner controls Vercel, Neon, the domain registrar, the treasury multisig,
  and the token. You'll need them to grant access to each.

---

*When something behaves inexplicably on-chain, your first suspect is Token-2022
(§1.1). When a deploy "didn't take," your first suspect is the alias step (§7).
When the numbers look off, read `bounty.ts` and `ranked.ts` before assuming a bug
— the economy is more deliberate than it looks.*
