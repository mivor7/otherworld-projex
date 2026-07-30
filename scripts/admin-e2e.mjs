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

// Invite-only gate support: throwaway wallets are NEW users, so sign-ins pass
// a suite-minted code (server ignores it when the gate is off). Minted in the
// try block, deleted in cleanup.
const E2E_INVITE = `OWP-E2E-${Date.now().toString(36).toUpperCase()}`;
const RAW = 10n ** 6n;

// Mirror of the app's requiredCreditSpend, read from live house config (same
// helper as economy-e2e) so trigger assertions stay correct at any credit price
// — the old edge-based derivation (× margin / edge) no longer applies.
// Mirrors src/lib/bounty.requiredCreditSpend (pot model).
async function requiredCredits(prizeRaw, seedRaw = 0n) {
  const s = Object.fromEntries((await prisma.houseSetting.findMany()).map((x) => [x.key, x.value]));
  const num = (k, envK, def) =>
    s[k] !== undefined && s[k] !== "" ? Number(s[k]) : Number(process.env[envK] ?? def);
  const ribbitPerCredit = num("ribbitPerCredit", "RIBBIT_PER_CREDIT", 100);
  const buyBurnShare = num("buyBurnShare", "BUY_BURN_SHARE", 0.5);
  const potShare = num("bountyPotShare", "BOUNTY_POT_SHARE", 0.5);
  const edge = num("houseEdge", "HOUSE_EDGE", 0.04);
  const rate = potShare * edge * (1 - buyBurnShare) * ribbitPerCredit;
  const funded = Math.max(0, Number((prizeRaw - seedRaw) / RAW));
  if (funded === 0) return 1;
  return Math.max(1, Math.ceil(funded / rate));
}

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
      body: JSON.stringify({ wallet, signature: bs58.encode(Buffer.from(sig)), inviteCode: E2E_INVITE }),
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

// Settings this suite writes. Snapshot the OWNER'S current overrides up front
// so cleanup can restore them exactly — a blanket delete would silently revert
// live house pricing to env defaults on the production DB.
const TOUCHED_SETTINGS = ["houseEdge", "minWager", "gamesPaused", "buyBurnShare"];
const preSettings = await prisma.houseSetting.findMany({
  where: { key: { in: TOUCHED_SETTINGS } },
});

// The owner's payout worker may be live against this same DB — and suite
// bounty awards create REAL pending withdrawals addressed to throwaway test
// wallets. Pause payouts for the run (the worker checks this switch every
// pass) and lift it LAST in cleanup, after every suite withdrawal row is
// deleted. This exact race once paid 1,000 real $RIBBIT to a discarded
// test wallet. Kept out of TOUCHED_SETTINGS on purpose: that restore runs
// BEFORE the withdrawal deletions.
const prePayoutsPaused = await prisma.houseSetting.findUnique({
  where: { key: "payoutsPaused" },
});
await prisma.houseSetting.upsert({
  where: { key: "payoutsPaused" },
  update: { value: "true" },
  create: { key: "payoutsPaused", value: "true" },
});

// The suite creates bounties on these games; the app enforces one open bounty
// per game, so the owner's live bounties on them would make our creates 409.
// Park them (→ closed) for the run and restore in finally — the board is left
// EXACTLY as we found it.
// Park every game, not just the ones this suite creates bounties on: the
// suite writes houseEdge/buyBurnShare through the live settings API, which
// re-derives the trigger of EVERY open credit bounty at the test values —
// an unparked pot keeps that skewed trigger after the run (it once left the
// owner's flip pot at trigger 2000 instead of 1053). Parked = closed =
// invisible to the re-derive.
const SUITE_GAMES = ["dice", "worm", "blackjack", "flip", "frogris", "hopper"];
let parkedBountyIds = [];

