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
import { fromRaw } from "@/lib/config";
import { autoSettleBounties, bountyProgress, bountyStandings } from "@/lib/bounty";

// Live data — never cache; always read current DB state.
export const dynamic = "force-dynamic";

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

// Standings are the expensive part (ranking + eligibility aggregates) and
// every game page polls this route every 10s — cache the SHARED ranked list
// per bounty for a few seconds. The caller-specific "you" block is derived
// from the cached list, so nothing user-specific is ever shared.
type Standings = Awaited<ReturnType<typeof bountyStandings>>;
const standingsCache = new Map<string, { at: number; value: Standings }>();
const STANDINGS_TTL_MS = 5_000;

async function cachedStandings(bounty: Parameters<typeof bountyStandings>[0]): Promise<Standings> {
  const hit = standingsCache.get(bounty.id);
  if (hit && Date.now() - hit.at < STANDINGS_TTL_MS) return hit.value;
  const value = await bountyStandings(bounty);
  standingsCache.set(bounty.id, { at: Date.now(), value });
  // Drop stale entries so the map stays tiny.
  for (const [k, v] of standingsCache) {
    if (Date.now() - v.at > STANDINGS_TTL_MS * 10) standingsCache.delete(k);
  }
  return value;
}

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
    });
    const byGame: Record<string, unknown> = {};
    for (const b of open) {
      if (byGame[b.game!]) continue; // richest open bounty per game
      byGame[b.game!] = {
        id: b.id,
        title: b.title,
        prizeRibbit: fromRaw(b.prizeRibbit),
        prizeText: b.prizeText,
        autoPay: b.autoPay,
        progress: await bountyProgress(b),
      };
    }
    return ok({ games: byGame });
  }

  const bounty = await prisma.bounty.findFirst({
    where: { status: "open", game },
    orderBy: { prizeRibbit: "desc" },
  });
  if (!bounty) return ok({ bounty: null, entries: [], you: null });

  const standings = await cachedStandings(bounty);
  const session = await getSession();

  const entries = standings.map((e) => ({
    rank: e.rank,
    wallet: short(e.wallet),
    value: e.value,
    projectedRibbit: fromRaw(e.projectedRaw),
    isYou: session?.userId === e.userId,
  }));

  let you: { eligible: boolean; value: number; projectedRibbit: number } | null = null;
  if (session) {
    const mine = standings.find((e) => e.userId === session.userId);
    you = mine
      ? { eligible: true, value: mine.value, projectedRibbit: fromRaw(mine.projectedRaw) }
      : { eligible: false, value: 0, projectedRibbit: 0 };
  }

  return ok({
    bounty: {
      id: bounty.id,
      title: bounty.title,
      prizeRibbit: fromRaw(bounty.prizeRibbit),
      prizeText: bounty.prizeText,
      autoPay: bounty.autoPay,
      unit: ["hopper", "frogris", "worm"].includes(game) ? "best score" : "net credits",
      progress: await bountyProgress(bounty),
    },
    entries,
    you,
  });
});
