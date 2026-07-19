// A player's LIVE positions across every open bounty they've played — their
// current net/score, whether they're in the running, the $RIBBIT they'd earn
// if it settled right now, and how full each pool is. This lets a player who
// has stopped playing still watch their waiting share move as others fill the
// pool, from their account page — not only on the game screen. The projection
// is an estimate; it shifts as people play and locks when the bounty triggers.
import { handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fromRaw, toRaw } from "@/lib/config";
import {
  ARCADE_GAMES,
  autoSettleBounties,
  bountyProgress,
  bountyStandings,
} from "@/lib/bounty";
import { burnTotals } from "@/lib/ranked";
import { houseConfig } from "@/lib/settings";

// Live data — never cache; the projection is the whole point.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  // Fire any due triggers first so a bounty that just settled drops out of the
  // live list (it moves to the winnings ledger instead).
  await autoSettleBounties();

  const open = await prisma.bounty.findMany({
    where: { status: "open", game: { not: null } },
    orderBy: { prizeRibbit: "desc" },
    take: 50,
  });
  if (open.length === 0) return ok([]);

  const cfg = await houseConfig();
  const uid = session.userId;
  // Lifetime spend is window-independent — compute it once, not per bounty.
  const lifetimeSpent = (await burnTotals([uid])).get(uid) ?? 0n;
  const lifetimeEligible =
    cfg.rankedMinBurnedRibbit <= 0 || lifetimeSpent >= toRaw(cfg.rankedMinBurnedRibbit);

  const positions = [];
  for (const b of open) {
    const game = b.game!;
    const arcade = ARCADE_GAMES.has(game);

    // The player's value + whether they've actually played this window.
    let value = 0;
    let played = false;
    if (arcade) {
      const s = await prisma.arcadeScore.aggregate({
        where: { userId: uid, game, createdAt: { gte: b.startsAt } },
        _max: { score: true },
        _count: true,
      });
      value = s._max.score ?? 0;
      played = s._count > 0;
    } else {
      const r = await prisma.gameRound.aggregate({
        where: { userId: uid, game, settled: true, createdAt: { gte: b.startsAt } },
        _sum: { wager: true, payout: true },
        _count: true,
      });
      value = (r._sum.payout ?? 0) - (r._sum.wager ?? 0);
      played = r._count > 0;
    }
    if (!played) continue; // only show bounties the player is actually in

    const standings = await bountyStandings(b);
    const mine = standings.find((e) => e.userId === uid);

    const windowSpent = (await burnTotals([uid], b.startsAt)).get(uid) ?? 0n;
    const windowEligible =
      cfg.rankedMinWindowBurnedRibbit <= 0 ||
      windowSpent >= toRaw(cfg.rankedMinWindowBurnedRibbit);

    positions.push({
      id: b.id,
      title: b.title,
      game,
      prizeRibbit: fromRaw(b.prizeRibbit),
      value,
      unit: arcade ? "best score" : "net credits",
      inRunning: !!mine,
      projectedRibbit: mine ? fromRaw(mine.projectedRaw) : 0,
      spendEligible: lifetimeEligible && windowEligible,
      lifetimeEligible,
      windowEligible,
      progress: await bountyProgress(b),
    });
  }
  return ok(positions);
});
