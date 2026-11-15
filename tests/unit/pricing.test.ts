import { describe, expect, it } from "vitest";
import { owpRawForQuote } from "@/lib/owp-quote";
import { belowFloor } from "@/lib/owp-price";
import { proRataShares, splitPrize } from "@/lib/bounty";

const SOL = 1_000_000_000n;

describe("house sale sizing", () => {
  // A launch curve early in its life: 30 SOL against 1.073B tokens (6 decimals).
  const curve = {
    decimals: 6,
    lamportsPerWhole: "28",
    virtualSol: (30n * SOL).toString(),
    virtualToken: (1_073_000_000n * 1_000_000n).toString(),
  };

  it("pays lamports × tokens on the curve ÷ SOL on the curve", () => {
    expect(owpRawForQuote(SOL, curve)).toBe((SOL * 1_073_000_000n * 1_000_000n) / (30n * SOL));
  });

  it("rounds down, in the house's favor", () => {
    const quote = { decimals: 6, lamportsPerWhole: "0", virtualSol: "7", virtualToken: "10" };
    expect(owpRawForQuote(5n, quote)).toBe(7n); // 50 ÷ 7 = 7.14…
  });

  it("uses the ceiled per-token price once the curve has migrated", () => {
    const market = { decimals: 6, lamportsPerWhole: "150", virtualSol: null, virtualToken: null };
    expect(owpRawForQuote(SOL, market)).toBe((SOL * 1_000_000n) / 150n);
  });

  it("pays nothing for nothing, and nothing on a broken quote", () => {
    expect(owpRawForQuote(0n, curve)).toBe(0n);
    expect(owpRawForQuote(-5n, curve)).toBe(0n);
    expect(owpRawForQuote(SOL, { ...curve, virtualSol: "0" })).toBe(0n);
    expect(owpRawForQuote(SOL, { decimals: 6, lamportsPerWhole: "0", virtualSol: null, virtualToken: null })).toBe(0n);
  });
});

describe("sell floor", () => {
  // Spot here is 30 SOL ÷ 1,073M tokens = 0.02796 SOL per million.
  const curve = { virtualSol: 30n * SOL, virtualToken: 1_073_000_000n * 1_000_000n };

  it("is off at zero", () => {
    expect(belowFloor(0, 6, curve, 28n)).toBe(false);
  });

  it("refuses when the curve spot is under the floor, and only then", () => {
    expect(belowFloor(0.0279, 6, curve, 28n)).toBe(false);
    expect(belowFloor(0.028, 6, curve, 28n)).toBe(true);
    expect(belowFloor(1, 6, curve, 28n)).toBe(true);
  });

  it("sees a pool that has been sold down", () => {
    // Someone dumps into the pool: more tokens, less SOL, lower spot.
    const pushed = { virtualSol: 24n * SOL, virtualToken: 1_341_250_000n * 1_000_000n };
    expect(belowFloor(0.025, 6, curve, 28n)).toBe(false);
    expect(belowFloor(0.025, 6, pushed, 18n)).toBe(true);
  });

  it("compares the market price after migration", () => {
    expect(belowFloor(0.1, 6, null, 100n)).toBe(false); // 100 lamports/token = 0.1 SOL per million
    expect(belowFloor(0.1, 6, null, 99n)).toBe(true);
  });
});

describe("prize splits", () => {
  it("pays pro-rata shares that add up to exactly the prize", () => {
    const prize = 1_000_000_007n;
    const shares = proRataShares(prize, [5, 3, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(prize);
    expect(shares[0]).toBeGreaterThan(shares[1]);
    expect(shares[2]).toBe(shares[3]);
  });

  it("gives non-positive results nothing", () => {
    const shares = proRataShares(900n, [2, 0, -4, 1]);
    expect(shares).toEqual([600n, 0n, 0n, 300n]);
  });

  it("pays nobody when nobody is ahead", () => {
    expect(proRataShares(900n, [0, -1])).toEqual([0n, 0n]);
    expect(proRataShares(900n, [])).toEqual([]);
  });

  it("splits by percentage, with the rounding dust to first place", () => {
    const shares = splitPrize(1_000n, [50, 30, 20]);
    expect(shares).toEqual([500n, 300n, 200n]);
    const odd = splitPrize(1_001n, [34, 33, 33]);
    expect(odd.reduce((a, b) => a + b, 0n)).toBe(1_001n);
    expect(odd[0]).toBeGreaterThanOrEqual(odd[1]);
  });
});
