// Minimal in-process sliding-window rate limiter. Per-instance only (each
// serverless instance keeps its own counters), so this is abuse *mitigation*
// for expensive endpoints (on-chain RPC lookups, replay verification), not a
// hard global quota — the correctness guards stay in the routes themselves.
import { ApiError } from "./api";

const windows = new Map<string, number[]>();
let lastSweep = 0;

/**
 * Throw 429 when `key` exceeds `max` calls in the trailing `windowMs`.
 * Call it BEFORE doing the expensive work.
 */
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  // Opportunistic sweep so the map can't grow unboundedly across keys.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, hits] of windows) {
      if (hits.length === 0 || hits[hits.length - 1] < now - windowMs) windows.delete(k);
    }
  }
  const hits = (windows.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= max) {
    throw new ApiError("Too many attempts — give it a moment and retry", 429);
  }
  hits.push(now);
  windows.set(key, hits);
}
