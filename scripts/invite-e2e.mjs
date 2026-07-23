// Invite-gate verification against a LIVE deployment (default: prod).
//   node scripts/invite-e2e.mjs [base-url]
// Needs DATABASE_URL (mints a test code + cleans up after itself).
//
// Proves, with a throwaway wallet, that when the inviteRequired switch is ON:
//   1. a NEW wallet's sign-in without a code is rejected with the invite prompt
//   2. a bogus code is rejected
//   3. a real code signs in, creates the user (invitedVia set), burns one use
//   4. the SAME wallet signs in again WITHOUT a code (existing users unaffected)
//   5. an exhausted code is rejected
// Self-cleaning: deletes the test user + test codes at the end.
import { PrismaClient } from "@prisma/client";
import nacl from "tweetnacl";
import bs58 from "bs58";

const BASE = process.argv[2] ?? "https://otherworld-projex.vercel.app";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) passed++;
  else failed++;
};

// --- throwaway SIWS wallet with its own cookie jar ---
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
let cookies = "";
const collect = (res) => {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const [k] = pair.split("=");
    cookies = cookies
      .split("; ")
      .filter((x) => x && !x.startsWith(`${k}=`))
      .concat(pair)
      .join("; ");
  }
};
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies },
    body: JSON.stringify(body),
  });
  collect(res);
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function signIn(inviteCode) {
  const n = await post("/api/auth/nonce", { wallet });
  if (n.status !== 200) return { status: n.status, data: n.data };
  const sig = nacl.sign.detached(new TextEncoder().encode(n.data.message), kp.secretKey);
  return post("/api/auth/verify", {
    wallet,
    signature: bs58.encode(sig),
    ...(inviteCode ? { inviteCode } : {}),
  });
}

console.log(`invite e2e → ${BASE}\n  test wallet ${wallet.slice(0, 8)}…\n`);

const gate = await prisma.houseSetting.findUnique({ where: { key: "inviteRequired" } });
if (gate?.value !== "true") {
  console.log("  ⚠ inviteRequired switch is OFF — gate checks would be vacuous. Aborting (nothing touched).");
  process.exit(2);
}

// Mint a single-use test code directly (admin API needs an admin wallet).
const code = `OWP-TEST-${Date.now().toString(36).toUpperCase().slice(-4)}`;
await prisma.inviteCode.create({ data: { code, maxUses: 1, note: "invite-e2e (auto-cleaned)" } });

try {
  const noCode = await signIn();
  check("new wallet w/o code → 403 invite prompt", noCode.status === 403 && /invite/i.test(noCode.data?.error ?? ""), `status ${noCode.status}: ${noCode.data?.error}`);

  const badCode = await signIn("OWP-NOPE-NOPE");
  check("bogus code → 403 invalid", badCode.status === 403 && /invalid/i.test(badCode.data?.error ?? ""), `status ${badCode.status}: ${badCode.data?.error}`);

  const good = await signIn(code.toLowerCase()); // case-insensitive on purpose
  check("valid code → signed in", good.status === 200 && good.data?.wallet === wallet, `status ${good.status}: ${good.data?.error ?? ""}`);

  const row = await prisma.user.findUnique({ where: { wallet } });
  check("user created with invitedVia", row?.invitedVia === code, `invitedVia=${row?.invitedVia}`);
  const used = await prisma.inviteCode.findUnique({ where: { code } });
  check("code use consumed (1/1)", used?.uses === 1);

  cookies = ""; // fresh browser — prove existing users skip the gate
  const again = await signIn();
  check("existing user w/o code → signs in", again.status === 200, `status ${again.status}: ${again.data?.error ?? ""}`);

  cookies = "";
  const kp2 = nacl.sign.keyPair();
  const wallet2 = bs58.encode(kp2.publicKey);
  const n2 = await post("/api/auth/nonce", { wallet: wallet2 });
  const sig2 = nacl.sign.detached(new TextEncoder().encode(n2.data.message), kp2.secretKey);
  const exhausted = await post("/api/auth/verify", { wallet: wallet2, signature: bs58.encode(sig2), inviteCode: code });
  check("exhausted code → 403 for the next wallet", exhausted.status === 403, `status ${exhausted.status}`);
} finally {
  // Clean up: the throwaway user (no money ever touched) + test codes.
  await prisma.user.deleteMany({ where: { wallet, invitedVia: { startsWith: "OWP-TEST-" } } });
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: "OWP-TEST-" } } });
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
