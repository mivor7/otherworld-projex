# Launch day — otherworldprojex.xyz (invite-only)

The code side is done and deployed. This is the T-0 runbook — the few things
that are the OWNER's to do when opening the doors.

## 1. Confirm the house wallet & mint on Vercel

One wallet is the admin, the treasury, and the payout signer (`ONBOARDING.md` §5):
- `ADMIN_WALLETS`, `TREASURY_WALLET`, `PAYOUT_WALLET`, and `NEXT_PUBLIC_TREASURY_WALLET` should all point to your house wallet pubkey.
- The launched `$OWP` mint (`w63qPqQwjjgtCkgypRTCTMeWH9vfJaH6xtFGJpTAray`) is baked into `src/lib/owp-mint.ts`. Only set `OWP_MINT` / `NEXT_PUBLIC_OWP_MINT` if you are overriding it.
- Ensure `SOLANA_RPC_URL` and `NEXT_PUBLIC_SOLANA_RPC_URL` point to your dedicated mainnet RPC (Helius / QuickNode / Triton).

## 2. Start the payout worker (`scripts/payout-worker.mjs`)

On your always-on worker host (never on Vercel):
1. Provide `PAYOUT_WALLET_KEY` (or a `chmod 600` keypair at `PAYOUT_KEYPAIR_PATH`) along with `DATABASE_URL` and `SOLANA_RPC_URL`.
2. Start the worker under `systemd` or `pm2` (`npm run payout:worker`) and verify it prints the house wallet address and `$OWP` mint on startup.

## 3. Set live House controls in `/admin`

Sign in at `/admin` with the house wallet and check:
- **Invite-only sign-ups (`inviteRequired`)** — ON for invite-only launch; mint invite codes in the **Invite codes** panel.
- **Lowest sell price (`owpMinSellPrice`)** — set your floor in SOL per 1,000,000 `$OWP` if selling `$OWP` from the site, or leave at `0` for no floor.
- **Eligibility (`rankedMinBurnedRibbit`, `rankedMinWindowBurnedRibbit`, `rankedMinTableVolume`)** — confirm lifetime and in-window deposit minimums match your launch numbers.
- **Bounty auto-pay (`bountyAutoPay`)** — turn ON once initial bounties are posted and the house wallet holds the `$OWP` float to cover them.
- **Pause switches (`gamesPaused`, `creditSalesPaused`, `payoutsPaused`)** — all OFF.

## 4. Smoke-test production

```bash
node scripts/prod-smoke.mjs https://www.otherworldprojex.xyz
```
