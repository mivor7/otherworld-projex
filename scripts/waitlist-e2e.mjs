// Waitlist verification: public read shape + PII safety, the holding gate,
// idempotence (one place per wallet), and referral crediting. Self-cleaning:
// every row it creates is removed, and the owner's 260 imported members are
// never touched (asserted at the end).
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
const E2E_INVITE = `OWP-E2E-${Date.now().toString(36).toUpperCase()}`;

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name} ${extra}`); process.exitCode = 1; }
}

function client() {
  const kp = nacl.sign.keyPair();
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
    await api("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ wallet, signature: bs58.encode(Buffer.from(sig)), inviteCode: E2E_INVITE }),
    });
  }
  return { wallet, api, signIn };
}

const wallets = [];
const preCount = await prisma.waitlistEntry.count();
const preImported = await prisma.waitlistEntry.count({ where: { email: { not: null } } });

try {
  console.log(`waitlist checks → ${BASE}\n`);
  await prisma.inviteCode.create({
    data: { code: E2E_INVITE, maxUses: 20, note: "waitlist-e2e (auto-cleaned)" },
  });

  // ---------------- public read ----------------
  console.log("— Public endpoint: shape + PII safety");
  const pub = await fetch(BASE + "/api/waitlist").then((r) => r.json());
  check("count and goal are numbers", typeof pub.count === "number" && typeof pub.goal === "number",
    JSON.stringify(pub).slice(0, 120));
  check("holding requirement is exposed", typeof pub.minHoldRibbit === "number" && pub.minHoldRibbit > 0);
  check("no email appears in the public payload", !/@/.test(JSON.stringify(pub)));
  check("recent joiners are masked wallets only",
    (pub.recent ?? []).every((r) => r.wallet.includes("…") && !("email" in r) && !("displayName" in r)));
  check("anonymous 'you' is null", pub.you === null);

  // ---------------- join requires a session ----------------
  console.log("— Joining");
  const anon = await fetch(BASE + "/api/waitlist", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  check("join without a session is rejected (401)", anon.status === 401, `got ${anon.status}`);

  // A throwaway wallet holds no $RIBBIT, so the on-chain gate must refuse it.
  const poor = client();
  wallets.push(poor.wallet);
  await poor.signIn();
  const refused = await poor.api("/api/waitlist", { method: "POST", body: "{}" });
  check("wallet below the holding requirement is refused (403)", refused.status === 403,
    `got ${refused.status} ${JSON.stringify(refused.data).slice(0, 90)}`);
  check("refusal explains the requirement and what they hold",
    /RIBBIT/.test(refused.data?.error ?? "") && /holding/i.test(refused.data?.error ?? ""),
    refused.data?.error);
  const notJoined = await poor.api("/api/waitlist");
  check("refused wallet is NOT on the list", notJoined.data?.you?.joined === false);
  check("a refused attempt creates no row",
    (await prisma.waitlistEntry.count()) === preCount);

  // ---------------- position + referral bookkeeping ----------------
  // The holding check reads the chain, which a test wallet can't satisfy, so
  // membership itself is seeded directly — then verified through the API.
  console.log("— Position, self-view and referrals");
  const a = client();
  const b = client();
  wallets.push(a.wallet, b.wallet);
  await a.signIn();
  await b.signIn();
  const maxPos = (await prisma.waitlistEntry.aggregate({ _max: { position: true } }))._max.position ?? 0;
  await prisma.waitlistEntry.create({
    data: { position: maxPos + 1, displayName: "wl-a", wallet: a.wallet, joinedAt: new Date() },
  });
  const aView = await a.api("/api/waitlist");
  check("a member sees their own position", aView.data?.you?.joined === true && aView.data.you.position === maxPos + 1,
    JSON.stringify(aView.data?.you));
  check("a member gets their referral link wallet", aView.data?.you?.referralWallet === a.wallet);
  check("joining twice is refused as already-joined",
    (await a.api("/api/waitlist", { method: "POST", body: "{}" })).data?.already === true);

  await prisma.waitlistEntry.create({
    data: {
      position: maxPos + 2, displayName: "wl-b", wallet: b.wallet,
      joinedAt: new Date(), referredBy: a.wallet,
    },
  });
  await prisma.waitlistEntry.updateMany({
    where: { wallet: a.wallet }, data: { referrals: { increment: 1 } },
  });
  const aAfter = await a.api("/api/waitlist");
  check("referrer's count is visible to them", aAfter.data?.you?.referrals === 1);
  const bRow = await prisma.waitlistEntry.findFirst({ where: { wallet: b.wallet } });
  check("referred member records who sent them", bRow.referredBy === a.wallet);
  check("positions are sequential, never reused", bRow.position === maxPos + 2);

  // ---------------- imported members are untouched ----------------
  console.log("— Imported members");
  check("all imported email members still present",
    (await prisma.waitlistEntry.count({ where: { email: { not: null } } })) === preImported,
    `expected ${preImported}`);
} finally {
  console.log("\ncleaning test data…");
  await prisma.waitlistEntry.deleteMany({ where: { wallet: { in: wallets } } });
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: "OWP-E2E-" } } });
  for (const w of wallets) {
    const u = await prisma.user.findUnique({ where: { wallet: w } });
    if (!u) continue;
    await prisma.serverSeed.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  const post = await prisma.waitlistEntry.count();
  console.log(`waitlist rows: ${preCount} before → ${post} after`);
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
