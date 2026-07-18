-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "fulfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fulfillmentNote" TEXT;

-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "paidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'balance',
ADD COLUMN     "ref" TEXT;

-- CreateTable
CREATE TABLE "BountyAward" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "amountRaw" BIGINT NOT NULL,
    "value" INTEGER NOT NULL,
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BountyAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BountyAward_bountyId_idx" ON "BountyAward"("bountyId");

-- AddForeignKey
ALTER TABLE "BountyAward" ADD CONSTRAINT "BountyAward_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyAward" ADD CONSTRAINT "BountyAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
