// Admin-flow verification: bounty award/payout and auction lifecycle against
// a live server. The dev server must be launched with the test admin wallet
// whitelisted, e.g.:
//   TEST_ADMIN_KEYPAIR=/path/admin-kp.json  (JSON: {wallet, secret(bs58)})
//   ADMIN_WALLETS=<that wallet>  npm run dev
//   TEST_ADMIN_KEYPAIR=/path/admin-kp.json node scripts/admin-e2e.mjs
// Self-cleaning: all test users, bounties, auctions and rows are deleted.
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
const nacl = require_("tweetnacl");
const bs58 = require_("bs58").default ?? require_("bs58");
const { PrismaClient } = require_("@prisma/client");

const BASE = process.argv[2] ?? "http://localhost:3000";
const prisma = new PrismaClient();
const RAW = 10n ** 6n;

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name} ${extra}`); process.exitCode = 1; }
}

function client(kp) {
  const wallet = bs58.encode(Buffer.from(kp.publicKey));
  const jar = new Map();
  async function api(pathname, init = {}) {
    const res = await fetch(BASE + pathname, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...init.headers,
      },
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }
  async function signIn() {
    const n = await api("/api/auth/nonce", { method: "POST", body: JSON.stringify({ wallet }) });
    const sig = nacl.sign.detached(new TextEncoder().encode(n.data.message), kp.secretKey);
    const v = await api("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ wallet, signature: bs58.encode(Buffer.from(sig)) }),
    });
    if (v.status !== 200) throw new Error(`sign-in failed for ${wallet.slice(0,6)}`);
    return v.data;
  }
  return { wallet, api, signIn };
}

const kpPath = process.env.TEST_ADMIN_KEYPAIR;
if (!kpPath) { console.error("Set TEST_ADMIN_KEYPAIR"); process.exit(1); }
const adminSaved = JSON.parse(readFileSync(kpPath, "utf8"));
const adminKp = nacl.sign.keyPair.fromSecretKey(bs58.decode(adminSaved.secret));
const admin = client(adminKp);

// A fresh eligible-burner player: lifetime + in-window burns, plus a worm
// score inside the bounty window. Seeded directly (score submission itself is
// covered by games-e2e; here we test payout).
function player() {
  return client(nacl.sign.keyPair());
}

const bountyIds = [];
const auctionIds = [];
const wallets = [admin.wallet];

async function seedEligible(userId, score, windowStart) {
  await prisma.burnEvent.create({
    data: {
      userId, signature: `adm-life-${userId}-${Math.round(performance.now())}`,
      amountRaw: 2_000n * RAW, credits: 20,
      createdAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
    },
  });
  await prisma.burnEvent.create({
    data: {
      userId, signature: `adm-win-${userId}-${Math.round(performance.now())}`,
      amountRaw: 200n * RAW, credits: 2,
      createdAt: new Date(windowStart.getTime() + 1000),
    },
  });
  await prisma.arcadeScore.create({
    data: {
      userId, game: "worm", score,
      runToken: `adm-run-${userId}-${Math.round(performance.now())}`,
      createdAt: new Date(windowStart.getTime() + 2000),
    },
  });
}

try {
  console.log(`admin ${admin.wallet.slice(0,8)}… → ${BASE}\n`);
  const av = await admin.signIn();
  check("test admin recognized (isAdmin)", av.isAdmin === true,
    "is ADMIN_WALLETS set to the test wallet on the dev server?");
  if (!av.isAdmin) throw new Error("admin wallet not whitelisted — aborting");

  // ---------------- BOUNTY AWARD — single winner ----------------
  console.log("— Bounty award (winner takes all)");
  const create = await admin.api("/api/admin/bounties", {
    method: "POST",
    body: JSON.stringify({
      title: "ADM TEST solo", description: "e2e admin test bounty",
      game: "worm", prizeRibbit: 9000, durationDays: 7,
    }),
  });
  check("bounty created", create.status === 200 && !!create.data.id);
  const bId = create.data.id;
  bountyIds.push(bId);
  const bRow = await prisma.bounty.findUnique({ where: { id: bId } });

  const winner = player();
  await winner.signIn();
  wallets.push(winner.wallet);
  const winUser = await prisma.user.findUnique({ where: { wallet: winner.wallet } });
  await seedEligible(winUser.id, 500, bRow.startsAt);

  const review = await admin.api("/api/admin/bounty-review");
  const rb = review.data.review.find((r) => r.bounty.id === bId);
  check("winner ranks #1 in review", !!rb && rb.entries[0]?.wallet === winner.wallet,
    JSON.stringify(rb?.entries?.[0]));

  // non-admin cannot award
  const outsider = player();
  await outsider.signIn();
  wallets.push(outsider.wallet);
  const forbidden = await outsider.api(`/api/admin/bounties/${bId}`, {
    method: "POST", body: JSON.stringify({ action: "award", splits: [100] }),
  });
  check("non-admin award forbidden (403)", forbidden.status === 403, `got ${forbidden.status}`);

  const award = await admin.api(`/api/admin/bounties/${bId}`, {
    method: "POST", body: JSON.stringify({ action: "award", splits: [100] }),
  });
  check("award succeeds", award.status === 200, JSON.stringify(award.data));
  const paidBounty = await prisma.bounty.findUnique({ where: { id: bId } });
  check("bounty marked paid", paidBounty.status === "paid" && paidBounty.paidAt !== null);
  const awards = await prisma.bountyAward.findMany({ where: { bountyId: bId } });
  check("one award row for the winner", awards.length === 1 && awards[0].userId === winUser.id);
  check("award amount = full prize", awards[0].amountRaw === 9000n * RAW,
    `got ${awards[0].amountRaw}`);
  const wds = await prisma.withdrawal.findMany({ where: { ref: bId, kind: "bounty" } });
  check("treasury payout queued to winner wallet",
    wds.length === 1 && wds[0].destination === winner.wallet &&
    wds[0].amountRaw === 9000n * RAW && wds[0].status === "pending",
    JSON.stringify(wds.map((w) => ({ d: w.destination, a: w.amountRaw.toString(), s: w.status }))));

  // idempotence
  const again = await admin.api(`/api/admin/bounties/${bId}`, {
    method: "POST", body: JSON.stringify({ action: "award", splits: [100] }),
  });
  check("second award rejected (409)", again.status === 409, `got ${again.status}`);
  const awards2 = await prisma.bountyAward.count({ where: { bountyId: bId } });
  const wds2 = await prisma.withdrawal.count({ where: { ref: bId } });
  check("no double-pay: still 1 award, 1 payout", awards2 === 1 && wds2 === 1,
    `awards ${awards2} wds ${wds2}`);

  // ---------------- BOUNTY AWARD — top 3 split ----------------
  console.log("— Bounty award (top-3 split 60/30/10)");
  const create3 = await admin.api("/api/admin/bounties", {
    method: "POST",
    body: JSON.stringify({
      title: "ADM TEST top3", description: "e2e admin split test",
      game: "worm", prizeRibbit: 10000, durationDays: 7,
    }),
  });
  const b3 = create3.data.id;
  bountyIds.push(b3);
  const b3Row = await prisma.bounty.findUnique({ where: { id: b3 } });
  const players3 = [];
  for (const score of [900, 600, 300]) {
    const p = player();
    await p.signIn();
    wallets.push(p.wallet);
    const u = await prisma.user.findUnique({ where: { wallet: p.wallet } });
    await seedEligible(u.id, score, b3Row.startsAt);
    players3.push({ p, u, score });
  }
  const award3 = await admin.api(`/api/admin/bounties/${b3}`, {
    method: "POST", body: JSON.stringify({ action: "award", splits: [60, 30, 10] }),
  });
  check("top-3 award succeeds", award3.status === 200, JSON.stringify(award3.data));
  const a3 = await prisma.bountyAward.findMany({ where: { bountyId: b3 }, orderBy: { rank: "asc" } });
  check("three awards created", a3.length === 3);
  const total3 = a3.reduce((s, a) => s + a.amountRaw, 0n);
  check("splits sum to exactly the prize (dust to #1)", total3 === 10000n * RAW,
    `sum ${total3} vs ${10000n * RAW}`);
  check("rank 1 gets 60% (+dust), rank 2 30%, rank 3 10%",
    a3[0].amountRaw === 6000n * RAW && a3[1].amountRaw === 3000n * RAW && a3[2].amountRaw === 1000n * RAW,
    a3.map((a) => a.amountRaw.toString()).join(","));
  check("highest score ranked #1",
    a3[0].userId === players3[0].u.id && a3[0].value === 900);

  // ---------------- AUCTION CANCEL (refund) ----------------
  console.log("— Auction cancel refunds the high bidder");
  const bidder = player();
  await bidder.signIn();
  wallets.push(bidder.wallet);
  const bidderU = await prisma.user.findUnique({ where: { wallet: bidder.wallet } });
  await prisma.user.update({ where: { id: bidderU.id }, data: { ribbitBalance: 500n * RAW, ribbitLocked: 0n } });
  const auc = await prisma.auction.create({
    data: { title: "ADM cancel", description: "e2e", startBidRaw: 10n * RAW, minIncrement: 1n * RAW,
      endsAt: new Date(Date.now() + 3600_000) },
  });
  auctionIds.push(auc.id);
  const placed = await bidder.api(`/api/auctions/${auc.id}/bid`, {
    method: "POST", body: JSON.stringify({ amountRaw: (100n * RAW).toString() }),
  });
  check("bid placed & funds locked", placed.status === 200);
  let bu = await prisma.user.findUnique({ where: { id: bidderU.id } });
  check("100 locked before cancel", bu.ribbitLocked === 100n * RAW);
  const cancel = await admin.api(`/api/admin/auctions/${auc.id}`, {
    method: "POST", body: JSON.stringify({ action: "cancel" }),
  });
  check("cancel succeeds", cancel.status === 200);
  bu = await prisma.user.findUnique({ where: { id: bidderU.id } });
  const cancelledAuc = await prisma.auction.findUnique({ where: { id: auc.id } });
  check("high bidder refunded (locked back to 0), auction cancelled",
    bu.ribbitLocked === 0n && bu.ribbitBalance === 500n * RAW && cancelledAuc.status === "cancelled",
    `locked ${bu.ribbitLocked} bal ${bu.ribbitBalance} status ${cancelledAuc.status}`);

  // ---------------- AUCTION END NOW + FULFILL ----------------
  console.log("— Auction end-now settles, then mark delivered");
  const winnerB = player();
  await winnerB.signIn();
  wallets.push(winnerB.wallet);
  const wbU = await prisma.user.findUnique({ where: { wallet: winnerB.wallet } });
  await prisma.user.update({ where: { id: wbU.id }, data: { ribbitBalance: 200n * RAW, ribbitLocked: 0n } });
  const auc2 = await prisma.auction.create({
    data: { title: "ADM endnow", description: "e2e", startBidRaw: 10n * RAW, minIncrement: 1n * RAW,
      endsAt: new Date(Date.now() + 3600_000) },
  });
  auctionIds.push(auc2.id);
  await winnerB.api(`/api/auctions/${auc2.id}/bid`, {
    method: "POST", body: JSON.stringify({ amountRaw: (50n * RAW).toString() }),
  });
  const endNow = await admin.api(`/api/admin/auctions/${auc2.id}`, {
    method: "POST", body: JSON.stringify({ action: "end_now" }),
  });
  check("end_now settles", endNow.status === 200);
  let settled = await prisma.auction.findUnique({ where: { id: auc2.id } });
  const wbAfter = await prisma.user.findUnique({ where: { id: wbU.id } });
  check("winner charged, auction settled, not yet fulfilled",
    settled.status === "settled" && settled.winnerUserId === wbU.id &&
    wbAfter.ribbitBalance === 150n * RAW && wbAfter.ribbitLocked === 0n && settled.fulfilled === false,
    `status ${settled.status} bal ${wbAfter.ribbitBalance} locked ${wbAfter.ribbitLocked}`);
  const fulfill = await admin.api(`/api/admin/auctions/${auc2.id}`, {
    method: "POST", body: JSON.stringify({ action: "mark_fulfilled", note: "shipped e2e" }),
  });
  check("mark delivered succeeds", fulfill.status === 200);
  settled = await prisma.auction.findUnique({ where: { id: auc2.id } });
  check("auction marked fulfilled with note",
    settled.fulfilled === true && settled.fulfillmentNote === "shipped e2e");

  // overview stats present
  const ov = await admin.api("/api/admin/overview");
  check("overview exposes house stats", ov.status === 200 &&
    typeof ov.data.stats?.users === "number" &&
    typeof ov.data.stats?.creditsOutstanding === "number");
} finally {
  console.log("\ncleaning test data…");
  await prisma.withdrawal.deleteMany({ where: { ref: { in: bountyIds } } });
  await prisma.treasuryEvent.deleteMany({ where: { ref: { in: [...bountyIds, ...auctionIds] } } });
  await prisma.bountyAward.deleteMany({ where: { bountyId: { in: bountyIds } } });
  await prisma.bounty.deleteMany({ where: { id: { in: bountyIds } } });
  await prisma.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: auctionIds } } });
  for (const w of wallets) {
    const u = await prisma.user.findUnique({ where: { wallet: w } });
    if (!u) continue;
    await prisma.arcadeScore.deleteMany({ where: { userId: u.id } });
    await prisma.arcadeRun.deleteMany({ where: { userId: u.id } });
    await prisma.burnEvent.deleteMany({ where: { userId: u.id } });
    await prisma.withdrawal.deleteMany({ where: { userId: u.id } });
    await prisma.bid.deleteMany({ where: { userId: u.id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
  }
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
