// Live-bounty data for players:
//   GET /api/bounties/live            → per-game open-bounty summaries, for the
//                                        "live bounty" indicators across games.
//   GET /api/bounties/live?game=dice  → that game's open bounty + the current
//                                        projected pro-rata standings and the
//                                        caller's own projected earning.
// The projection is a live estimate — it shifts as people play and only
// settles when the bounty triggers.
import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fromRaw, toRaw } from "@/lib/config";
import { ARCADE_GAMES, autoSettleBounties, bountyProgress, cachedBountyStandings } from "@/lib/bounty";
import { burnTotals } from "@/lib/ranked";
import { houseConfig } from "@/lib/settings";
import { stakerWallets } from "@/lib/staking";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

// Standings caching lives in lib/bounty.cachedBountyStandings — shared with
// the account-page positions route so all pollers reuse one computation. The
// caller-specific "you" block is derived from the cached list, so nothing
// user-specific is ever shared.
export const GET = handler(async (req: Request) => {
  // Fire any due triggers first, so standings reflect only still-open bounties.
  await autoSettleBounties();

  const url = new URL(req.url);
  const game = url.searchParams.get("game");

  if (!game) {
    // Summaries for every game that has an open bounty (indicator badges).
    const open = await prisma.bounty.findMany({
      where: { status: "open", game: { not: null } },
      orderBy: { prizeRibbit: "desc" },
      take: 100,
    });
    const byGame: Record<string, unknown> = {};
    for (const b of open) {
      if (byGame[b.game!]) continue; // richest open bounty per game
      byGame[b.game!] = {
        id: b.id,
        title: b.title,
        round: b.round,
        prizeRibbit: fromRaw(b.prizeRibbit),
        prizeText: b.prizeText,
        autoPay: b.autoPay,
        progress: await bountyProgress(b),
      };
    }
    return ok({ games: byGame });
  }

  const session = await getSession();

  // A bounty for this game that settled in the last few minutes — surfaced so a
  // player who was racing sees the OUTCOME (paid / expired unpaid, won #N, and
  // whether a fresh round opened) instead of the strip silently changing.
  const RECENT_MS = 15 * 60 * 1000;
  const recentPaid = await prisma.bounty.findFirst({
    where: { game, status: "paid", paidAt: { gte: new Date(Date.now() - RECENT_MS) } },
    orderBy: { paidAt: "desc" },
  });
  // No recent payout? A deadline may still have passed with the pot unfilled
  // (or no eligible winner) — that end deserves an explanation too.
  const recentExpired = recentPaid
    ? null
    : await prisma.bounty.findFirst({
        where: {
          game,
          status: "closed",
          paidAt: null,
          endsAt: { gte: new Date(Date.now() - RECENT_MS), lte: new Date() },
        },
        orderBy: { endsAt: "desc" },
      });
  const recent = recentPaid ?? recentExpired;
  let justEnded: {
    id: string;
    title: string;
    round: number;
    outcome: "paid" | "expired";
    prizeRibbit: number;
    winners: number;
    you: { won: boolean; rank: number | null; amountRibbit: number } | null;
    // The fresh round already open on this game, if any — so the card can say
    // exactly what happens next instead of leaving players guessing.
    next: { round: number; autoRenew: boolean } | null;
  } | null = null;
  if (recent) {
    const awards = await prisma.bountyAward.findMany({
      where: { bountyId: recent.id },
      orderBy: { rank: "asc" },
    });
    let mine: { won: boolean; rank: number | null; amountRibbit: number } | null = null;
    if (session) {
      const a = awards.find((x) => x.userId === session.userId);
      mine = a
        ? { won: true, rank: a.rank, amountRibbit: Math.round(fromRaw(a.amountRaw)) }
        : { won: false, rank: null, amountRibbit: 0 };
    }
    justEnded = {
      id: recent.id,
      title: recent.title,
      round: recent.round,
      outcome: recentPaid ? "paid" : "expired",
      prizeRibbit: fromRaw(recent.prizeRibbit),
      winners: awards.length,
      you: mine,
      next: null, // filled below once the open bounty is known
    };
  }

  const bounty = await prisma.bounty.findFirst({
    where: { status: "open", game },
    orderBy: { prizeRibbit: "desc" },
  });
  if (justEnded && bounty && bounty.id !== justEnded.id) {
    justEnded.next = { round: bounty.round, autoRenew: bounty.autoRenew };
  }
  if (!bounty) return ok({ bounty: null, entries: [], you: null, justEnded });

  const standings = await cachedBountyStandings(bounty);

  const stakers = await stakerWallets();
  const entries = standings.map((e) => ({
    rank: e.rank,
    wallet: short(e.wallet),
    value: e.value,
    projectedRibbit: fromRaw(e.projectedRaw),
    isYou: session?.userId === e.userId,
    staker: stakers.has(e.wallet),
  }));

  // The caller's OWN live situation for this bounty — so they know exactly
  // where they stand instead of guessing: their net (or best score), whether
  // they're in the running, their projected share, and what (if anything) is
  // still missing to qualify.
  let you:
    | {
        inRunning: boolean;
        value: number; // net credits (tables) or best score (arcade)
        unit: "net chips" | "best score";
        projectedRibbit: number;
        spendEligible: boolean;
        lifetimeEligible: boolean;
        windowEligible: boolean;
        lifetimeSpent: number; // $RIBBIT spent on credits, lifetime
        windowSpent: number; // $RIBBIT spent on credits during this bounty
        volumeEligible: boolean; // tables: wagered enough in-window to rank
        windowWagered: number; // credits wagered on this table this window
      }
    | null = null;
  if (session) {
    const mine = standings.find((e) => e.userId === session.userId);
    const arcade = ARCADE_GAMES.has(game);
    let value: number;
    let windowWagered = 0;
    if (arcade) {
      const s = await prisma.arcadeScore.aggregate({
        where: { userId: session.userId, game, createdAt: { gte: bounty.startsAt } },
        _max: { score: true },
      });
      value = s._max.score ?? 0;
    } else {
      const r = await prisma.gameRound.aggregate({
        where: { userId: session.userId, game, settled: true, createdAt: { gte: bounty.startsAt } },
        _sum: { wager: true, payout: true },
      });
      windowWagered = r._sum.wager ?? 0;
      value = (r._sum.payout ?? 0) - windowWagered; // signed net credits
    }
    // Break eligibility into its two rules so the player is told EXACTLY what's
    // missing — they may satisfy lifetime spend yet still owe fresh spend this
    // window (the anti-sybil rule), or vice-versa.
    const cfg = await houseConfig();
    const [lifeTotals, winTotals] = await Promise.all([
      burnTotals([session.userId]),
      burnTotals([session.userId], bounty.startsAt),
    ]);
    const lifetimeEligible =
      cfg.rankedMinBurnedRibbit <= 0 ||
      (lifeTotals.get(session.userId) ?? 0n) >= toRaw(cfg.rankedMinBurnedRibbit);
    const windowEligible =
      cfg.rankedMinWindowBurnedRibbit <= 0 ||
      (winTotals.get(session.userId) ?? 0n) >= toRaw(cfg.rankedMinWindowBurnedRibbit);
    you = {
      inRunning: !!mine,
      value,
      unit: arcade ? "best score" : "net chips",
      projectedRibbit: mine ? fromRaw(mine.projectedRaw) : 0,
      spendEligible: lifetimeEligible && windowEligible,
      lifetimeEligible,
      windowEligible,
      lifetimeSpent: fromRaw(lifeTotals.get(session.userId) ?? 0n),
      windowSpent: fromRaw(winTotals.get(session.userId) ?? 0n),
      // The third gate, matching rankBountyEntries' volume filter — without
      // this a net-positive player under the floor is silently unranked.
      volumeEligible:
        arcade || cfg.rankedMinTableVolume <= 0 || windowWagered >= cfg.rankedMinTableVolume,
      windowWagered,
    };
  }

  return ok({
    bounty: {
      id: bounty.id,
      title: bounty.title,
      round: bounty.round,
      autoRenew: bounty.autoRenew,
      prizeRibbit: fromRaw(bounty.prizeRibbit),
      prizeText: bounty.prizeText,
      autoPay: bounty.autoPay,
      unit: ["hopper", "frogris", "worm"].includes(game) ? "best score" : "net chips",
      progress: await bountyProgress(bounty),
    },
    entries,
    you,
    justEnded,
  });
});