try {
  console.log(`admin ${admin.wallet.slice(0,8)}… → ${BASE}\n`);
  await prisma.inviteCode.create({
    data: { code: E2E_INVITE, maxUses: 50, note: "admin-e2e (auto-cleaned)" },
  });
  const toPark = await prisma.bounty.findMany({
    where: { status: "open", game: { in: SUITE_GAMES } },
    select: { id: true },
  });
  parkedBountyIds = toPark.map((b) => b.id);
  if (parkedBountyIds.length) {
    await prisma.bounty.updateMany({
      where: { id: { in: parkedBountyIds } },
      data: { status: "closed" },
    });
  }
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
      game: "worm", prizeRibbit: 9000, durationDays: 7, autoRenew: false,
    }),
  });
  check("bounty created", create.status === 200 && !!create.data.id);
  const bId = create.data.id;
  if (bId) bountyIds.push(bId);
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
      game: "worm", prizeRibbit: 10000, durationDays: 7, autoRenew: false,
    }),
  });
  const b3 = create3.data.id;
  if (b3) bountyIds.push(b3);
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

  // ---------------- AUTO-DERIVED BOUNTY TRIGGER ----------------
  console.log("— Auto-pay credit bounty derives its trigger from the prize");
  const autoB = await admin.api("/api/admin/bounties", {
    method: "POST",
    body: JSON.stringify({
      title: "ADM auto-trigger", description: "e2e derive test",
      game: "dice", prizeRibbit: 5000, durationDays: 7, autoPay: true, autoRenew: false,
    }),
  });
  if (autoB.data?.id) bountyIds.push(autoB.data.id);
  // Trigger is derived by the app from the prize × (1+margin) / ((1−burnShare)
  // × ribbitPerCredit) — read the same value from live config.
  const req5000 = await requiredCredits(5000n * RAW);
  check("trigger auto-derived from prize (5000 $RIBBIT → derived credits)",
    autoB.status === 200 && autoB.data.triggerCreditVolume === req5000,
    `got ${autoB.data?.triggerCreditVolume}, expected ${req5000}`);
  const autoRow = await prisma.bounty.findUnique({ where: { id: autoB.data.id } });
  check("threshold persisted, autoPay set",
    autoRow.autoPay === true && autoRow.triggerCreditVolume === req5000);
  // free game: no credit threshold, weekly instead
  const autoFree = await admin.api("/api/admin/bounties", {
    method: "POST",
    body: JSON.stringify({
      title: "ADM auto free", description: "e2e free-game auto-bounty",
      game: "worm", prizeRibbit: 3000, durationDays: 7, autoPay: true, autoRenew: false,
    }),
  });
  if (autoFree.data?.id) bountyIds.push(autoFree.data.id);
  check("free-game auto-bounty has no credit threshold",
    autoFree.status === 200 && autoFree.data.triggerCreditVolume === null,
    `status ${autoFree.status} data ${JSON.stringify(autoFree.data)}`);

  // ---------------- BOUNTY EDIT / DELETE ----------------
  console.log("— Bounty edit re-derives the trigger; delete obeys the audit rules");
  const eb = await admin.api("/api/admin/bounties", {
    method: "POST",
    body: JSON.stringify({
      // Blackjack (also a credit game → same trigger math) so it doesn't hit
      // the one-open-per-game guard against the dice auto-bounty above.
      title: "ADM editable", description: "e2e edit/delete test", autoRenew: false,
      game: "blackjack", prizeRibbit: 5000, durationDays: 7, autoPay: true,
    }),
  });
  if (eb.data?.id) bountyIds.push(eb.data.id);
  check("editable bounty created w/ derived trigger", eb.data?.triggerCreditVolume === req5000);
  const edit = await admin.api(`/api/admin/bounties/${eb.data.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "edit", title: "ADM edited", prizeRibbit: 10000, extendDays: 3 }),
  });
  const req10000 = await requiredCredits(10000n * RAW);
  check("edit succeeds and re-derives trigger (10000 $RIBBIT)",
    edit.status === 200 && edit.data.triggerCreditVolume === req10000,
    JSON.stringify(edit.data));
  const edited = await prisma.bounty.findUnique({ where: { id: eb.data.id } });
  check("edit persisted (title + prize)",
    edited.title === "ADM edited" && edited.prizeRibbit === 10000n * RAW);

  const del = await admin.api(`/api/admin/bounties/${eb.data.id}`, {
    method: "POST", body: JSON.stringify({ action: "delete" }),
  });
  check("unpaid bounty deletes", del.status === 200 && del.data.deleted === true);
  const gone = await prisma.bounty.findUnique({ where: { id: eb.data.id } });
  check("deleted bounty is gone", gone === null);

  // paid bounties are immutable: bId was paid earlier in this run
  const delPaid = await admin.api(`/api/admin/bounties/${bId}`, {
    method: "POST", body: JSON.stringify({ action: "delete" }),
  });
  check("paid bounty refuses delete (409)", delPaid.status === 409, `got ${delPaid.status}`);
  const editPaid = await admin.api(`/api/admin/bounties/${bId}`, {
    method: "POST", body: JSON.stringify({ action: "edit", title: "nope, immutable" }),
  });
  check("paid bounty refuses edit (409)", editPaid.status === 409, `got ${editPaid.status}`);

  // ---------------- AUCTION EDIT / DELETE ----------------
  console.log("— Auction edit locks terms once bids exist; delete needs a clean lot");
  const cleanLot = await prisma.auction.create({
    data: { title: "ADM clean lot", description: "e2e", startBidRaw: 10n * RAW, minIncrement: 1n * RAW,
      endsAt: new Date(Date.now() + 3600_000) },
  });
  auctionIds.push(cleanLot.id);
  const aEdit = await admin.api(`/api/admin/auctions/${cleanLot.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "edit", title: "ADM clean lot v2", startBidRibbit: 25, extendHours: 2 }),
  });
  check("bid-less lot: full edit ok", aEdit.status === 200, JSON.stringify(aEdit.data));
  const editedLot = await prisma.auction.findUnique({ where: { id: cleanLot.id } });
  check("lot terms updated", editedLot.title === "ADM clean lot v2" && editedLot.startBidRaw === 25n * RAW);

  // auc2 (settled earlier) has bids: terms locked; use a live lot with a bid
  const bidLot = await prisma.auction.create({
    data: { title: "ADM bid lot", description: "e2e", startBidRaw: 10n * RAW, minIncrement: 1n * RAW,
      endsAt: new Date(Date.now() + 3600_000) },
  });
  auctionIds.push(bidLot.id);
  await prisma.user.update({ where: { id: wbU.id }, data: { ribbitBalance: 200n * RAW, ribbitLocked: 0n } });
  await winnerB.api(`/api/auctions/${bidLot.id}/bid`, {
    method: "POST", body: JSON.stringify({ amountRaw: (20n * RAW).toString() }),
  });
  const lockedEdit = await admin.api(`/api/admin/auctions/${bidLot.id}`, {
    method: "POST", body: JSON.stringify({ action: "edit", startBidRibbit: 50 }),
  });
  check("lot with bids: terms edit refused (409)", lockedEdit.status === 409, `got ${lockedEdit.status}`);
  const copyEdit = await admin.api(`/api/admin/auctions/${bidLot.id}`, {
    method: "POST", body: JSON.stringify({ action: "edit", title: "ADM bid lot (copy fix)" }),
  });
  check("lot with bids: copy edit still ok", copyEdit.status === 200);
  const delBid = await admin.api(`/api/admin/auctions/${bidLot.id}`, {
    method: "POST", body: JSON.stringify({ action: "delete" }),
  });
  check("lot with bids refuses delete (409)", delBid.status === 409, `got ${delBid.status}`);
  const delClean = await admin.api(`/api/admin/auctions/${cleanLot.id}`, {
    method: "POST", body: JSON.stringify({ action: "delete" }),
  });
  check("clean lot deletes", delClean.status === 200 && delClean.data.deleted === true);
  // still cancel bidLot so escrow unlocks for cleanup
  await admin.api(`/api/admin/auctions/${bidLot.id}`, {
    method: "POST", body: JSON.stringify({ action: "cancel" }),
  });

  // ---------------- PLAYER MANAGEMENT: ban + credits ----------------
  console.log("— Ban bites live sessions; credit adjustments are guarded + ledgered");
  const banned = player();
  await banned.signIn();
  wallets.push(banned.wallet);
  const preBan = await banned.api("/api/arcade/start", {
    method: "POST", body: JSON.stringify({ game: "worm" }),
  });
  check("player can act before ban", preBan.status === 200);
  const doBan = await admin.api("/api/admin/users", {
    method: "POST", body: JSON.stringify({ wallet: banned.wallet, action: "ban" }),
  });
  check("ban succeeds", doBan.status === 200 && doBan.data.isBanned === true);
  const postBan = await banned.api("/api/arcade/start", {
    method: "POST", body: JSON.stringify({ game: "worm" }),
  });
  check("banned wallet blocked on a LIVE session (403)", postBan.status === 403,
    `got ${postBan.status}`);
  let freshSignIn = true;
  try { await banned.signIn(); } catch { freshSignIn = false; }
  check("banned wallet cannot sign in again", freshSignIn === false);
  await admin.api("/api/admin/users", {
    method: "POST", body: JSON.stringify({ wallet: banned.wallet, action: "unban" }),
  });
  const postUnban = await banned.api("/api/arcade/start", {
    method: "POST", body: JSON.stringify({ game: "worm" }),
  });
  check("unban restores access", postUnban.status === 200, `got ${postUnban.status}`);

  const grant = await admin.api("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ wallet: banned.wallet, action: "credits", delta: 50, note: "e2e comp" }),
  });
  check("credit grant applies", grant.status === 200 && grant.data.credits === 50);
  const over = await admin.api("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ wallet: banned.wallet, action: "credits", delta: -100, note: "e2e over" }),
  });
  check("over-removal refused (409, guarded ledger)", over.status === 409, `got ${over.status}`);
  const ledger = await prisma.ledgerEntry.findFirst({
    where: { user: { wallet: banned.wallet }, kind: "admin" },
  });
  check("adjustment is ledgered with the admin's note",
    !!ledger && ledger.delta === 50 && (ledger.ref ?? "").includes("e2e comp"));
  const profile = await admin.api(`/api/admin/users?wallet=${banned.wallet}`);
  check("player lookup returns profile", profile.status === 200 && profile.data.credits === 50);

  // ---------------- HOUSE CONTROLS (live settings) ----------------
  console.log("— House controls: live overrides, validation, kill switches, audit");
  const sList = await admin.api("/api/admin/settings");
  check("settings registry lists the burn/buy rate",
    sList.status === 200 && sList.data.settings.some((x) => x.key === "buyBurnShare"));
  const sForbidden = await banned.api("/api/admin/settings");
  check("non-admin settings access refused (403)", sForbidden.status === 403);

  const setEdge = await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "houseEdge", value: 0.06 }),
  });
  check("house edge override applies", setEdge.status === 200 && setEdge.data.effective === 0.06);
  const pubCfg = await admin.api("/api/config");
  check("public /api/config serves the LIVE edge", pubCfg.data.houseEdge === 0.06);

  // the edge must bite actual gameplay: dice multiplier = (100/target)·(1−edge)
  await prisma.user.update({
    where: { wallet: banned.wallet }, data: { credits: 50 },
  });
  const diceRound = await banned.api("/api/games/dice", {
    method: "POST",
    body: JSON.stringify({ target: 50, wager: 5, clientSeed: "e2e-edge" }),
  });
  check("dice round pays at the LIVE edge (2×0.94 = 1.88)",
    diceRound.status === 200 && diceRound.data.outcome.multiplier === 1.88,
    JSON.stringify(diceRound.data.outcome ?? diceRound.data));

  const badEdge = await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "houseEdge", value: 0.5 }),
  });
  check("out-of-range edge rejected (422)", badEdge.status === 422, `got ${badEdge.status}`);

  const setMin = await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "minWager", value: 10 }),
  });
  check("min wager raised live", setMin.status === 200 && setMin.data.effective === 10);
  const tooSmall = await banned.api("/api/games/dice", {
    method: "POST",
    body: JSON.stringify({ target: 50, wager: 5, clientSeed: "e2e-min" }),
  });
  check("wager under the live minimum refused (422)", tooSmall.status === 422,
    `got ${tooSmall.status}`);
  await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "minWager", action: "reset" }),
  });

  const pause = await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "gamesPaused", value: true }),
  });
  check("tables pause switch flips", pause.status === 200 && pause.data.effective === true);
  const pausedPlay = await banned.api("/api/games/flip", {
    method: "POST",
    body: JSON.stringify({ side: "frog", wager: 5, clientSeed: "e2e-pause" }),
  });
  check("paused table refuses new rounds (423)", pausedPlay.status === 423,
    `got ${pausedPlay.status}`);
  const pausedStart = await banned.api("/api/arcade/start", {
    method: "POST", body: JSON.stringify({ game: "worm" }),
  });
  check("paused arcade refuses new runs (423)", pausedStart.status === 423);
  await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "gamesPaused", value: false }),
  });
  const resumedPlay = await banned.api("/api/games/flip", {
    method: "POST",
    body: JSON.stringify({ side: "frog", wager: 5, clientSeed: "e2e-resume" }),
  });
  check("unpaused table deals again", resumedPlay.status === 200, `got ${resumedPlay.status}`);

  const setSplit = await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "buyBurnShare", value: 0.6 }),
  });
  check("burn/buy rate arranged live (0.5 → 0.6)",
    setSplit.status === 200 && setSplit.data.effective === 0.6);
  const cfg2 = await admin.api("/api/config");
  check("clients see the new split before building the buy tx",
    cfg2.data.buyBurnShare === 0.6);

  const audit = await prisma.treasuryEvent.findFirst({
    where: { kind: "config", ref: "houseEdge" }, orderBy: { createdAt: "desc" },
  });
  check("config changes audited on the treasury ledger",
    !!audit && audit.note.includes("0.06") && audit.note.includes(admin.wallet.slice(0, 4)),
    audit ? audit.note : "no config audit event");

  const resetEdge = await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "houseEdge", action: "reset" }),
  });
  check("reset returns edge to the env default",
    resetEdge.status === 200 && resetEdge.data.effective === 0.04 &&
      resetEdge.data.overridden === false);
  await admin.api("/api/admin/settings", {
    method: "POST", body: JSON.stringify({ key: "buyBurnShare", action: "reset" }),
  });
  const cfg3 = await admin.api("/api/config");
  check("all knobs back at defaults", cfg3.data.houseEdge === 0.04 && cfg3.data.buyBurnShare === 0.5);

  // overview stats present
  const ov = await admin.api("/api/admin/overview");
  check("overview exposes house stats", ov.status === 200 &&
    typeof ov.data.stats?.users === "number" &&
    typeof ov.data.stats?.creditsOutstanding === "number");
} finally {
  console.log("\ncleaning test data…");
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: "OWP-E2E-" } } });
  // NOTE: the owner's parked bounties are reopened at the BOTTOM of this
  // block, only after every suite round is deleted — reopening first left a
  // seconds-wide gap where a public poll could settle a REAL pot against
  // suite volume.
  // Restore the settings this suite touched to EXACTLY their pre-run state —
  // the owner may have live overrides (e.g. buyBurnShare) that a blanket
  // delete would silently revert to env defaults on the production DB.
  await prisma.houseSetting.deleteMany({ where: { key: { in: TOUCHED_SETTINGS } } });
  for (const row of preSettings) {
    await prisma.houseSetting.create({
      data: { key: row.key, value: row.value, updatedBy: row.updatedBy },
    });
  }
  await prisma.treasuryEvent.deleteMany({
    where: { kind: "config", ref: { in: TOUCHED_SETTINGS } },
  });
  // A transient failure can leave an undefined id in these arrays — filter it
  // so cleanup itself never crashes and always runs to completion.
  const admStrays = await prisma.bounty.findMany({
    where: { title: { startsWith: "ADM" } },
    select: { id: true },
  });
  bountyIds.push(...admStrays.map((x) => x.id));
  const bIds = [...new Set(bountyIds.filter(Boolean))];
  const aIds = auctionIds.filter(Boolean);
  await prisma.withdrawal.deleteMany({ where: { ref: { in: bIds } } });
  await prisma.treasuryEvent.deleteMany({ where: { ref: { in: [...bIds, ...aIds] } } });
  await prisma.bountyAward.deleteMany({ where: { bountyId: { in: bIds } } });
  await prisma.bounty.deleteMany({ where: { id: { in: bIds } } });
  await prisma.bid.deleteMany({ where: { auctionId: { in: aIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: aIds } } });
  for (const w of wallets) {
    const u = await prisma.user.findUnique({ where: { wallet: w } });
    if (!u) continue;
    await prisma.arcadeScore.deleteMany({ where: { userId: u.id } });
    await prisma.arcadeRun.deleteMany({ where: { userId: u.id } });
    await prisma.burnEvent.deleteMany({ where: { userId: u.id } });
    await prisma.withdrawal.deleteMany({ where: { userId: u.id } });
    await prisma.bid.deleteMany({ where: { userId: u.id } });
    await prisma.gameRound.deleteMany({ where: { userId: u.id } });
    await prisma.serverSeed.deleteMany({ where: { userId: u.id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
  }
  // Reopen the owner's parked bounties only now — every suite round that
  // could pollute their meters is gone.
  if (parkedBountyIds.length) {
    await prisma.bounty.updateMany({
      where: { id: { in: parkedBountyIds } },
      data: { status: "open" },
    });
  }
  // Lift the payouts pause only now — every suite withdrawal row is gone.
  // On a mid-cleanup crash payouts stay paused: the safe failure direction.
  if (prePayoutsPaused) {
    await prisma.houseSetting.upsert({
      where: { key: "payoutsPaused" },
      update: { value: prePayoutsPaused.value },
      create: { key: "payoutsPaused", value: prePayoutsPaused.value },
    });
  } else {
    await prisma.houseSetting.deleteMany({ where: { key: "payoutsPaused" } });
  }
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
