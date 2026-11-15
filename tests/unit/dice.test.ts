import { describe, expect, it } from "vitest";
import { DICE_MAX_TARGET, DICE_MIN_TARGET, diceMultiplier, maxDiceTarget } from "@/lib/dice";

describe("dice limits", () => {
  it("pays (100 ÷ target) × (1 − edge)", () => {
    expect(diceMultiplier(50, 0.04)).toBeCloseTo(1.92, 10);
    expect(diceMultiplier(2, 0.04)).toBeCloseTo(48, 10);
  });

  it("stops at 95 on the default 4% edge", () => {
    // 96 pays exactly 1.00×, 97 and 98 pay less than the stake.
    expect(maxDiceTarget(0.04)).toBe(95);
    expect(diceMultiplier(96, 0.04)).toBeLessThanOrEqual(1.0000001);
    expect(diceMultiplier(98, 0.04)).toBeLessThan(1);
  });

  it("never offers a target whose win does not beat the stake, at any allowed edge", () => {
    // The admin panel allows 0.5% – 15%.
    for (let bps = 50; bps <= 1500; bps += 5) {
      const edge = bps / 10_000;
      const top = maxDiceTarget(edge);
      expect(top).toBeGreaterThanOrEqual(DICE_MIN_TARGET);
      expect(top).toBeLessThanOrEqual(DICE_MAX_TARGET);
      expect(diceMultiplier(top, edge)).toBeGreaterThanOrEqual(1.01);
      if (top < DICE_MAX_TARGET) expect(diceMultiplier(top + 1, edge)).toBeLessThan(1.01);
    }
  });

  it("keeps the full range when the edge is small", () => {
    expect(maxDiceTarget(0.005)).toBe(98);
    expect(maxDiceTarget(0.01)).toBe(98);
  });
});
