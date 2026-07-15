# OWP Treasury program

A deliberately small Anchor program that custodies the arcade treasury's SOL.
It enforces two rails that hold **even if the web server is fully compromised**:

1. **Admin-gated payouts** — only the configured admin key can move funds out.
2. **On-chain daily cap** — payouts above the cap revert until the next UTC day.

Anyone can deposit (house-take sweeps, community funding). State lives in a
`treasury` PDA; lamports live in a separate system-owned `vault` PDA.

## Instructions

| Instruction    | Signer | Effect                                          |
| -------------- | ------ | ----------------------------------------------- |
| `initialize`   | admin  | Create treasury state, set daily cap            |
| `deposit`      | anyone | Transfer SOL into the vault PDA                 |
| `payout`       | admin  | Transfer SOL out, subject to the daily cap      |
| `set_admin`    | admin  | Rotate admin (e.g. to a new multisig)           |
| `set_daily_cap`| admin  | Change the cap                                  |

## Build, test, deploy

Requires the [Solana toolchain](https://solana.com/docs/intro/installation) and
[Anchor 0.31](https://www.anchor-lang.com/docs/installation).

```bash
cd program
anchor keys sync        # generates a real program ID and rewrites declare_id!
anchor build
anchor test             # runs tests/owp-treasury.ts against a local validator
anchor deploy --provider.cluster mainnet
```

After deploying, call `initialize` once with your admin key and a conservative
daily cap, then send the treasury's SOL to the `vault` PDA
(`findProgramAddress(["vault"], programId)`).

## Security checklist — do these before real money flows

- [ ] **Make the admin a [Squads](https://squads.so) multisig**, not a hot key.
      `set_admin` to the multisig immediately after `initialize`.
- [ ] Start with a **small daily cap** (it's your blast-radius limit) and raise
      it only as volume justifies.
- [ ] Set the deployed program's **upgrade authority to the multisig too**
      (`solana program set-upgrade-authority`), or burn it once stable.
- [ ] Get an audit (or at minimum a community review) before the vault holds
      more than you can afford to lose. The program is ~150 lines on purpose —
      cheap to review.
- [ ] Point `TREASURY_WALLET` in the web app at the **vault PDA** so deposits,
      escrow and the dashboard all reference program-controlled custody.
