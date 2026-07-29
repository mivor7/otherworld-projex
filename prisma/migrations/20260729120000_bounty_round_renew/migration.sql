-- Owner's re-open switch + auto-numbered rounds for bounties.
ALTER TABLE "Bounty" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Bounty" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
