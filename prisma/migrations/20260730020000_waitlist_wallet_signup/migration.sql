-- On-site waitlist signups: wallet-only members (no email) and the on-chain
-- holding recorded at join time.
--
-- NOTE: deliberately a NON-unique index. 11 imported wallets legitimately hold
-- 13 duplicate places (members signed up more than once with different emails
-- on the old site), and their earned positions must not be rewritten. One
-- place per wallet is therefore enforced in the join path for NEW sign-ups
-- only; the historical record stays exactly as imported.
ALTER TABLE "WaitlistEntry" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "WaitlistEntry" ADD COLUMN "heldRibbitRaw" BIGINT NOT NULL DEFAULT 0;
CREATE INDEX "WaitlistEntry_wallet_idx" ON "WaitlistEntry"("wallet");
