// Purge test-run pollution from the database. A user is REAL (preserved) iff
// they have a genuine arcade score (run token is a UUID from the live run
// registry, or an old-format signed JWT), a real on-chain burn (signature not
// tagged by our e2e scripts), or a deposit. Everyone else — the throwaway
// wallets our e2e/admin/economy scripts create — is purged, along with the
// test auctions those scripts leave behind. Seeded catalog content (the
// original lots and episode bounties) is untouched.
//
//   node scripts/purge-test-data.mjs          # dry run (report only)
//   node scripts/purge-test-data.mjs --apply  # actually delete
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const require_ = (await import("node:module")).createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = require_("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const TEST_BURN = /^(adm|econ|demo|e2e|dev)-/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A real run token is either a UUID (current registry) or a signed JWT
// (eyJ… — the pre-registry format). Test tokens are adm-run-/econ-r-/demo-run-.
const isRealToken = (t) => UUID.test(t) || t.startsWith("eyJ");

const [users, scores, burns, buys, deposits] = await Promise.all([
  prisma.user.findMany({ select: { id: true, wallet: true } }),
  prisma.arcadeScore.findMany({ select: { userId: true, runToken: true } }),
  prisma.burnEvent.findMany({ select: { userId: true, signature: true } }),
  prisma.creditPurchase.findMany({ select: { userId: true, signature: true } }),
  prisma.deposit.findMany({ select: { userId: true } }),
]);

const real = new Set();
for (const s of scores) if (isRealToken(s.runToken)) real.add(s.userId);
for (const b of burns) if (!TEST_BURN.test(b.signature)) real.add(b.userId);
// A real credit purchase (on-chain tx signature) marks a real buyer/spender.
for (const b of buys) if (!TEST_BURN.test(b.signature)) real.add(b.userId);
for (const d of deposits) real.add(d.userId);

const testUserIds = users.filter((u) => !real.has(u.id)).map((u) => u.id);
const realUsers = users.filter((u) => real.has(u.id));

const testAuctions = await prisma.auction.findMany({
  where: { title: { startsWith: "ADM" } },
  select: { id: true, title: true },
});
const testAuctionIds = testAuctions.map((a) => a.id);

console.log(`real users preserved: ${realUsers.length}`);
realUsers.forEach((u) => console.log(`  keep ${u.wallet}`));
console.log(`test users to purge: ${testUserIds.length}`);
console.log(`test auctions to purge: ${testAuctionIds.length}`);

if (APPLY && (testUserIds.length || testAuctionIds.length)) {
  // Bids first (FK), from both test users and test auctions.
  await prisma.bid.deleteMany({
    where: { OR: [{ userId: { in: testUserIds } }, { auctionId: { in: testAuctionIds } }] },
  });
  await prisma.treasuryEvent.deleteMany({ where: { ref: { in: testAuctionIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: testAuctionIds } } });

  await prisma.arcadeScore.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.arcadeRun.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.gameRound.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.serverSeed.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.burnEvent.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.creditPurchase.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.bountyAward.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.withdrawal.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.deposit.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.listingApplication.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  console.log("purged.");
} else if (testUserIds.length || testAuctionIds.length) {
  console.log("(dry run — pass --apply to delete)");
}

const [uAfter, bAfter, sAfter, aAfter, burnSum] = await Promise.all([
  prisma.user.count(),
  prisma.burnEvent.count(),
  prisma.arcadeScore.count(),
  prisma.auction.count(),
  prisma.burnEvent.aggregate({ _sum: { amountRaw: true } }),
]);
console.log(
  `\nnow — users ${uAfter} · burns ${bAfter} (${Number((burnSum._sum.amountRaw ?? 0n) / 10n ** 6n)} $RIBBIT) · scores ${sAfter} · auctions ${aAfter}`
);
await prisma.$disconnect();
