// Deterministic Worm Frog simulation — shared by the browser game and the
// server verifier. The run token seeds the PRNG, the player's inputs are the
// trace, and score is a pure function of (seed, trace). The server replays
// every submitted run and computes the score itself, so a fabricated score
// can't rank: cheating would require producing a real input trace that plays
// that well, which is just… playing well.
//
// Determinism contract (mirrored exactly in src/app/games/worm/page.tsx):
// - grid GRID×GRID; snake starts length 3, centered, moving right
// - one PRNG draw pair per fly-spawn attempt, retrying while on the snake
// - a step: apply queued turns (reverse moves rejected against the current
//   direction), advance head, die on wall/self, +10 and grow on fly
// - turns carry the index of the step they precede; several turns in one
//   interval resolve left to right (last accepted wins)

export const GRID = 21;

export const DIRS = [
  { x: 1, y: 0 }, // 0 right
  { x: -1, y: 0 }, // 1 left
  { x: 0, y: -1 }, // 2 up
  { x: 0, y: 1 }, // 3 down
] as const;

export type Turn = { s: number; d: number };
export type Point = { x: number; y: number };

/** Small fast deterministic PRNG (Mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit over the run token → PRNG seed both sides can derive. */
export function seedFromToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function initialSnake(): Point[] {
  const mid = Math.floor(GRID / 2);
  return [
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
    { x: mid - 3, y: mid },
  ];
}

export function spawnFly(rand: () => number, snake: Point[]): Point {
  for (;;) {
    const p = { x: Math.floor(rand() * GRID), y: Math.floor(rand() * GRID) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

export type ReplayResult = {
  ok: boolean;
  score: number;
  steps: number;
  reason?: string;
};

/** Re-run a whole game from its trace. Pure and side-effect free. */
export function replay(
  turns: Turn[],
  seed: number,
  maxSteps = 200_000
): ReplayResult {
  // Trace sanity: step indices non-negative and non-decreasing.
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (
      !t ||
      !Number.isInteger(t.s) ||
      t.s < 0 ||
      !Number.isInteger(t.d) ||
      t.d < 0 ||
      t.d >= DIRS.length ||
      (i > 0 && t.s < turns[i - 1].s)
    ) {
      return { ok: false, score: 0, steps: 0, reason: "malformed trace" };
    }
  }

  const rand = mulberry32(seed);
  const snake = initialSnake();
  // `cur` is the direction of the last executed step (what the player sees
  // the worm doing); `pending` is the live game's nextDir. Acceptance is
  // checked against `cur` — exactly like turn() in the browser game, where
  // g.dir only changes when a step executes.
  let cur: (typeof DIRS)[number] = DIRS[0];
  let pending: (typeof DIRS)[number] = DIRS[0];
  let fly = spawnFly(rand, snake);
  let score = 0;
  let ti = 0;

  for (let step = 0; step < maxSteps; step++) {
    while (ti < turns.length && turns[ti].s === step) {
      const nd = DIRS[turns[ti].d];
      if (!(nd.x === -cur.x && nd.y === -cur.y)) pending = nd;
      ti++;
    }
    cur = pending;

    const head = { x: snake[0].x + cur.x, y: snake[0].y + cur.y };
    if (
      head.x < 0 ||
      head.x >= GRID ||
      head.y < 0 ||
      head.y >= GRID ||
      snake.some((s) => s.x === head.x && s.y === head.y)
    ) {
      return { ok: true, score, steps: step };
    }
    snake.unshift(head);
    if (head.x === fly.x && head.y === fly.y) {
      score += 10;
      fly = spawnFly(rand, snake);
    } else {
      snake.pop();
    }
  }
  return { ok: false, score, steps: maxSteps, reason: "run too long" };
}
