// Deterministic Hopper simulation — shared by the browser game and the
// server verifier. Fixed 60 Hz virtual clock: traffic is generated from a
// PRNG seeded by the run token and advances per frame (which also fixes the
// old bug where car speed depended on the player's monitor refresh rate),
// hops are recorded with their frame index, and the score is a pure function
// of (seed, hops).
//
// Scoring is progress-based: only reaching a NEW deepest row on the current
// crossing earns +1 — oscillating up and down on safe rows earns nothing.
import { mulberry32 } from "./worm-sim";

export const HCOLS = 9;
export const HROWS = 11;
export const HCELL = 44;
export const HW = HCOLS * HCELL;
export const HFRAME_MS = 1000 / 60;
export const H_MAX_FRAMES = 216_000; // 60 min at 60 fps

// 0 up, 1 down, 2 left, 3 right
export const H_DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

export type HInput = { f: number; d: number };

export type HCar = { x: number; lane: number; speed: number; len: number };

export type HopperState = {
  frog: { col: number; row: number };
  cars: HCar[];
  score: number;
  lives: number;
  level: number;
  progress: number; // deepest (lowest-index) row reached this crossing
  over: boolean;
  frame: number;
  rand: () => number;
  // render-only hints
  lastHopFrame: number;
  lastDeathFrame: number;
};

export function makeCars(rand: () => number, level: number): HCar[] {
  const cars: HCar[] = [];
  // Lanes 1..9 are roads (0 = goal, 10 = start), median is safe.
  for (let lane = 1; lane < HROWS - 1; lane++) {
    if (lane === Math.floor(HROWS / 2)) continue;
    const dir = lane % 2 === 0 ? 1 : -1;
    const speed = dir * (0.6 + rand() * 0.9 + level * 0.18);
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      cars.push({
        x: (HW / count) * i + rand() * 60,
        lane,
        speed,
        len: HCELL * (1.4 + rand()),
      });
    }
  }
  return cars;
}

export function createHopper(seed: number): HopperState {
  const rand = mulberry32(seed);
  return {
    frog: { col: 4, row: HROWS - 1 },
    cars: makeCars(rand, 0),
    score: 0,
    lives: 3,
    level: 0,
    progress: HROWS - 1,
    over: false,
    frame: 0,
    rand,
    lastHopFrame: -100,
    lastDeathFrame: -100,
  };
}

/** Apply one hop. Mirrored exactly between page and verifier. */
export function hopperHop(g: HopperState, d: number): void {
  if (g.over) return;
  const [dc, dr] = H_DIRS[d];
  const col = Math.min(HCOLS - 1, Math.max(0, g.frog.col + dc));
  const row = Math.min(HROWS - 1, Math.max(0, g.frog.row + dr));
  g.frog = { col, row };
  g.lastHopFrame = g.frame;
  // Progress-based scoring: +1 only for a new deepest row this crossing.
  if (row < g.progress) {
    g.score += g.progress - row;
    g.progress = row;
  }
  if (row === 0) {
    // Made it across — bonus, fresh (faster) traffic, back to the start.
    g.score += 10;
    g.level += 1;
    g.cars = makeCars(g.rand, g.level);
    g.frog = { col: 4, row: HROWS - 1 };
    g.progress = HROWS - 1;
  }
}

/** Advance one 60 Hz frame: move traffic, check collision. */
export function hopperFrame(g: HopperState): void {
  if (g.over) return;
  g.frame += 1;
  for (const car of g.cars) {
    car.x += car.speed;
    if (car.speed > 0 && car.x > HW + 20) car.x = -car.len - 20;
    if (car.speed < 0 && car.x < -car.len - 20) car.x = HW + 20;
  }
  const fx = g.frog.col * HCELL + HCELL / 2;
  for (const car of g.cars) {
    if (car.lane !== g.frog.row) continue;
    if (fx > car.x - 6 && fx < car.x + car.len + 6) {
      g.lives -= 1;
      g.lastDeathFrame = g.frame;
      g.frog = { col: 4, row: HROWS - 1 };
      g.progress = HROWS - 1;
      if (g.lives <= 0) g.over = true;
      break;
    }
  }
}

export type HopperReplay = {
  ok: boolean;
  score: number;
  level: number;
  frames: number;
  reason?: string;
};

/** Re-run a whole game from its hop trace. Pure and side-effect free. */
export function replayHopper(inputs: HInput[], seed: number): HopperReplay {
  for (let i = 0; i < inputs.length; i++) {
    const t = inputs[i];
    if (
      !t ||
      !Number.isInteger(t.f) ||
      t.f < 0 ||
      !Number.isInteger(t.d) ||
      t.d < 0 ||
      t.d >= H_DIRS.length ||
      // one hop per frame, strictly increasing — matches the page, which
      // drains at most one queued hop per frame
      (i > 0 && t.f <= inputs[i - 1].f)
    ) {
      return { ok: false, score: 0, level: 0, frames: 0, reason: "malformed trace" };
    }
  }

  const g = createHopper(seed);
  let ti = 0;
  for (let frame = 0; frame < H_MAX_FRAMES; frame++) {
    if (ti < inputs.length && inputs[ti].f === frame) {
      hopperHop(g, inputs[ti].d);
      ti++;
    }
    hopperFrame(g);
    if (g.over) return { ok: true, score: g.score, level: g.level, frames: frame };
  }
  return { ok: false, score: g.score, level: g.level, frames: H_MAX_FRAMES, reason: "run too long" };
}
