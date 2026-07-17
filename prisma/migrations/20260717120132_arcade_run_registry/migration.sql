-- CreateTable
CREATE TABLE "ArcadeRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "ArcadeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArcadeRun_userId_game_createdAt_idx" ON "ArcadeRun"("userId", "game", "createdAt");

-- AddForeignKey
ALTER TABLE "ArcadeRun" ADD CONSTRAINT "ArcadeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
