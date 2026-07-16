# Deploy checklist

Live stack: **Vercel** (Next.js) + **Neon** (Postgres) + **Solana** mainnet.

## Environment variables (Vercel → Settings → Environment Variables)

Injected automatically by integrations:

- `DATABASE_URL` — pooled connection (Neon, runtime)
- `DATABASE_URL_UNPOOLED` — direct connection (Neon, migrations)
- `BLOB_READ_WRITE_TOKEN` — lot photo uploads (add a Blob store under
  Storage → Blob; without it the consign form falls back to paste-a-URL)

Set these yourself (Production + Preview):

| Variable | Value |
| --- | --- |
| `SESSION_SECRET` | 32-byte hex (`openssl rand -hex 32`) — **keep secret** |
| `SOLANA_RPC_URL` | mainnet RPC (Helius/Triton key recommended over the public endpoint) |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | same RPC URL, client-visible |
| `ADMIN_WALLETS` | comma-separated wallet pubkeys that may open `/admin` |
| `TREASURY_WALLET` | treasury pubkey — leave empty until the multisig exists |
| `NEXT_PUBLIC_TREASURY_WALLET` | same value |

Never set `DEV_FAUCET` in production (the faucet route also hard-refuses when
`NODE_ENV=production`).

## Build

The `vercel-build` script runs `prisma migrate deploy && next build`, so
schema changes apply on every deploy. No manual migration step.

## After first deploy

1. Open the `*.vercel.app` URL with a wallet installed and run the full loop:
   connect → sign in → (on a preview with the faucet on) play each game.
2. Create a [Squads](https://squads.so) multisig, set `TREASURY_WALLET` to it
   to switch on auction deposits and the live treasury dashboard.
3. Point `otherworldprojex.com` at the Vercel project (Settings → Domains).
4. Upload `brand/avatar-800.png` and `brand/banner-x-1500x500.png` to X, and
   `brand/icon-512.png` to the token profile.

See `README.md` for the full architecture and security model, and
`program/README.md` for the treasury program.
