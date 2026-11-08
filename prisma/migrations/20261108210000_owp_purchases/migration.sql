-- SOL paid to the house wallet in exchange for $OWP sent back at the
-- pump.fun price. The payout itself is a Withdrawal (kind "buy").
CREATE TABLE "OwpPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paySignature" TEXT NOT NULL,
    "solLamports" BIGINT NOT NULL,
    "owpRaw" BIGINT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwpPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwpPurchase_paySignature_key" ON "OwpPurchase"("paySignature");
CREATE UNIQUE INDEX "OwpPurchase_withdrawalId_key" ON "OwpPurchase"("withdrawalId");

ALTER TABLE "OwpPurchase" ADD CONSTRAINT "OwpPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
