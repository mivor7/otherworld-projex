// Economy verification: auto-bounty credit-spend trigger + pro-rata payout to
// all eligible winners, and buy-credits endpoint guards. State is seeded via
// Prisma (score/round submission is covered elsewhere); the trigger fires over
// HTTP by hitting the bounties list, which runs autoSettleBounties.
//
// The dev server must run with BOUNTY_AUTO_PAY=true. Self-cleaning.
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

const BASE = process.argv[2] ?? "http://localhost:3000";
const prisma = new PrismaClient();
const RAW = 10n ** 6n;

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name} ${extra}`); process.exitCode = 1; }
}
const api = (p) => fetch(BASE + p).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

const bountyIds = [];
const userIds = [];

async function makeWinner(tag, net, vol, bountyStart) {
  const u = await prisma.user.create({ data: { wallet: `econ-${tag}-${Math.round(performance.now())}` } });
  userIds.push(u.id);
  // eligibility: lifetime + in-window burns
  await prisma.burnEvent.create({ data: { userId: u.id, signature: `econ-life-${u.id}`, amountRaw: 2000n * RAW, credits: 20, createdAt: new Date(Date.now() - 40 * 864e5) } });
  await prisma.burnEvent.create({ data: { userId: u.id, signature: `econ-win-${u.id}`, amountRaw: 200n * RAW, credits: 2, createdAt: new Date(bountyStart.getTime() + 500) } });
  // a settled dice round: net = payout - wager, volume = wager
  await prisma.gameRound.create({
    data: {
      userId: u.id, seedId: await seedId(u.id), game: "dice", nonce: 0,
      clientSeed: "x", params: "{}", outcome: "{}",
      wager: vol, payout: vol + net, houseTake: 0, settled: true,
      createdAt: new Date(bountyStart.getTime() + 1000),
    },
  });
  return u;
}
async function seedId(userId) {
  const s = await prisma.serverSeed.create({ data: { userId, seed: "s", seedHash: "h", active: false } });
  return s.id;
}

try {
  console.log(`economy checks → ${BASE}\n`);

  // ---------------- buy-credits endpoint guards ----------------
  console.log("— Buy-credits endpoint guards");
  const buyNoAuth = await fetch(BASE + "/api/credits/buy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature: "x".repeat(80) }),
  });
  check("buy requires sign-in (401)", buyNoAuth.status === 401, `got ${buyNoAuth.status}`);

  // ---------------- auto-bounty: below threshold does NOT pay ----------------
  console.log("— Auto-bounty stays open below the spend threshold");
  const b1 = await prisma.bounty.create({
    data: {
      title: "ECON below-threshold", description: "e2e", game: "dice", kind: "leaderboard",
      prizeRibbit: 10000n * RAW, autoPay: true, triggerCreditVolume: 100000,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b1.id);
  await makeWinner("b1a", 300, 100, b1.startsAt); // only 100 credits spent << 100000
  await api("/api/bounties");
  let b1r = await prisma.bounty.findUnique({ where: { id: b1.id } });
  check("below-threshold bounty stays open (no payout)", b1r.status === "open",
    `status ${b1r.status}`);

  // ---------------- auto-bounty: crosses threshold → pro-rata payout ----------------
  console.log("— Auto-bounty fires at the threshold, pays all winners pro-rata");
  const b2 = await prisma.bounty.create({
    data: {
      title: "ECON trigger", description: "e2e", game: "dice", kind: "leaderboard",
      prizeRibbit: 10000n * RAW, autoPay: true, triggerCreditVolume: 150,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b2.id);
  const wA = await makeWinner("b2a", 300, 100, b2.startsAt); // net 300, vol 100
  const wB = await makeWinner("b2b", 100, 100, b2.startsAt); // net 100, vol 100
  // total dice wager since b2.startsAt from these = 200 ≥ 150 → triggers
  const trig = await api("/api/bounties");
  check("bounties endpoint ok", trig.status === 200);
  let b2r = await prisma.bounty.findUnique({ where: { id: b2.id } });
  check("bounty auto-marked paid once threshold crossed", b2r.status === "paid" && b2r.paidAt,
    `status ${b2r.status}`);

  const awards = await prisma.bountyAward.findMany({ where: { bountyId: b2.id }, orderBy: { rank: "asc" } });
  check("both eligible winners awarded", awards.length === 2);
  const total = awards.reduce((s, a) => s + a.amountRaw, 0n);
  check("shares sum to exactly the prize", total === 10000n * RAW, `sum ${total}`);
  // net 300 vs 100 → 75% / 25% of 10000 = 7500 / 2500
  const byUser = Object.fromEntries(awards.map((a) => [a.userId, a.amountRaw]));
  check("pro-rata by performance: 300-net winner gets 7,500; 100-net gets 2,500",
    byUser[wA.id] === 7500n * RAW && byUser[wB.id] === 2500n * RAW,
    `A ${byUser[wA.id]} B ${byUser[wB.id]}`);
  const wds = await prisma.withdrawal.findMany({ where: { ref: b2.id, kind: "bounty" } });
  check("two treasury payouts queued to winner wallets",
    wds.length === 2 && wds.every((w) => w.status === "pending"),
    `count ${wds.length}`);
  check("payout destinations are the winners' wallets",
    wds.some((w) => w.destination === wA.wallet) && wds.some((w) => w.destination === wB.wallet));

  // idempotence — hitting the endpoint again doesn't re-pay
  await api("/api/bounties");
  const awards2 = await prisma.bountyAward.count({ where: { bountyId: b2.id } });
  const wds2 = await prisma.withdrawal.count({ where: { ref: b2.id } });
  check("no double-pay on re-trigger", awards2 === 2 && wds2 === 2, `awards ${awards2} wds ${wds2}`);

  // ---------------- progress surfaced publicly ----------------
  console.log("— Progress is visible to players");
  const b3 = await prisma.bounty.create({
    data: {
      title: "ECON progress", description: "e2e", game: "dice", kind: "leaderboard",
      prizeRibbit: 5000n * RAW, autoPay: true, triggerCreditVolume: 1000,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b3.id);
  await makeWinner("b3a", 50, 250, b3.startsAt); // 250 wagered of 1000 = 25%
  const list = await api("/api/bounties");
  const b3v = list.data.open.find((b) => b.id === b3.id);
  check("open bounty exposes credit progress toward trigger",
    b3v?.progress?.mode === "credit" && b3v.progress.threshold === 1000 &&
    b3v.progress.spent >= 250 && b3v.progress.pct >= 25,
    JSON.stringify(b3v?.progress));

  // ---------------- free-game bounty pays weekly (time-based) ----------------
  console.log("— Free-game bounty pays on time, not on spend");
  const b4 = await prisma.bounty.create({
    data: {
      title: "ECON free weekly", description: "e2e", game: "worm", kind: "leaderboard",
      prizeRibbit: 2000n * RAW, autoPay: true,
      endsAt: new Date(Date.now() - 1000), // already due
    },
  });
  bountyIds.push(b4.id);
  const wc = await prisma.user.create({ data: { wallet: `econ-free-${Math.round(performance.now())}` } });
  userIds.push(wc.id);
  await prisma.burnEvent.create({ data: { userId: wc.id, signature: `econ-fl-${wc.id}`, amountRaw: 2000n * RAW, credits: 20, createdAt: new Date(Date.now() - 40 * 864e5) } });
  await prisma.burnEvent.create({ data: { userId: wc.id, signature: `econ-fw-${wc.id}`, amountRaw: 200n * RAW, credits: 2, createdAt: new Date(b4.startsAt.getTime() + 500) } });
  await prisma.arcadeScore.create({ data: { userId: wc.id, game: "worm", score: 500, runToken: `econ-r-${wc.id}`, createdAt: new Date(b4.startsAt.getTime() + 1000) } });
  await api("/api/bounties");
  const b4r = await prisma.bounty.findUnique({ where: { id: b4.id } });
  const b4awards = await prisma.bountyAward.count({ where: { bountyId: b4.id } });
  check("past-due free-game bounty auto-pays its winner", b4r.status === "paid" && b4awards === 1,
    `status ${b4r.status} awards ${b4awards}`);
} finally {
  console.log("\ncleaning test data…");
  await prisma.withdrawal.deleteMany({ where: { ref: { in: bountyIds } } });
  await prisma.treasuryEvent.deleteMany({ where: { ref: { in: bountyIds } } });
  await prisma.bountyAward.deleteMany({ where: { bountyId: { in: bountyIds } } });
  await prisma.bounty.deleteMany({ where: { id: { in: bountyIds } } });
  for (const id of userIds) {
    await prisma.arcadeScore.deleteMany({ where: { userId: id } });
    await prisma.gameRound.deleteMany({ where: { userId: id } });
    await prisma.serverSeed.deleteMany({ where: { userId: id } });
    await prisma.burnEvent.deleteMany({ where: { userId: id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
