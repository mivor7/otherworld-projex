// Table rounds against a real database: what a wager does to a balance, and
// what the books say afterwards.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";
import { adjustOwp, InsufficientCredits, playableWhole } from "@/lib/credits";
import { roll } from "@/lib/fairness";
import { playRound } from "@/lib/games";
import { act, deal } from "@/lib/blackjack";
import { maxDiceTarget } from "@/lib/dice";
import { cleanup, HAS_DB, makeUser } from "./helpers";

async function playable(userId: string): Promise<number> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return playableWhole(u.ribbitBalance, u.ribbitLocked);
}

describe.skipIf(!HAS_DB)("table rounds", () => {
  afterAll(cleanup);

  it("pays a flip 1.92× on a win and nothing on a loss, from the committed seed", async () => {
    const user = await makeUser(10_000);
    let balance = 10_000;
    for (let i = 0; i < 30; i++) {
      const r = await playRound(user.id, "flip", { wager: 100, clientSeed: "t", side: "frog" });
      const seed = await prisma.serverSeed.findFirstOrThrow({ where: { userId: user.id } });
      // The outcome is exactly what the seed says it is.
      const expected = roll(seed.seed, "t", r.nonce) < 0.5 ? "frog" : "fly";
      expect(r.outcome.landed).toBe(expected);
      expect(r.win).toBe(expected === "frog");
      expect(r.payout).toBe(r.win ? 192 : 0);
      balance += r.payout - 100;
      expect(r.credits).toBe(balance);
      expect(r.nonce).toBe(i);
    }
    expect(await playable(user.id)).toBe(balance);
  });

  it("keeps balance, ledger and round history in agreement", async () => {
    const user = await makeUser(5_000);
    for (let i = 0; i < 25; i++) {
      await playRound(user.id, i % 2 ? "flip" : "dice", {
        wager: 37,
        clientSeed: `c${i}`,
        side: "fly",
        target: 40,
      });
    }
    const rounds = await prisma.gameRound.aggregate({
      where: { userId: user.id },
      _sum: { wager: true, payout: true, houseTake: true },
    });
    const ledger = await prisma.ledgerEntry.aggregate({ where: { userId: user.id }, _sum: { delta: true } });
    const net = (rounds._sum.payout ?? 0) - (rounds._sum.wager ?? 0);
    expect(await playable(user.id)).toBe(5_000 + net);
    expect(ledger._sum.delta).toBe(net);
    expect(rounds._sum.houseTake).toBe(-net);
  });

  it("refuses a wager the balance cannot cover and takes nothing", async () => {
    const user = await makeUser(50);
    await expect(
      playRound(user.id, "flip", { wager: 51, clientSeed: "x", side: "frog" })
    ).rejects.toBeInstanceOf(InsufficientCredits);
    expect(await playable(user.id)).toBe(50);
    expect(await prisma.gameRound.count({ where: { userId: user.id } })).toBe(0);
    // The failed round did not burn a nonce either.
    const seed = await prisma.serverSeed.findFirstOrThrow({ where: { userId: user.id } });
    expect(seed.nonce).toBe(0);
  });

  it("cannot be raced into spending the same balance twice", async () => {
    const user = await makeUser(100);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        playRound(user.id, "flip", { wager: 100, clientSeed: `r${i}`, side: "frog" })
      )
    );
    const played = results.filter((r) => r.status === "fulfilled").length;
    const rounds = await prisma.gameRound.findMany({ where: { userId: user.id } });
    expect(rounds).toHaveLength(played);
    // Every round that happened was funded: the balance never went below zero.
    const net = rounds.reduce((s, r) => s + r.payout - r.wager, 0);
    expect(await playable(user.id)).toBe(100 + net);
    expect(await playable(user.id)).toBeGreaterThanOrEqual(0);
    // No two rounds share a nonce.
    expect(new Set(rounds.map((r) => r.nonce)).size).toBe(rounds.length);
  });

  it("enforces the live wager limits", async () => {
    const user = await makeUser(10_000_000);
    await expect(
      playRound(user.id, "flip", { wager: 1_000_001, clientSeed: "x", side: "frog" })
    ).rejects.toThrow(/Wager must be between/);
  });

  it("will not take a dice bet whose win would not beat the stake", async () => {
    const user = await makeUser(1_000);
    const top = maxDiceTarget(0.04);
    await expect(
      playRound(user.id, "dice", { wager: 100, clientSeed: "x", target: top + 1 })
    ).rejects.toThrow(/Target must be 95 or lower/);
    expect(await playable(user.id)).toBe(1_000);
    const ok = await playRound(user.id, "dice", { wager: 100, clientSeed: "x", target: top });
    if (ok.win) expect(ok.payout).toBeGreaterThan(100);
  });

  it("will not let a wager spend tokens locked in a bid", async () => {
    const user = await makeUser(500);
    await prisma.user.update({ where: { id: user.id }, data: { ribbitLocked: toRaw(450) } });
    await expect(
      playRound(user.id, "flip", { wager: 51, clientSeed: "x", side: "frog" })
    ).rejects.toBeInstanceOf(InsufficientCredits);
    await playRound(user.id, "flip", { wager: 50, clientSeed: "x", side: "frog" });
  });

  it("books a blackjack hand's full stake and settles it once", async () => {
    const user = await makeUser(100_000);
    let balance = 100_000;
    for (let i = 0; i < 25; i++) {
      let view = await deal(user.id, 100, `bj${i}`);
      // Double when allowed, otherwise stand: exercises the extra-stake path.
      while (view.phase !== "done") {
        view = await act(user.id, view.roundId, view.canDouble && i % 3 === 0 ? "double" : "stand");
      }
      const row = await prisma.gameRound.findUniqueOrThrow({ where: { id: view.roundId } });
      expect(row.settled).toBe(true);
      expect(row.wager === 100 || row.wager === 200).toBe(true);
      expect(row.houseTake).toBe(row.wager - row.payout);
      balance += row.payout - row.wager;
      expect(await playable(user.id)).toBe(balance);
      await expect(act(user.id, view.roundId, "stand")).rejects.toThrow(/already settled/);
    }
  });

  it("allows one open blackjack hand per player", async () => {
    const user = await makeUser(10_000);
    let open = await deal(user.id, 10, "a");
    for (let i = 0; open.phase === "done" && i < 50; i++) open = await deal(user.id, 10, `a${i}`);
    await expect(deal(user.id, 10, "b")).rejects.toThrow(/Finish your current hand/);
  });
});

