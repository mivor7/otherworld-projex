// The verifier on /fairness recomputes these in the browser. If either
// function changes its output, every past round stops verifying.
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { roll, sha256Hex } from "@/lib/fairness";
import { cardRank, cardSuit, deriveDeck, handTotal } from "@/lib/blackjack";

const SEED = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

describe("commit–reveal", () => {
  it("commits with plain SHA-256 of the seed", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(SEED)).toBe(createHash("sha256").update(SEED).digest("hex"));
  });

  it("rolls HMAC-SHA256(serverSeed, clientSeed:nonce), first 32 bits ÷ 2³²", () => {
    const digest = createHmac("sha256", SEED).update("lucky:7").digest("hex");
    expect(roll(SEED, "lucky", 7)).toBe(parseInt(digest.slice(0, 8), 16) / 0x100000000);
  });

  it("is deterministic, and changes with every input", () => {
    const base = roll(SEED, "lucky", 7);
    expect(roll(SEED, "lucky", 7)).toBe(base);
    expect(roll(SEED, "lucky", 8)).not.toBe(base);
    expect(roll(SEED, "luckz", 7)).not.toBe(base);
    expect(roll(SEED.replace("9", "8"), "lucky", 7)).not.toBe(base);
  });

  it("stays in [0, 1) and is not visibly biased", () => {
    let sum = 0;
    let frog = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const r = roll(SEED, "bias-check", i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      sum += r;
      if (r < 0.5) frog++;
    }
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.51);
    expect(frog / n).toBeGreaterThan(0.485);
    expect(frog / n).toBeLessThan(0.515);
  });
});

describe("blackjack deck", () => {
  it("is a full 52-card deck, fixed by seed, client seed and nonce", () => {
    const deck = deriveDeck(SEED, "table", 3);
    expect(deck).toHaveLength(52);
    expect([...deck].sort((a, b) => a - b)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect(deriveDeck(SEED, "table", 3)).toEqual(deck);
    expect(deriveDeck(SEED, "table", 4)).not.toEqual(deck);
    expect(deriveDeck(SEED, "tablf", 3)).not.toEqual(deck);
  });

  it("draws each shuffle step from HMAC-SHA256(serverSeed, clientSeed:nonce:step)", () => {
    // Recompute the Fisher–Yates independently, the way a player would.
    const expected = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 51; i > 0; i--) {
      const digest = createHmac("sha256", SEED).update(`table:3:${51 - i}`).digest("hex");
      const j = Math.floor((parseInt(digest.slice(0, 8), 16) / 0x100000000) * (i + 1));
      [expected[i], expected[j]] = [expected[j], expected[i]];
    }
    expect(deriveDeck(SEED, "table", 3)).toEqual(expected);
  });

  it("maps a card index to rank and suit", () => {
    expect(cardRank(0)).toBe(0); // a two
    expect(cardRank(12)).toBe(12); // an ace
    expect(cardRank(13)).toBe(0);
    expect(cardSuit(12)).toBe(0);
    expect(cardSuit(13)).toBe(1);
    expect(cardSuit(51)).toBe(3);
  });

  it("totals hands, counting aces as 11 until that would bust", () => {
    const ACE = 12, KING = 11, NINE = 7, FIVE = 3, TWO = 0;
    expect(handTotal([ACE, KING])).toEqual({ total: 21, soft: true });
    expect(handTotal([ACE, NINE])).toEqual({ total: 20, soft: true });
    expect(handTotal([ACE, NINE, FIVE])).toEqual({ total: 15, soft: false });
    expect(handTotal([ACE, ACE + 13])).toEqual({ total: 12, soft: true });
    expect(handTotal([KING, NINE, FIVE])).toEqual({ total: 24, soft: false });
    expect(handTotal([TWO, FIVE])).toEqual({ total: 7, soft: false });
  });
});
