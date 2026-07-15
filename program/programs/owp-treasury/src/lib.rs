// OWP Treasury — a deliberately small Solana program that custodies the
// game treasury's SOL and enforces two safety rails the web app cannot
// bypass even if its server is fully compromised:
//
//   1. Only the admin key (use a Squads multisig!) can trigger payouts.
//   2. Payouts are rate-limited by an on-chain daily cap.
//
// Anyone can deposit. State lives in a `Treasury` PDA; funds live in a
// separate system-owned `vault` PDA so payouts are plain CPI transfers.
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("owpTREAsury11111111111111111111111111111111");

pub const TREASURY_SEED: &[u8] = b"treasury";
pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod owp_treasury {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, daily_cap_lamports: u64) -> Result<()> {
        let t = &mut ctx.accounts.treasury;
        t.admin = ctx.accounts.admin.key();
        t.daily_cap_lamports = daily_cap_lamports;
        t.spent_today = 0;
        t.last_day = current_day(&Clock::get()?);
        t.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    /// Anyone can top up the vault (house take sweeps, community funding).
    pub fn deposit(ctx: Context<Deposit>, lamports: u64) -> Result<()> {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            lamports,
        )?;
        emit!(TreasuryEvent {
            kind: EventKind::Deposit,
            amount: lamports,
            counterparty: ctx.accounts.payer.key(),
        });
        Ok(())
    }

    /// Admin-only payout, throttled by the daily cap.
    pub fn payout(ctx: Context<Payout>, lamports: u64) -> Result<()> {
        let clock = Clock::get()?;
        let day = current_day(&clock);
        let t = &mut ctx.accounts.treasury;

        if day != t.last_day {
            t.last_day = day;
            t.spent_today = 0;
        }
        t.spent_today = t
            .spent_today
            .checked_add(lamports)
            .ok_or(TreasuryError::Overflow)?;
        require!(
            t.spent_today <= t.daily_cap_lamports,
            TreasuryError::DailyCapExceeded
        );

        let bump = [t.vault_bump];
        let seeds: &[&[u8]] = &[VAULT_SEED, &bump];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                },
                &[seeds],
            ),
            lamports,
        )?;
        emit!(TreasuryEvent {
            kind: EventKind::Payout,
            amount: lamports,
            counterparty: ctx.accounts.recipient.key(),
        });
        Ok(())
    }

    /// Rotate the admin — e.g. to a new multisig. Requires current admin.
    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.treasury.admin = new_admin;
        Ok(())
    }

    /// Adjust the daily payout cap. Requires admin.
    pub fn set_daily_cap(ctx: Context<AdminOnly>, daily_cap_lamports: u64) -> Result<()> {
        ctx.accounts.treasury.daily_cap_lamports = daily_cap_lamports;
        Ok(())
    }
}

fn current_day(clock: &Clock) -> i64 {
    clock.unix_timestamp / 86_400
}

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub admin: Pubkey,
    pub daily_cap_lamports: u64,
    pub spent_today: u64,
    pub last_day: i64,
    pub vault_bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [TREASURY_SEED],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    /// CHECK: system-owned PDA that only holds lamports.
    #[account(seeds = [VAULT_SEED], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [VAULT_SEED], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Payout<'info> {
    #[account(mut, seeds = [TREASURY_SEED], bump, has_one = admin)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, seeds = [VAULT_SEED], bump = treasury.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: any account may receive a payout; the admin signs off.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [TREASURY_SEED], bump, has_one = admin)]
    pub treasury: Account<'info, Treasury>,
    pub admin: Signer<'info>,
}

#[event]
pub struct TreasuryEvent {
    pub kind: EventKind,
    pub amount: u64,
    pub counterparty: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Deposit,
    Payout,
}

#[error_code]
pub enum TreasuryError {
    #[msg("Daily payout cap exceeded — try again tomorrow or raise the cap via multisig")]
    DailyCapExceeded,
    #[msg("Arithmetic overflow")]
    Overflow,
}
