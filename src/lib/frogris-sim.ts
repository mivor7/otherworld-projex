// Deterministic Frogris simulation — shared by the browser game and the
// server verifier, exactly like worm-sim. The game runs on a fixed 60 Hz
// virtual clock: inputs are recorded with the frame index they were applied
// on, the piece bag is drawn from a PRNG seeded by the run token, and the
// score is a pure function of (seed, inputs). The server replays every
// submitted run, so a fabricated score can't rank.
//
// Determinism contract (the browser page drives these same functions):
// - inputs are queued by the page and applied at frame boundaries, in order,
//   at most MAX_INPUTS_PER_FRAME per frame
// - gravity: a per-frame accumulator adds FRAME_MS and drops the piece each
//   time it crosses the current drop interval
// - board cells store the piece index (0-6); rendering maps them to colors
import { mulberry32 } from "./worm-sim";

export const FCOLS = 10;
export const FROWS = 20;
export const FRAME_MS = 1000 / 60;
export const MAX_INPUTS_PER_FRAME = 4;
export const MAX_FRAMES = 216_000; // 60 min at 60 fps

// [rotation][block] = [x, y] offsets from the piece origin. I O T S Z J L.
export const F_PIECES: number[][][][] = [
  [ [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]] ],
  [ [[1,0],[2,0],[1,1],[2,1]] ],
  [ [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]] ],
  [ [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]] ],
  [ [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]] ],
  [ [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]] ],
  [ [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]] ],
];

export const LINE_SCORES = [0, 100, 300, 500, 800];

// Actions: 0 left, 1 right, 2 rotate cw, 3 rotate ccw, 4 soft drop, 5 hard drop
export type FAction = 0 | 1 | 2 | 3 | 4 | 5;
export type FInput = { f: number; a: number };

export type FrogrisState = {
  board: (number | null)[][]; // [row][col] = piece index
  bag: number[];
  piece: number;
  rot: number;
  x: number;
  y: number;
  next: number;
  score: number;
  lines: number;
  over: boolean;
  acc: number; // virtual ms toward the next gravity drop
  frame: number;
  rand: () => number;
  // render-only hints, harmless to determinism
  lastClear: { rows: number[]; frame: number } | null;
};

export function dropMsFor(lines: number): number {
  return Math.max(110, 760 - Math.floor(lines / 10) * 60);
}

export function cellsOf(piece: number, rot: number): number[][] {
  const states = F_PIECES[piece];
  return states[rot % states.length];
}

export function collides(
  board: (number | null)[][],
  piece: number,
  rot: number,
  x: number,
  y: number
): boolean {
  for (const [cx, cy] of cellsOf(piece, rot)) {
    const bx = x + cx;
    const by = y + cy;
    if (bx < 0 || bx >= FCOLS || by >= FROWS) return true;
    if (by >= 0 && board[by][bx] !== null) return true;
  }
  return false;
}

function refillBag(rand: () => number): number[] {
  const bag = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function spawn(g: FrogrisState): void {
  g.piece = g.next;
  if (g.bag.length === 0) g.bag = refillBag(g.rand);
  g.next = g.bag.pop()!;
  g.rot = 0;
  g.x = 3;
  g.y = -1;
  if (collides(g.board, g.piece, g.rot, g.x, g.y + 1)) g.over = true;
}

export function createFrogris(seed: number): FrogrisState {
  const rand = mulberry32(seed);
  const bag = refillBag(rand);
  const g: FrogrisState = {
    board: Array.from({ length: FROWS }, () => Array(FCOLS).fill(null)),
    bag,
    piece: 0,
    rot: 0,
    x: 3,
    y: -1,
    next: bag.pop()!,
    score: 0,
    lines: 0,
    over: false,
    acc: 0,
    frame: 0,
    rand,
    lastClear: null,
  };
  spawn(g);
  return g;
}

function lock(g: FrogrisState): void {
  for (const [cx, cy] of cellsOf(g.piece, g.rot)) {
    const by = g.y + cy;
    if (by >= 0) g.board[by][g.x + cx] = g.piece;
  }
  let cleared = 0;
  const rows: number[] = [];
  for (let r = FROWS - 1; r >= 0; r--) {
    if (g.board[r].every((c) => c !== null)) {
      rows.push(r + cleared); // original position, for the render flash
      g.board.splice(r, 1);
      g.board.unshift(Array(FCOLS).fill(null));
      cleared++;
      r++;
    }
  }
  if (cleared > 0) {
    const level = Math.floor(g.lines / 10);
    g.score += LINE_SCORES[cleared] * (level + 1);
    g.lines += cleared;
    g.lastClear = { rows, frame: g.frame };
  }
  spawn(g);
}

function gravity(g: FrogrisState): void {
  if (!collides(g.board, g.piece, g.rot, g.x, g.y + 1)) g.y += 1;
  else lock(g);
}

/** Apply one player action. Mirrored exactly between page and verifier. */
export function applyInput(g: FrogrisState, a: number): void {
  if (g.over) return;
  if (a === 0 || a === 1) {
    const dx = a === 0 ? -1 : 1;
    if (!collides(g.board, g.piece, g.rot, g.x + dx, g.y)) g.x += dx;
  } else if (a === 2 || a === 3) {
    const states = F_PIECES[g.piece].length;
    const rot = (g.rot + (a === 2 ? 1 : -1) + states) % states;
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(g.board, g.piece, rot, g.x + kick, g.y)) {
        g.rot = rot;
        g.x += kick;
        return;
      }
    }
  } else if (a === 4) {
    gravity(g);
  } else if (a === 5) {
    while (!collides(g.board, g.piece, g.rot, g.x, g.y + 1)) g.y += 1;
    lock(g);
  }
}

/** Advance one 60 Hz frame of gravity time. */
export function frameTick(g: FrogrisState): void {
  if (g.over) return;
  g.frame += 1;
  g.acc += FRAME_MS;
  while (g.acc >= dropMsFor(g.lines)) {
    g.acc -= dropMsFor(g.lines);
    gravity(g);
    if (g.over) return;
  }
}

export type FrogrisReplay = {
  ok: boolean;
  score: number;
  lines: number;
  frames: number;
  reason?: string;
};

/** Re-run a whole game from its input trace. Pure and side-effect free. */
export function replayFrogris(inputs: FInput[], seed: number): FrogrisReplay {
  let perFrame = 0;
  for (let i = 0; i < inputs.length; i++) {
    const t = inputs[i];
    if (
      !t ||
      !Number.isInteger(t.f) ||
      t.f < 0 ||
      !Number.isInteger(t.a) ||
      t.a < 0 ||
      t.a > 5 ||
      (i > 0 && t.f < inputs[i - 1].f)
    ) {
      return { ok: false, score: 0, lines: 0, frames: 0, reason: "malformed trace" };
    }
    perFrame = i > 0 && t.f === inputs[i - 1].f ? perFrame + 1 : 1;
    if (perFrame > MAX_INPUTS_PER_FRAME) {
      return { ok: false, score: 0, lines: 0, frames: 0, reason: "input rate impossible" };
    }
  }

  const g = createFrogris(seed);
  let ti = 0;
  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    while (ti < inputs.length && inputs[ti].f === frame) {
      applyInput(g, inputs[ti].a as FAction);
      ti++;
      if (g.over) return { ok: true, score: g.score, lines: g.lines, frames: frame };
    }
    frameTick(g);
    if (g.over) return { ok: true, score: g.score, lines: g.lines, frames: frame };
  }
  return { ok: false, score: g.score, lines: g.lines, frames: MAX_FRAMES, reason: "run too long" };
}
