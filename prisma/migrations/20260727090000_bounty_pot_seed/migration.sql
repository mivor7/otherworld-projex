-- Rake-funded pot model: each credit-game bounty is a pot that opens at a
-- house-declared seed and is filled the rest of the way by the pot's share of
-- the realized house edge. Additive column; existing rows get seed 0.

ALTER TABLE "Bounty" ADD COLUMN "seedRibbit" BIGINT NOT NULL DEFAULT 0;
