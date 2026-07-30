-- The pre-launch airdrop waitlist (imported snapshot; positions preserved).
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "wallet" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "referrals" INTEGER NOT NULL DEFAULT 0,
    "referredBy" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");
CREATE INDEX "WaitlistEntry_position_idx" ON "WaitlistEntry"("position");
