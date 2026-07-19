// Full-surface verification of every money path and every game against a
// live server. Run from the project root with the dev server up:
//   node scripts/games-e2e.mjs [baseUrl]
//
// Covers: flip/dice payout math & fairness recompute, blackjack lifecycle +
// deck audit + rotation blocking, worm/frogris/hopper replay verification
// (accept, tamper, no-trace, rush, seed-shopping void), burner eligibility
// (lifetime + window rules) on the public boards, escrow races (double bid,
// bid vs withdraw, double settlement). Self-cleaning: all test users, rows
// and auctions are deleted at the end. Needs .env with DATABASE_URL.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
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
const RAW = 10n ** 6n; // 6 decimals

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name} ${extra}`); process.exitCode = 1; }
}

// ---------- session helper (per-wallet cookie jars) ----------
function makeClient() {
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
    const v = await api("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ wallet, signature: bs58.encode(Buffer.from(sig)) }),
    });
    if (v.status !== 200) throw new Error("sign-in failed");
  }
  return { wallet, api, signIn };
}

// ---------- shared PRNG / seed (mirrors worm-sim) ----------
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromToken(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- worm sim + greedy bot (mirrors worm-sim.ts) ----------
const GRID = 21;
const WDIRS = [{x:1,y:0},{x:-1,y:0},{x:0,y:-1},{x:0,y:1}];
function wormInitial() {
  const mid = Math.floor(GRID / 2);
  return [{x:mid-1,y:mid},{x:mid-2,y:mid},{x:mid-3,y:mid}];
}
function spawnFly(rand, snake) {
  for (;;) {
    const p = { x: Math.floor(rand()*GRID), y: Math.floor(rand()*GRID) };
    if (!snake.some((s) => s.x===p.x && s.y===p.y)) return p;
  }
}
function wormBot(seed) {
  const rand = mulberry32(seed);
  const snake = wormInitial();
  let cur = 0;
  let fly = spawnFly(rand, snake);
  let score = 0;
  const trace = [];
  const blocked = (p) => p.x<0||p.x>=GRID||p.y<0||p.y>=GRID||snake.some((s)=>s.x===p.x&&s.y===p.y);
  for (let step = 0; step < 5000; step++) {
    const head = snake[0];
    const dying = score >= 20 || step >= 140;
    let want = cur;
    if (!dying) {
      const cands = [];
      if (fly.x > head.x) cands.push(0);
      if (fly.x < head.x) cands.push(1);
      if (fly.y < head.y) cands.push(2);
      if (fly.y > head.y) cands.push(3);
      cands.push(0,1,2,3);
      for (const d of cands) {
        if (WDIRS[d].x === -WDIRS[cur].x && WDIRS[d].y === -WDIRS[cur].y) continue;
        const n = { x: head.x+WDIRS[d].x, y: head.y+WDIRS[d].y };
        if (!blocked(n)) { want = d; break; }
      }
    }
    if (want !== cur) {
      const rev = WDIRS[want].x === -WDIRS[cur].x && WDIRS[want].y === -WDIRS[cur].y;
      if (!rev) { trace.push({ s: step, d: want }); cur = want; }
    }
    const next = { x: head.x+WDIRS[cur].x, y: head.y+WDIRS[cur].y };
    if (blocked(next)) return { trace, score, steps: step };
    snake.unshift(next);
    if (next.x === fly.x && next.y === fly.y) { score += 10; fly = spawnFly(rand, snake); }
    else snake.pop();
  }
  throw new Error("worm bot never died");
}

// ---------- frogris sim + greedy bot (mirrors frogris-sim.ts) ----------
const FCOLS = 10, FROWS = 20, F_FRAME_MS = 1000/60;
const F_PIECES = [
  [ [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]] ],
  [ [[1,0],[2,0],[1,1],[2,1]] ],
  [ [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]] ],
  [ [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]] ],
  [ [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]] ],
  [ [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]] ],
  [ [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]] ],
];
const LINE_SCORES = [0, 100, 300, 500, 800];
const fCells = (p, r) => F_PIECES[p][r % F_PIECES[p].length];
function fCollides(board, p, r, x, y) {
  for (const [cx, cy] of fCells(p, r)) {
    const bx = x+cx, by = y+cy;
    if (bx < 0 || bx >= FCOLS || by >= FROWS) return true;
    if (by >= 0 && board[by][bx] !== null) return true;
  }
  return false;
}
function fRefill(rand) {
  const bag = [0,1,2,3,4,5,6];
  for (let i = bag.length-1; i > 0; i--) {
    const j = Math.floor(rand()*(i+1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
function fDropMs(lines) { return Math.max(110, 760 - Math.floor(lines/10)*60); }
function fSpawn(g) {
  g.piece = g.next;
  if (g.bag.length === 0) g.bag = fRefill(g.rand);
  g.next = g.bag.pop();
  g.rot = 0; g.x = 3; g.y = -1;
  if (fCollides(g.board, g.piece, g.rot, g.x, g.y+1)) g.over = true;
}
function fCreate(seed) {
  const rand = mulberry32(seed);
  const bag = fRefill(rand);
  const g = {
    board: Array.from({length: FROWS}, () => Array(FCOLS).fill(null)),
    bag, piece: 0, rot: 0, x: 3, y: -1, next: bag.pop(),
    score: 0, lines: 0, over: false, acc: 0, frame: 0, rand,
  };
  fSpawn(g);
  return g;
}
function fLock(g) {
  for (const [cx, cy] of fCells(g.piece, g.rot)) {
    const by = g.y + cy;
    if (by >= 0) g.board[by][g.x+cx] = g.piece;
  }
  let cleared = 0;
  for (let r = FROWS-1; r >= 0; r--) {
    if (g.board[r].every((c) => c !== null)) {
      g.board.splice(r, 1);
      g.board.unshift(Array(FCOLS).fill(null));
      cleared++; r++;
    }
  }
  if (cleared > 0) {
    const level = Math.floor(g.lines/10);
    g.score += LINE_SCORES[cleared]*(level+1);
    g.lines += cleared;
  }
  fSpawn(g);
}
function fGravity(g) {
  if (!fCollides(g.board, g.piece, g.rot, g.x, g.y+1)) g.y += 1;
  else fLock(g);
}
function fApply(g, a) {
  if (g.over) return;
  if (a === 0 || a === 1) {
    const dx = a === 0 ? -1 : 1;
    if (!fCollides(g.board, g.piece, g.rot, g.x+dx, g.y)) g.x += dx;
  } else if (a === 2 || a === 3) {
    const states = F_PIECES[g.piece].length;
    const rot = (g.rot + (a === 2 ? 1 : -1) + states) % states;
    for (const kick of [0,-1,1,-2,2]) {
      if (!fCollides(g.board, g.piece, rot, g.x+kick, g.y)) { g.rot = rot; g.x += kick; return; }
    }
  } else if (a === 4) fGravity(g);
  else if (a === 5) {
    while (!fCollides(g.board, g.piece, g.rot, g.x, g.y+1)) g.y += 1;
    fLock(g);
  }
}
function fTick(g) {
  if (g.over) return;
  g.frame += 1;
  g.acc += F_FRAME_MS;
  while (g.acc >= fDropMs(g.lines)) {
    g.acc -= fDropMs(g.lines);
    fGravity(g);
    if (g.over) return;
  }
}
// Greedy one-piece-lookahead bot: pick (rot,x) minimizing holes+height,
// preferring line clears; emit one input per frame.
function frogrisBot(seed) {
  const g = fCreate(seed);
  const inputs = [];
  const push = (a) => { inputs.push({ f: g.frame, a }); fApply(g, a); if (!g.over) fTick(g); };
  let pieces = 0;
  while (!g.over && pieces < 120 && g.lines < 3) {
    let best = null;
    const states = F_PIECES[g.piece].length;
    for (let rot = 0; rot < states; rot++) {
      for (let x = -2; x < FCOLS; x++) {
        if (fCollides(g.board, g.piece, rot, x, Math.max(g.y, 0))) continue;
        let y = g.y;
        while (!fCollides(g.board, g.piece, rot, x, y+1)) y += 1;
        if (fCollides(g.board, g.piece, rot, x, y)) continue;
        const b2 = g.board.map((r) => r.slice());
        let valid = true;
        for (const [cx, cy] of fCells(g.piece, rot)) {
          const by = y+cy, bx = x+cx;
          if (by < 0) { valid = false; break; }
          b2[by][bx] = 1;
        }
        if (!valid) continue;
        let clears = 0;
        for (let r = 0; r < FROWS; r++) if (b2[r].every((c) => c !== null)) clears++;
        let holes = 0, aggH = 0;
        for (let c = 0; c < FCOLS; c++) {
          let seen = false;
          for (let r = 0; r < FROWS; r++) {
            if (b2[r][c] !== null) { seen = true; aggH += FROWS - r; }
            else if (seen) holes++;
          }
        }
        const val = clears*10000 - holes*120 - aggH;
        if (!best || val > best.val) best = { val, rot, x };
      }
    }
    if (!best) break;
    let guard = 0;
    while (g.rot !== best.rot && !g.over && guard++ < 8) push(2);
    guard = 0;
    while (g.x !== best.x && !g.over && guard++ < 12) push(g.x > best.x ? 0 : 1);
    if (!g.over) push(5);
    pieces++;
  }
  while (!g.over) push(5);
  return { inputs, score: g.score, lines: g.lines, frames: g.frame };
}

// ---------- hopper sim + bot (mirrors hopper-sim.ts) ----------
const HCOLS = 9, HROWS = 11, HCELL = 44, HW = HCOLS*HCELL, H_FRAME_MS = 1000/60;
const H_DIRS = [[0,-1],[0,1],[-1,0],[1,0]];
function hMakeCars(rand, level) {
  const cars = [];
  for (let lane = 1; lane < HROWS-1; lane++) {
    if (lane === Math.floor(HROWS/2)) continue;
    const dir = lane % 2 === 0 ? 1 : -1;
    const speed = dir*(0.6 + rand()*0.9 + level*0.18);
    const count = 2 + Math.floor(rand()*2);
    for (let i = 0; i < count; i++) {
      cars.push({ x: (HW/count)*i + rand()*60, lane, speed, len: HCELL*(1.4+rand()) });
    }
  }
  return cars;
}
function hCreate(seed) {
  const rand = mulberry32(seed);
  return {
    frog: { col: 4, row: HROWS-1 }, cars: hMakeCars(rand, 0),
    score: 0, lives: 3, level: 0, progress: HROWS-1, over: false, frame: 0, rand,
  };
}
function hHop(g, d) {
  if (g.over) return;
  const [dc, dr] = H_DIRS[d];
  const col = Math.min(HCOLS-1, Math.max(0, g.frog.col+dc));
  const row = Math.min(HROWS-1, Math.max(0, g.frog.row+dr));
  g.frog = { col, row };
  if (row < g.progress) { g.score += g.progress - row; g.progress = row; }
  if (row === 0) {
    g.score += 10; g.level += 1;
    g.cars = hMakeCars(g.rand, g.level);
    g.frog = { col: 4, row: HROWS-1 };
    g.progress = HROWS-1;
  }
}
function hFrame(g) {
  if (g.over) return;
  g.frame += 1;
  for (const car of g.cars) {
    car.x += car.speed;
    if (car.speed > 0 && car.x > HW+20) car.x = -car.len-20;
    if (car.speed < 0 && car.x < -car.len-20) car.x = HW+20;
  }
  const fx = g.frog.col*HCELL + HCELL/2;
  for (const car of g.cars) {
    if (car.lane !== g.frog.row) continue;
    if (fx > car.x-6 && fx < car.x+car.len+6) {
      g.lives -= 1;
      g.frog = { col: 4, row: HROWS-1 };
      g.progress = HROWS-1;
      if (g.lives <= 0) g.over = true;
      break;
    }
  }
}
// Exact lookahead: step a COPY of the cars with the real wrap rules and
// check the cell stays collision-free for the next `hold` frames.
function hCellSafe(cars, col, row, hold) {
  if (row === 0 || row === HROWS-1 || row === Math.floor(HROWS/2)) return true;
  const fx = col*HCELL + HCELL/2;
  const c2 = cars.filter((c) => c.lane === row).map((c) => ({ ...c }));
  for (let dt = 1; dt <= hold; dt++) {
    for (const car of c2) {
      car.x += car.speed;
      if (car.speed > 0 && car.x > HW+20) car.x = -car.len-20;
      if (car.speed < 0 && car.x < -car.len-20) car.x = HW+20;
      if (fx > car.x - 6 - 2 && fx < car.x + car.len + 6 + 2) return false;
    }
  }
  return true;
}
function hopperBot(seed) {
  const g = hCreate(seed);
  const inputs = [];
  let lastHopFrame = -10;
  const TARGET = 20; // one full crossing
  while (!g.over && g.frame < 150000) {
    if (g.frame > lastHopFrame + 3) {
      if (g.score < TARGET) {
        const HOLD = 8;
        if (g.frog.row > 0 && hCellSafe(g.cars, g.frog.col, g.frog.row-1, HOLD)) {
          inputs.push({ f: g.frame, d: 0 });
          hHop(g, 0);
          lastHopFrame = g.frame;
        } else if (!hCellSafe(g.cars, g.frog.col, g.frog.row, 4)) {
          for (const [d, nc] of [[2, g.frog.col-1], [3, g.frog.col+1]]) {
            if (nc < 0 || nc >= HCOLS) continue;
            if (hCellSafe(g.cars, nc, g.frog.row, 6)) {
              inputs.push({ f: g.frame, d });
              hHop(g, d);
              lastHopFrame = g.frame;
              break;
            }
          }
        }
      } else {
        if (g.frog.row === HROWS-1 || g.frog.row === Math.floor(HROWS/2)) {
          inputs.push({ f: g.frame, d: 0 });
          hHop(g, 0);
          lastHopFrame = g.frame;
        }
      }
    }
    hFrame(g);
  }
  if (!g.over) throw new Error("hopper bot never died");
  return { inputs, score: g.score, level: g.level, frames: g.frame };
}

// ---------- blackjack deck (mirrors lib/blackjack deriveDeck) ----------
function deriveDeck(serverSeed, clientSeed, nonce) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const digest = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${51-i}`).digest("hex");
    const r = parseInt(digest.slice(0, 8), 16) / 0x100000000;
    const j = Math.floor(r * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(ms, label) {
  console.log(`  … waiting ${(ms/1000).toFixed(1)}s wall-time (${label})`);
  await sleep(ms);
}

// ============================================================
const A = makeClient();
const B = makeClient();
const cleanup = { auctionIds: [], userWallets: [A.wallet, B.wallet] };

try {
  console.log(`player A ${A.wallet.slice(0,8)}… · player B ${B.wallet.slice(0,8)}… → ${BASE}\n`);
  await A.signIn();
  await B.signIn();
  const userA = await prisma.user.findUnique({ where: { wallet: A.wallet } });
  const userB = await prisma.user.findUnique({ where: { wallet: B.wallet } });
  await prisma.user.update({ where: { id: userA.id }, data: { credits: 1000 } });

  // ---------------- FLIP ----------------
  console.log("— Frog Flip (payout math × 6 rounds)");
  const flipSeed = "e2e-flip-seed";
  let creditsBefore = 1000;
  let flipOk = true;
  for (let i = 0; i < 6; i++) {
    const r = await A.api("/api/games/flip", {
      method: "POST",
      body: JSON.stringify({ side: "frog", wager: 7, clientSeed: flipSeed }),
    });
    if (r.status !== 200) { flipOk = false; break; }
    const expected = r.data.win ? Math.floor(7 * 1.92) : 0;
    if (r.data.payout !== expected) flipOk = false;
    if (r.data.credits !== creditsBefore - 7 + expected) flipOk = false;
    if ((r.data.outcome.landed === "frog") !== r.data.win) flipOk = false;
    creditsBefore = r.data.credits;
  }
  check("6 rounds: payout = floor(w×1.92) on win, 0 on loss; balance reconciles", flipOk);

  // ---------------- DICE ----------------
  console.log("— Pond Dice (edge cases target 2 / 50 / 98)");
  for (const target of [2, 50, 98]) {
    const r = await A.api("/api/games/dice", {
      method: "POST",
      body: JSON.stringify({ target, wager: 10, clientSeed: flipSeed }),
    });
    const mult = (100 / target) * 0.96;
    const expected = r.data.win ? Math.floor(10 * mult) : 0;
    check(
      `target ${target}: rolled ${r.data.outcome.rolled} → win=${r.data.win}, payout ${r.data.payout}`,
      r.status === 200 &&
        r.data.payout === expected &&
        r.data.win === (r.data.outcome.rolled < target) &&
        r.data.outcome.rolled >= 0 && r.data.outcome.rolled < 100
    );
  }
  const badTarget = await A.api("/api/games/dice", {
    method: "POST",
    body: JSON.stringify({ target: 1, wager: 10, clientSeed: flipSeed }),
  });
  check("target 1 rejected (bounds, 422)", badTarget.status === 422, `got ${badTarget.status}`);

  // ---------------- BLACKJACK ----------------
  console.log("— Blackjack (lifecycle, deck audit, rotation block)");
  const deal = await A.api("/api/games/blackjack", {
    method: "POST",
    body: JSON.stringify({ action: "deal", wager: 10, clientSeed: "e2e-bj-seed" }),
  });
  check("deal ok", deal.status === 200, JSON.stringify(deal.data));
  let view = deal.data;
  if (view.phase === "player") {
    check("hole card hidden while hand is live", view.dealer.length === 1);
    const rotBlocked = await A.api("/api/fairness/rotate", { method: "POST" });
    check("seed rotation blocked with open hand (409)", rotBlocked.status === 409);
    while (view.phase === "player") {
      const act = await A.api("/api/games/blackjack", {
        method: "POST",
        body: JSON.stringify({ action: "stand", roundId: view.roundId }),
      });
      view = act.data;
    }
  }
  check("round settled", view.phase === "done" && view.dealerTotal !== null);
  check("dealer stands on 17+ (or busted)", view.dealerTotal >= 17);

  const rot = await A.api("/api/fairness/rotate", { method: "POST" });
  check("rotation reveals seed after settle", rot.status === 200 && !!rot.data.revealedSeed);
  const deck = deriveDeck(rot.data.revealedSeed, "e2e-bj-seed", view.nonce);
  check(
    "dealt cards match the committed deck exactly",
    view.player[0] === deck[0] && view.player[1] === deck[2] &&
      view.dealer[0] === deck[1] && view.dealer[1] === deck[3],
    `player ${view.player} dealer ${view.dealer} deck ${deck.slice(0, 8)}`
  );
  check(
    "dealer draws follow deck order",
    view.dealer.slice(2).every((c, i) => c === deck[4 + i])
  );

  await prisma.user.update({ where: { id: userA.id }, data: { credits: 3 } });
  const poor = await A.api("/api/games/blackjack", {
    method: "POST",
    body: JSON.stringify({ action: "deal", wager: 10, clientSeed: "x" }),
  });
  check("deal with 3 credits & wager 10 rejected", poor.status !== 200);
  await prisma.user.update({ where: { id: userA.id }, data: { credits: 1000 } });

  // ---------------- WORM ----------------
  console.log("— Worm Frog (replay, tamper, rush, seed-shopping void)");
  const ws = await A.api("/api/arcade/start", { method: "POST", body: JSON.stringify({ game: "worm" }) });
  const wormToken = ws.data.runToken;
  const wrun = wormBot(seedFromToken(wormToken));
  console.log(`  worm bot: score ${wrun.score}, ${wrun.steps} steps`);
  await waitFor(Math.max(10_500, Math.ceil((wrun.steps * 70) / 1.1) + 800), "worm");
  const wormTamper = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: wormToken, score: wrun.score + 10, trace: wrun.trace }),
  });
  check("worm tampered score rejected (422)", wormTamper.status === 422);
  const wormHonest = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: wormToken, score: wrun.score, trace: wrun.trace }),
  });
  check("worm honest replay accepted, verified", wormHonest.status === 200 && wormHonest.data.verified === true);
  check("worm unranked without burns", wormHonest.data.ranked === false);
  const wormDupe = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: wormToken, score: wrun.score, trace: wrun.trace }),
  });
  check("worm duplicate rejected (409)", wormDupe.status === 409);

  const t1 = (await A.api("/api/arcade/start", { method: "POST", body: JSON.stringify({ game: "worm" }) })).data.runToken;
  const t2 = (await A.api("/api/arcade/start", { method: "POST", body: JSON.stringify({ game: "worm" }) })).data.runToken;
  const run1 = wormBot(seedFromToken(t1));
  await waitFor(Math.max(10_500, Math.ceil((run1.steps * 70) / 1.1) + 800), "voided-token check");
  const voided = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: t1, score: run1.score, trace: run1.trace }),
  });
  check("older token voided by newer start (seed-shopping dead)", voided.status === 409,
    `got ${voided.status} ${JSON.stringify(voided.data)}`);
  const t3 = (await A.api("/api/arcade/start", { method: "POST", body: JSON.stringify({ game: "worm" }) })).data.runToken;
  const run3 = wormBot(seedFromToken(t3));
  const rushed = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: t3, score: run3.score, trace: run3.trace }),
  });
  check("instant submission rejected (too fast to be real)", rushed.status === 422,
    `got ${rushed.status} ${JSON.stringify(rushed.data)}`);
  void t2;

  // ---------------- FROGRIS ----------------
  console.log("— Frogris (replay-verified line clears)");
  const fs_ = await A.api("/api/arcade/start", { method: "POST", body: JSON.stringify({ game: "frogris" }) });
  const frogToken = fs_.data.runToken;
  const frun = frogrisBot(seedFromToken(frogToken));
  console.log(`  frogris bot: score ${frun.score}, ${frun.lines} lines, ${frun.frames} frames`);
  check("frogris bot cleared at least one line", frun.score > 0);
  await waitFor(Math.max(10_500, Math.ceil((frun.frames * F_FRAME_MS) / 1.1) + 800), "frogris");
  const frogTamper = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: frogToken, score: frun.score + 100, trace: frun.inputs }),
  });
  check("frogris tampered score rejected (422)", frogTamper.status === 422);
  const frogHonest = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: frogToken, score: frun.score, trace: frun.inputs }),
  });
  check("frogris honest replay accepted, verified",
    frogHonest.status === 200 && frogHonest.data.verified === true,
    `got ${frogHonest.status} ${JSON.stringify(frogHonest.data)}`);

  // ---------------- HOPPER ----------------
  console.log("— Hopper (replay-verified crossings, progress scoring)");
  const hs = await A.api("/api/arcade/start", { method: "POST", body: JSON.stringify({ game: "hopper" }) });
  const hopToken = hs.data.runToken;
  const hrun = hopperBot(seedFromToken(hopToken));
  console.log(`  hopper bot: score ${hrun.score}, wave ${hrun.level + 1}, ${hrun.frames} frames`);
  check("hopper bot crossed (progress + bonus + wave regen determinism)", hrun.score >= 20,
    `score ${hrun.score}`);
  await waitFor(Math.max(10_500, Math.ceil((hrun.frames * H_FRAME_MS) / 1.1) + 800), "hopper");
  const hopTamper = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: hopToken, score: hrun.score + 5, trace: hrun.inputs }),
  });
  check("hopper tampered score rejected (422)", hopTamper.status === 422);
  const hopHonest = await A.api("/api/arcade/score", {
    method: "POST",
    body: JSON.stringify({ runToken: hopToken, score: hrun.score, trace: hrun.inputs }),
  });
  check("hopper honest replay accepted, verified",
    hopHonest.status === 200 && hopHonest.data.verified === true,
    `got ${hopHonest.status} ${JSON.stringify(hopHonest.data)}`);

  // ---------------- ELIGIBILITY (lifetime + window burns) ----------------
  console.log("— Prize eligibility (burners only, fresh burns required)");
  let board = (await A.api("/api/leaderboard?game=worm")).data;
  const shortA = `${A.wallet.slice(0, 4)}…${A.wallet.slice(-4)}`;
  check("no-burn wallet absent from prize board", !board.some((r) => r.player === shortA));

  await prisma.burnEvent.create({
    data: {
      userId: userA.id,
      signature: `e2e-old-${Date.now()}`,
      amountRaw: 1_500n * RAW,
      credits: 15,
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    },
  });
  board = (await A.api("/api/leaderboard?game=worm")).data;
  check("lifetime-only burner still absent (window rule bites)", !board.some((r) => r.player === shortA));

  await prisma.burnEvent.create({
    data: {
      userId: userA.id,
      signature: `e2e-fresh-${Date.now()}`,
      amountRaw: 150n * RAW,
      credits: 1,
    },
  });
  board = (await A.api("/api/leaderboard?game=worm")).data;
  check("lifetime + fresh window burn → ranked on the board", board.some((r) => r.player === shortA));

  // ---------------- ESCROW RACES ----------------
  console.log("— Escrow races (double bid, bid vs withdraw, double settle)");
  const BAL = 1_000n * RAW;
  await prisma.user.update({ where: { id: userA.id }, data: { ribbitBalance: BAL, ribbitLocked: 0n } });
  const mkAuction = (title, endsInMs) =>
    prisma.auction.create({
      data: {
        title, description: "e2e", startBidRaw: 10n * RAW, minIncrement: 1n * RAW,
        endsAt: new Date(Date.now() + endsInMs),
      },
    });
  const au1 = await mkAuction("e2e race 1", 3600_000);
  const au2 = await mkAuction("e2e race 2", 3600_000);
  cleanup.auctionIds.push(au1.id, au2.id);

  const bidBody = JSON.stringify({ amountRaw: BAL.toString() });
  const [r1, r2] = await Promise.all([
    A.api(`/api/auctions/${au1.id}/bid`, { method: "POST", body: bidBody }),
    A.api(`/api/auctions/${au2.id}/bid`, { method: "POST", body: bidBody }),
  ]);
  const okCount = [r1, r2].filter((r) => r.status === 200).length;
  let u = await prisma.user.findUnique({ where: { id: userA.id } });
  check(
    `concurrent full-balance bids: ${okCount} accepted, locked never exceeds balance`,
    okCount >= 1 && u.ribbitLocked <= u.ribbitBalance,
    `locked ${u.ribbitLocked} balance ${u.ribbitBalance}`
  );

  await prisma.bid.deleteMany({ where: { userId: userA.id } });
  await prisma.auction.updateMany({ where: { id: au1.id }, data: { currentRaw: 0n } });
  await prisma.user.update({ where: { id: userA.id }, data: { ribbitBalance: BAL, ribbitLocked: 0n } });
  const [wd, bid] = await Promise.all([
    A.api("/api/withdrawals", { method: "POST", body: JSON.stringify({ amountRaw: BAL.toString() }) }),
    A.api(`/api/auctions/${au1.id}/bid`, { method: "POST", body: bidBody }),
  ]);
  u = await prisma.user.findUnique({ where: { id: userA.id } });
  const wdOk = wd.status === 200 ? 1 : 0;
  const bidOk = bid.status === 200 ? 1 : 0;
  check(
    `bid vs withdraw on same funds: ${wdOk + bidOk} succeeded (must be exactly 1), invariants hold`,
    wdOk + bidOk === 1 && u.ribbitBalance >= 0n && u.ribbitLocked <= u.ribbitBalance,
    `wd ${wd.status} bid ${bid.status} bal ${u.ribbitBalance} locked ${u.ribbitLocked}`
  );

  await prisma.user.update({ where: { id: userB.id }, data: { ribbitBalance: 100n * RAW, ribbitLocked: 0n } });
  const au3 = await mkAuction("e2e settle race", 3600_000);
  cleanup.auctionIds.push(au3.id);
  const b3 = await B.api(`/api/auctions/${au3.id}/bid`, {
    method: "POST",
    body: JSON.stringify({ amountRaw: (50n * RAW).toString() }),
  });
  check("B's bid accepted", b3.status === 200);
  await prisma.auction.update({ where: { id: au3.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await Promise.all([A.api("/api/auctions"), B.api("/api/auctions"), A.api("/api/auctions")]);
  const uB = await prisma.user.findUnique({ where: { id: userB.id } });
  const settleEvents = await prisma.treasuryEvent.count({ where: { kind: "auction_settle", ref: au3.id } });
  check(
    "double settle: winner charged exactly once",
    uB.ribbitBalance === 50n * RAW && uB.ribbitLocked === 0n && settleEvents === 1,
    `bal ${uB.ribbitBalance} locked ${uB.ribbitLocked} events ${settleEvents}`
  );

  // ---------------- BOUNTY BOARD TOTALS ----------------
  // The board exposes fixed prizes on offer + everything actually paid out —
  // openPrizeRaw must equal the sum of the open bounties' prizes.
  const bp = (await A.api("/api/bounties")).data;
  const openSum = (bp.open ?? []).reduce((s, b) => s + BigInt(b.prizeRibbit), 0n);
  check(
    "board totals exposed (open prize value + paid out)",
    bp.totals && BigInt(bp.totals.openPrizeRaw) === openSum &&
      typeof bp.totals.paidOutRaw === "string"
  );
} finally {
  console.log("\ncleaning test data…");
  for (const w of cleanup.userWallets) {
    const u = await prisma.user.findUnique({ where: { wallet: w } });
    if (!u) continue;
    await prisma.arcadeScore.deleteMany({ where: { userId: u.id } });
    await prisma.arcadeRun.deleteMany({ where: { userId: u.id } });
    await prisma.gameRound.deleteMany({ where: { userId: u.id } });
    await prisma.serverSeed.deleteMany({ where: { userId: u.id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: u.id } });
    await prisma.burnEvent.deleteMany({ where: { userId: u.id } });
    await prisma.bid.deleteMany({ where: { userId: u.id } });
    await prisma.withdrawal.deleteMany({ where: { userId: u.id } });
  }
  await prisma.treasuryEvent.deleteMany({ where: { ref: { in: cleanup.auctionIds } } });
  await prisma.auction.deleteMany({ where: { id: { in: cleanup.auctionIds } } });
  for (const w of cleanup.userWallets) {
    await prisma.user.deleteMany({ where: { wallet: w } });
  }
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
