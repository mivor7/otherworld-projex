-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "wager" INTEGER NOT NULL,
    "payout" INTEGER NOT NULL,
    "houseTake" INTEGER NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GameRound_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "ServerSeed" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GameRound" ("clientSeed", "createdAt", "game", "houseTake", "id", "nonce", "outcome", "params", "payout", "seedId", "userId", "wager") SELECT "clientSeed", "createdAt", "game", "houseTake", "id", "nonce", "outcome", "params", "payout", "seedId", "userId", "wager" FROM "GameRound";
DROP TABLE "GameRound";
ALTER TABLE "new_GameRound" RENAME TO "GameRound";
CREATE INDEX "GameRound_userId_createdAt_idx" ON "GameRound"("userId", "createdAt");
CREATE INDEX "GameRound_userId_settled_idx" ON "GameRound"("userId", "settled");
CREATE INDEX "GameRound_game_createdAt_idx" ON "GameRound"("game", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
