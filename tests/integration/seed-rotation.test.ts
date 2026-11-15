// Commit–reveal has one rule that money depends on: a server seed is never
// revealed while a round dealt from it is still open. A revealed seed gives
// away every card of a blackjack hand.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { act, deal, deriveDeck, handTotal } from "@/lib/blackjack";
import { getActiveSeed, rotateSeed, SeedInUseError, sha256Hex } from "@/lib/fairness";
import { playRound } from "@/lib/games";
import { cleanup, gate, HAS_DB, makeUser, sleep } from "./helpers";

/** Hands left open under a seed that has been revealed. Must always be 0. */
async function exposedHands(userId: string): Promise<number> {
  return prisma.gameRound.count({
    where: { userId, settled: false, seed: { active: false } },
  });
}

/** Deal until the hand stays open (a natural settles at once). */
async function dealOpenHand(userId: string) {
  for (let i = 0; i < 50; i++) {
    const view = await deal(userId, 10, `seed-${i}`);
    if (view.phase !== "done") return view;
  }
  throw new Error("could not deal an open hand");
}

describe.skipIf(!HAS_DB)("seed rotation", () => {
  afterAll(cleanup);

  it("reveals the old seed and commits to a new one", async () => {
    const user = await makeUser();
    const first = await getActiveSeed(user.id);
    const rotated = await rotateSeed(user.id);
    expect(rotated.revealedSeed).toBe(first.seed);
    expect(rotated.revealedHash).toBe(first.seedHash);
    expect(sha256Hex(rotated.revealedSeed!)).toBe(first.seedHash);
    const next = await getActiveSeed(user.id);
    expect(next.id).not.toBe(first.id);
    expect(next.seedHash).toBe(rotated.newHash);
    expect(next.nonce).toBe(0);
  });

  it("refuses to reveal a seed while a blackjack hand is open", async () => {
    const user = await makeUser();
    const hand = await dealOpenHand(user.id);
    const before = await getActiveSeed(user.id);
    await expect(rotateSeed(user.id)).rejects.toBeInstanceOf(SeedInUseError);
    const after = await getActiveSeed(user.id);
    expect(after.id).toBe(before.id);
    expect(after.revealedAt).toBeNull();
    expect(await exposedHands(user.id)).toBe(0);
    // Once the hand is finished the same seed can be revealed.
    let view = await act(user.id, hand.roundId, "stand");
    if (view.phase !== "done") view = await act(user.id, hand.roundId, "stand");
    expect(view.phase).toBe("done");
    expect((await rotateSeed(user.id)).revealedSeed).toBe(before.seed);
  });

  it("waits for a deal that has claimed its nonce but not committed", async () => {
    // The exact interleaving the old check-then-reveal code lost to: the hand
    // is not visible yet when rotation looks, and commits right after.
    const user = await makeUser();
    const seed = await getActiveSeed(user.id);
    const claimed = gate();
    const release = gate();
    const dealing = prisma.$transaction(async (tx) => {
      await tx.serverSeed.updateMany({
        where: { id: seed.id, nonce: seed.nonce, active: true },
        data: { nonce: { increment: 1 } },
      });
      claimed.open();
      await release.wait;
      await tx.gameRound.create({
        data: {
          userId: user.id,
          seedId: seed.id,
          game: "blackjack",
          nonce: seed.nonce,
          clientSeed: "held",
          params: JSON.stringify({ wager: 10 }),
          outcome: JSON.stringify({ deckPos: 4, player: [0, 1], dealer: [2, 3], phase: "player", doubled: false }),
          wager: 10,
          payout: 0,
          houseTake: 0,
          settled: false,
        },
      });
    });
    await claimed.wait;
    const rotating = rotateSeed(user.id).then(
      () => "rotated",
      (e) => (e instanceof SeedInUseError ? "refused" : `error: ${e}`)
    );
    // Rotation must still be waiting on the seed row, not finished.
    const early = await Promise.race([rotating, sleep(300).then(() => "waiting")]);
    expect(early).toBe("waiting");
    release.open();
    await dealing;
    expect(await rotating).toBe("refused");
    expect((await getActiveSeed(user.id)).id).toBe(seed.id);
    expect(await exposedHands(user.id)).toBe(0);
  });

  it("never leaves a hand open under a revealed seed when deal and rotate race", async () => {
    const outcomes = { dealt: 0, rotated: 0, exposed: 0 };
    for (let i = 0; i < 80; i++) {
      const user = await makeUser();
      await getActiveSeed(user.id);
      const [d, r] = await Promise.allSettled([deal(user.id, 10, "race"), rotateSeed(user.id)]);
      if (d.status === "fulfilled") outcomes.dealt++;
      if (r.status === "fulfilled") outcomes.rotated++;
      outcomes.exposed += await exposedHands(user.id);
      expect(await prisma.serverSeed.count({ where: { userId: user.id, active: true } })).toBe(1);
    }
    expect(outcomes.exposed).toBe(0);
    // Both sides must actually have run, or the loop proves nothing.
    expect(outcomes.dealt).toBeGreaterThan(0);
    expect(outcomes.rotated).toBeGreaterThan(0);
  });

  it("will not deal a new round from a revealed seed", async () => {
    const user = await makeUser();
    const stale = await getActiveSeed(user.id);
    await rotateSeed(user.id);
    // A request that read the seed before the rotation tries to claim it.
    const claim = await prisma.serverSeed.updateMany({
      where: { id: stale.id, nonce: stale.nonce, active: true },
      data: { nonce: { increment: 1 } },
    });
    expect(claim.count).toBe(0);
    // And the public path simply plays on the new seed.
    const round = await playRound(user.id, "flip", { wager: 10, clientSeed: "x", side: "frog" });
    expect(round.seedHash).not.toBe(stale.seedHash);
  });

  it("creates exactly one seed when a new wallet's first requests arrive together", async () => {
    const user = await makeUser();
    const seeds = await Promise.all(Array.from({ length: 12 }, () => getActiveSeed(user.id)));
    expect(new Set(seeds.map((s) => s.id)).size).toBe(1);
    expect(await prisma.serverSeed.count({ where: { userId: user.id } })).toBe(1);
  });

  it("leaves exactly one active seed after concurrent rotations", async () => {
    const user = await makeUser();
    await getActiveSeed(user.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => rotateSeed(user.id)));
    expect(await prisma.serverSeed.count({ where: { userId: user.id, active: true } })).toBe(1);
    // Each rotation revealed a different seed: nothing was revealed twice.
    expect(new Set(results.map((r) => r.revealedHash)).size).toBe(8);
  });

  it("retires every active seed if a wallet somehow holds two", async () => {
    const user = await makeUser();
    await getActiveSeed(user.id);
    await prisma.serverSeed.create({
      data: { userId: user.id, seed: "b".repeat(64), seedHash: sha256Hex("b".repeat(64)) },
    });
    await rotateSeed(user.id);
    expect(await prisma.serverSeed.count({ where: { userId: user.id, active: true } })).toBe(1);
  });

  it("gives the player no decision on a hand whose seed was revealed", async () => {
    // Should be unreachable. If it happens anyway, knowing the deck must not help.
    const user = await makeUser();
    const hand = await dealOpenHand(user.id);
    const row = await prisma.gameRound.findUniqueOrThrow({
      where: { id: hand.roundId },
      include: { seed: true },
    });
    await prisma.serverSeed.update({ where: { id: row.seedId }, data: { active: false } });
    const deck = deriveDeck(row.seed.seed, row.clientSeed, row.nonce);
    const view = await act(user.id, hand.roundId, "hit");
    // "hit" was treated as "stand": the player still holds the two dealt cards.
    expect(view.player).toEqual([deck[0], deck[2]]);
    expect(view.phase).toBe("done");
    expect(view.doubled).toBe(false);
    expect(handTotal(view.dealer).total).toBeGreaterThanOrEqual(17);
  });
});
