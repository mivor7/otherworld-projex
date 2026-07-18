-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "autoPay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggerCreditVolume" INTEGER;

-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "ribbitRaw" BIGINT NOT NULL,
    "burnedRaw" BIGINT NOT NULL,
    "houseRaw" BIGINT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_signature_key" ON "CreditPurchase"("signature");

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
