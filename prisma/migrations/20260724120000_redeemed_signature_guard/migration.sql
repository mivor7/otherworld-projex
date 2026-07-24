-- Shared cross-path signature-redemption guard (closes the concurrent
-- buy↔deposit double-redeem TOCTOU). Additive, plus a backfill of every
-- signature already redeemed so historical signatures stay locked too.

CREATE TABLE "RedeemedSignature" (
    "signature" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedeemedSignature_pkey" PRIMARY KEY ("signature")
);

-- Backfill: everything already redeemed is registered, oldest wins on the
-- (never-expected) cross-table duplicate.
INSERT INTO "RedeemedSignature" ("signature", "kind", "createdAt")
  SELECT "signature", 'buy', "createdAt" FROM "CreditPurchase"
  ON CONFLICT ("signature") DO NOTHING;
INSERT INTO "RedeemedSignature" ("signature", "kind", "createdAt")
  SELECT "signature", 'deposit', "createdAt" FROM "Deposit"
  ON CONFLICT ("signature") DO NOTHING;
INSERT INTO "RedeemedSignature" ("signature", "kind", "createdAt")
  SELECT "signature", 'burn', "createdAt" FROM "BurnEvent"
  ON CONFLICT ("signature") DO NOTHING;