describe.skipIf(!HAS_DB)("balance adjustments", () => {
  afterAll(cleanup);

  it("moves whole $OWP and writes the ledger", async () => {
    const user = await makeUser(100);
    const after = await prisma.$transaction((tx) => adjustOwp(tx, user.id, 250, "admin", "comp"));
    expect(after).toBe(350);
    expect(await playable(user.id)).toBe(350);
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: user.id } });
    expect(entry).toMatchObject({ delta: 250, kind: "admin", ref: "comp" });
  });

  it("cannot remove more than the unlocked balance", async () => {
    const user = await makeUser(100);
    await prisma.user.update({ where: { id: user.id }, data: { ribbitLocked: toRaw(60) } });
    await expect(
      prisma.$transaction((tx) => adjustOwp(tx, user.id, -41, "admin"))
    ).rejects.toBeInstanceOf(InsufficientCredits);
    expect(await prisma.$transaction((tx) => adjustOwp(tx, user.id, -40, "admin"))).toBe(0);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.ribbitBalance).toBe(toRaw(60));
  });

  it("rejects fractional amounts", async () => {
    const user = await makeUser(100);
    await expect(prisma.$transaction((tx) => adjustOwp(tx, user.id, 1.5, "admin"))).rejects.toThrow(/integer/);
  });
});
