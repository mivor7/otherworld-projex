// Production smoke check — verifies the LIVE deployment end-to-end, because
// dev mode cannot reproduce prod-only failure modes (static route caching,
// missed deploys, env drift). Run after EVERY deploy:
//
//   node scripts/prod-smoke.mjs [https://your-prod-url]
//
// Read-only: hits public endpoints and asserts auth gates reject anonymous
// state changes. Touches no data.
const BASE = process.argv[2] ?? "https://otherworld-projex.vercel.app";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗ FAIL:"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  ok ? passed++ : failed++;
};

const get = async (p) => {
  const res = await fetch(BASE + p, { redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
};

console.log(`prod smoke → ${BASE}\n`);

// ---------- live data endpoints: fresh, correct shape ----------
console.log("— Live data endpoints");
const cfg = await get("/api/config");
check("/api/config is live JSON", cfg.status === 200 && typeof cfg.json?.ribbitPerCredit === "number",
  `status ${cfg.status}`);
check("/api/config is NOT cached",
  (cfg.headers.get("x-vercel-cache") ?? "MISS") !== "HIT" &&
    !(cfg.headers.get("cache-control") ?? "").includes("s-maxage"),
  `cache ${cfg.headers.get("x-vercel-cache")} / ${cfg.headers.get("cache-control")}`);

const bounties = await get("/api/bounties");
check("/api/bounties serves open bounties", bounties.status === 200 && Array.isArray(bounties.json?.open),
  `status ${bounties.status}`);
const withProgress = (bounties.json?.open ?? []).filter((b) => b.progress);
check("bounty progress meters present", withProgress.length > 0,
  `${(bounties.json?.open ?? []).length} open, 0 with progress`);

// Stored trigger must MATCH the live-derived one (admin and players see one
// number). Recompute from live config the same way the server does.
const cfgJ = cfg.json ?? {};
let triggerMismatch = null;
for (const b of bounties.json?.open ?? []) {
  if (b.progress?.mode !== "credit") continue;
  const prize = Number(BigInt(b.prizeRibbit) / 1_000_000n);
  const derived = Math.max(1, Math.ceil((prize / cfgJ.ribbitPerCredit) * 1.5 / cfgJ.houseEdge));
  if (b.progress.threshold < derived) triggerMismatch = `${b.title}: shows ${b.progress.threshold}, live rules demand ${derived}`;
}
check("no bounty shows a weaker trigger than live rules demand", !triggerMismatch, triggerMismatch ?? "");

const live = await get("/api/bounties/live");
check("/api/bounties/live game summaries", live.status === 200 && typeof live.json?.games === "object",
  `status ${live.status}`);
const treasury = await get("/api/treasury");
check("/api/treasury totals", treasury.status === 200 && treasury.json?.totals !== undefined,
  `status ${treasury.status}`);
const activity = await get("/api/activity");
check("/api/activity feed", activity.status === 200 && Array.isArray(activity.json),
  `status ${activity.status}`);
const lb = await get("/api/leaderboard?game=worm");
check("/api/leaderboard", lb.status === 200 && Array.isArray(lb.json), `status ${lb.status}`);
const auctions = await get("/api/auctions");
check("/api/auctions", auctions.status === 200, `status ${auctions.status}`);

// ---------- pages render ----------
console.log("— Pages");
for (const [p, marker] of [
  ["/", "bounty"],
  ["/games", "credit"],
  ["/bounties", ""],
  ["/treasury", ""],
  ["/fairness", ""],
  ["/admin", ""],
]) {
  const r = await get(p);
  check(`${p} renders`, r.status === 200 && (!marker || r.text.toLowerCase().includes(marker)),
    `status ${r.status}`);
}

// ---------- auth gates: anonymous state changes must be rejected ----------
console.log("— Auth gates (anonymous must be rejected)");
const post = async (p, body) => {
  const res = await fetch(BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
};
check("flip round w/o session → 401", (await post("/api/games/flip", { side: "frog", wager: 5, clientSeed: "x" })) === 401);
check("admin bounty create w/o session → 401", (await post("/api/admin/bounties", { title: "x", description: "xxxxxxxxxxx", game: "dice", prizeRibbit: 100, durationDays: 7 })) === 401);
check("admin settings w/o session → 401", (await post("/api/admin/settings", { key: "houseEdge", value: 0.05 })) === 401);
check("withdrawal w/o session → 401", (await post("/api/withdrawals", { amountRaw: "1000000" })) === 401);
const adminOverview = await get("/api/admin/overview");
check("admin overview w/o session → 401", adminOverview.status === 401, `status ${adminOverview.status}`);
const faucet = await post("/api/dev/faucet", {});
check("dev faucet disabled in prod", faucet === 401 || faucet === 403 || faucet === 404, `status ${faucet}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
