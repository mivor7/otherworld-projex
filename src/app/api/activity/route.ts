// Public, anonymized activity feed for the live ticker.
import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fromRaw } from "@/lib/config";

// Live data — no CDN caching; a short in-process TTL below collapses the
// per-viewer polling (home ticker, every 30s) to ~one DB pass per window.
export const dynamic = "force-dynamic";

// The feed is identical for every viewer — cache the computed events briefly.
type Cached = { at: number; value: unknown };
let cache: Cached | null = null;
const TTL_MS = 5_000;

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const GAME_NAMES: Record<string, string> = {
  flip: "Frog Flip",
  dice: "Pond Dice",
  blackjack: "Blackjack",
};

export const GET = handler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return ok(cache.value);
  const [rounds, bids, burns, scores, awards] = await Promise.all([
    prisma.gameRound.findMany({
      where: { settled: true },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { wallet: true } } },
    }),
    prisma.bid.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { wallet: true } },
        auction: { select: { title: true } },
      },
    }),
    prisma.burnEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { wallet: true } } },
    }),
    prisma.arcadeScore.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { wallet: true } } },
    }),
    prisma.bountyAward.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        user: { select: { wallet: true } },
        bounty: { select: { title: true } },
      },
    }),
  ]);

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const ARCADE_NAMES: Record<string, string> = {
    hopper: "Hopper",
    frogris: "Frogris",
    worm: "Worm Frog",
  };
  const events = [
    ...rounds.map((r) => ({
      at: r.createdAt,
      kind: r.payout > r.wager ? "win" : "play",
      href: `/games/${r.game}`,
      text:
        r.payout > r.wager
          ? `${short(r.user.wallet)} won ${fmt(r.payout)} credits at ${GAME_NAMES[r.game] ?? r.game}`
          : `${short(r.user.wallet)} played ${GAME_NAMES[r.game] ?? r.game}`,
    })),
    ...bids.map((b) => ({
      at: b.createdAt,
      kind: "bid",
      href: `/auctions/${b.auctionId}`,
      text: `${short(b.user.wallet)} bid ${fmt(fromRaw(b.amountRaw))} $RIBBIT on “${b.auction.title}”`,
    })),
    ...burns.map((b) => ({
      at: b.createdAt,
      kind: "burn",
      href: "/games",
      text: `${short(b.user.wallet)} burned ${fmt(fromRaw(b.amountRaw))} $RIBBIT for ${b.credits} credits`,
    })),
    ...scores.map((s) => ({
      at: s.createdAt,
      kind: "score",
      href: `/games/${s.game}`,
      text: `${short(s.user.wallet)} scored ${fmt(s.score)} in ${ARCADE_NAMES[s.game] ?? s.game}`,
    })),
    ...awards.map((a) => ({
      at: a.createdAt,
      kind: "award",
      href: "/bounties",
      text: `${short(a.user.wallet)} was paid ${fmt(fromRaw(a.amountRaw))} $RIBBIT from “${a.bounty.title}”`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 18);

  cache = { at: Date.now(), value: events };
  return ok(events);
});
