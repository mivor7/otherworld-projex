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
// The suite seeds real wagers in the shared DB — park EVERY standing open
// auto-pay bounty for the duration, or the seeded spend would fill (and pay!)
// the house's real pools. Restored in the finally block, crash included.
let parkedIds = [];

async function makeWinner(tag, net, vol, bountyStart, game = "dice") {
  const u = await prisma.user.create({ data: { wallet: `econ-${tag}-${Math.round(performance.now())}` } });
  userIds.push(u.id);
  // eligibility: lifetime + in-window burns
  await prisma.burnEvent.create({ data: { userId: u.id, signature: `econ-life-${u.id}`, amountRaw: 2000n * RAW, credits: 20, createdAt: new Date(Date.now() - 40 * 864e5) } });
  await prisma.burnEvent.create({ data: { userId: u.id, signature: `econ-win-${u.id}`, amountRaw: 200n * RAW, credits: 2, createdAt: new Date(bountyStart.getTime() + 500) } });
  // a settled round: net = payout - wager, volume = wager
  await prisma.gameRound.create({
    data: {
      userId: u.id, seedId: await seedId(u.id), game, nonce: 0,
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

  const standing = await prisma.bounty.findMany({
    where: { status: "open", autoPay: true },
    select: { id: true },
  });
  parkedIds = standing.map((b) => b.id);
  await prisma.bounty.updateMany({
    where: { id: { in: parkedIds } },
    data: { status: "closed" },
  });
  console.log(`parked ${parkedIds.length} standing bounties for the run\n`);

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
      // 10,000 $RIBBIT prize honestly derives a 3,750-credit trigger
      // (settle enforces max(stored, live-derived) — a weaker stored trigger
      // can never fire early).
      prizeRibbit: 10000n * RAW, autoPay: true, triggerCreditVolume: 3750,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b2.id);
  const wA = await makeWinner("b2a", 300, 2000, b2.startsAt); // net 300, vol 2000
  const wB = await makeWinner("b2b", 100, 1750, b2.startsAt); // net 100, vol 1750
  // total dice wager since b2.startsAt from these = 3750 ≥ trigger → fires
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
      // 5,000 $RIBBIT prize → honest derived trigger 1,875 credits
      prizeRibbit: 5000n * RAW, autoPay: true, triggerCreditVolume: 1875,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b3.id);
  await makeWinner("b3a", 50, 250, b3.startsAt); // 250 wagered of 1875 = 13%
  const list = await api("/api/bounties");
  const b3v = list.data.open.find((b) => b.id === b3.id);
  check("open bounty exposes credit progress toward trigger",
    b3v?.progress?.mode === "credit" && b3v.progress.threshold === 1875 &&
    b3v.progress.spent >= 250 && b3v.progress.pct >= 13,
    JSON.stringify(b3v?.progress));

  // ---------------- live standings + projected earnings ----------------
  console.log("— Live standings project each player's pro-rata earning");
  const b5 = await prisma.bounty.create({
    data: {
      title: "ECON standings", description: "e2e", game: "flip", kind: "leaderboard",
      prizeRibbit: 10000n * RAW, autoPay: true, triggerCreditVolume: 100000,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b5.id);
  await makeWinner("b5a", 300, 100, b5.startsAt, "flip"); // net 300
  await makeWinner("b5b", 100, 100, b5.startsAt, "flip"); // net 100 → 75/25 split of 10000
  const live = await api("/api/bounties/live?game=flip");
  const st = live.data;
  check("live endpoint returns the open dice bounty + standings",
    st.bounty && st.entries.length >= 2, JSON.stringify(st.bounty));
  const top = st.entries[0];
  check("projected split matches pro-rata (top ~7,500 of 10,000)",
    top.projectedRibbit === 7500, `got ${top?.projectedRibbit}`);
  const projSum = st.entries.reduce((a, e) => a + e.projectedRibbit, 0);
  check("projections sum to the prize (10,000)", projSum === 10000, `got ${projSum}`);
  const summaries = await api("/api/bounties/live");
  check("per-game summary lists the flip bounty for indicators",
    summaries.data.games?.flip?.prizeRibbit > 0, JSON.stringify(summaries.data.games?.flip));

  // ---------------- buyers are eligible (spend = burns + buys) ----------------
  console.log("— A credit-buyer (no pure burn) still qualifies for prizes");
  const b6 = await prisma.bounty.create({
    data: {
      title: "ECON buyer", description: "e2e", game: "blackjack", kind: "leaderboard",
      prizeRibbit: 8000n * RAW, autoPay: true, triggerCreditVolume: 100000,
      endsAt: new Date(Date.now() + 7 * 864e5),
    },
  });
  bountyIds.push(b6.id);
  const buyer = await prisma.user.create({ data: { wallet: `econ-buyer-${Math.round(performance.now())}` } });
  userIds.push(buyer.id);
  // NO BurnEvent — only a credit purchase (part burned, part to house).
  await prisma.creditPurchase.create({
    data: { userId: buyer.id, signature: `econ-buy-life-${buyer.id}`, ribbitRaw: 2000n * RAW, burnedRaw: 1000n * RAW, houseRaw: 1000n * RAW, credits: 20, createdAt: new Date(Date.now() - 40 * 864e5) },
  });
  await prisma.creditPurchase.create({
    data: { userId: buyer.id, signature: `econ-buy-win-${buyer.id}`, ribbitRaw: 300n * RAW, burnedRaw: 150n * RAW, houseRaw: 150n * RAW, credits: 3, createdAt: new Date(b6.startsAt.getTime() + 500) },
  });
  const bseed = await prisma.serverSeed.create({ data: { userId: buyer.id, seed: "s", seedHash: "h", active: false } });
  await prisma.gameRound.create({
    data: { userId: buyer.id, seedId: bseed.id, game: "blackjack", nonce: 0, clientSeed: "x", params: "{}", outcome: "{}", wager: 120, payout: 320, houseTake: 0, settled: true, createdAt: new Date(b6.startsAt.getTime() + 1000) },
  });
  const buyerLive = await api("/api/bounties/live?game=blackjack");
  check("credit-buyer with no pure burn is eligible & ranked",
    buyerLive.data.entries?.some((e) => e.projectedRibbit > 0),
    JSON.stringify(buyerLive.data.entries));

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

  // ---------------- weekly cadence renews itself ----------------
  console.log("— Weekly arcade bounty rolls a fresh edition when it settles");
  // (all standing bounties are parked, so renewal isn't skipped for frogris)
  const b7 = await prisma.bounty.create({
    data: {
      title: "ECON weekly renew", description: "e2e", game: "frogris", kind: "leaderboard",
      prizeRibbit: 1000n * RAW, autoPay: true,
      endsAt: new Date(Date.now() - 1000), // due, and nobody eligible
    },
  });
  bountyIds.push(b7.id);
  await api("/api/bounties");
  const b7r = await prisma.bounty.findUnique({ where: { id: b7.id } });
  const successor = await prisma.bounty.findFirst({
    where: { title: "ECON weekly renew", status: "open" },
  });
  if (successor) bountyIds.push(successor.id);
  check("expired weekly with no winners closes unpaid and rolls a fresh week",
    b7r.status === "closed" && !b7r.paidAt && !!successor &&
      successor.endsAt.getTime() > Date.now() + 6 * 864e5,
    `status ${b7r.status} successor ${!!successor}`);

  // ---------------- credit bounty deadline + closed-means-stopped ----------------
  console.log("— Credit bounty deadline closes unpaid; closed never auto-pays");
  const b8 = await prisma.bounty.create({
    data: {
      title: "ECON deadline", description: "e2e", game: "dice", kind: "leaderboard",
      prizeRibbit: 10000n * RAW, autoPay: true, triggerCreditVolume: 100000,
      endsAt: new Date(Date.now() - 1000), // deadline passed, meter unfilled
    },
  });
  bountyIds.push(b8.id);
  await api("/api/bounties");
  const b8r = await prisma.bounty.findUnique({ where: { id: b8.id } });
  check("credit bounty past deadline with unfilled meter closes unpaid",
    b8r.status === "closed" && !b8r.paidAt, `status ${b8r.status}`);
  // Even a trivially-reachable trigger must not revive it: closed is final
  // for the automat (only an explicit admin award can pay it now).
  await prisma.bounty.update({ where: { id: b8.id }, data: { triggerCreditVolume: 1 } });
  await api("/api/bounties");
  const b8r2 = await prisma.bounty.findUnique({ where: { id: b8.id } });
  const b8awards = await prisma.bountyAward.count({ where: { bountyId: b8.id } });
  check("closed bounty never auto-pays", b8r2.status === "closed" && b8awards === 0,
    `status ${b8r2.status} awards ${b8awards}`);
} finally {
  console.log("\ncleaning test data…");
  // Reopen every standing bounty parked at the top, even on a crash.
  if (parkedIds.length) {
    await prisma.bounty.updateMany({
      where: { id: { in: parkedIds } },
      data: { status: "open" },
    });
  }
  // Belt and braces: renewal successors carry the test titles — fold them
  // into the id list so the ordered cleanup below (awards before bounties)
  // catches them too.
  const strays = await prisma.bounty.findMany({
    where: { title: { in: ["ECON weekly renew", "ECON free weekly", "ECON deadline"] } },
    select: { id: true },
  });
  bountyIds.push(...strays.map((s) => s.id));
  const bIds = [...new Set(bountyIds.filter(Boolean))];
  const uIds = userIds.filter(Boolean);
  await prisma.withdrawal.deleteMany({ where: { ref: { in: bIds } } });
  await prisma.treasuryEvent.deleteMany({ where: { ref: { in: bIds } } });
  await prisma.bountyAward.deleteMany({ where: { bountyId: { in: bIds } } });
  await prisma.bounty.deleteMany({ where: { id: { in: bIds } } });
  for (const id of uIds) {
    await prisma.arcadeScore.deleteMany({ where: { userId: id } });
    await prisma.arcadeRun.deleteMany({ where: { userId: id } });
    await prisma.gameRound.deleteMany({ where: { userId: id } });
    await prisma.serverSeed.deleteMany({ where: { userId: id } });
    await prisma.burnEvent.deleteMany({ where: { userId: id } });
    await prisma.creditPurchase.deleteMany({ where: { userId: id } });
    await prisma.bountyAward.deleteMany({ where: { userId: id } });
    await prisma.withdrawal.deleteMany({ where: { userId: id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
