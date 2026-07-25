import Link from "next/link";
import { PageHero } from "@/components/hero";
import { Reveal } from "@/components/reveal";
import { ActivityTicker } from "@/components/activity-ticker";
import { CopyChip } from "@/components/copy-chip";
import { MatteMedia } from "@/components/matte-media";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { fromRaw } from "@/lib/config";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { houseConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

const WINGS = [
  {
    href: "/games",
    image: "/art/owp_hero.jpg",
    kicker: "Wing I",
    title: "The Arcade",
    desc: "Provably-fair games at a published house edge. Credits bought with $RIBBIT — part burned forever, part funding the prizes. Verify every roll.",
    cta: "Enter",
  },
  {
    href: "/auctions",
    image: "/art/hero-auction.jpg",
    kicker: "Wing II",
    title: "The Auction House",
    desc: "Collectibles, 1/1s and services under the gavel. Escrowed $RIBBIT bids, anti-snipe closings, community consignments.",
    cta: "View lots",
  },
  {
    href: "/bounties",
    image: "/art/art-bounty.jpg",
    kicker: "Wing III",
    title: "The Bounty Board",
    desc: "Fixed $RIBBIT pools that unlock as each game is played. Every eligible winner is paid automatically, pro-rata — free episodes pay weekly.",
    cta: "Open board",
  },
];

// The house's game slate. `game` links a card to its live bounty pool;
// cards with no href are placeholders still in production.
const GAME_SLATE: {
  image: string;
  title: string;
  href?: string;
  game?: string;
  free?: boolean; // arcade games are free; tables cost credits
}[] = [
  { image: "/art/owp_frogris.png", title: "Frogris", href: "/games/frogris", game: "frogris", free: true },
  { image: "/art/owp_bj.png", title: "Blackjack", href: "/games/blackjack", game: "blackjack", free: false },
  { image: "/art/owp_pump.png", title: "Frog Flip", href: "/games/flip", game: "flip", free: false },
  { image: "/art/art-dice.jpg", title: "Pond Dice", href: "/games/dice", game: "dice", free: false },
  { image: "/art/owp_frogger.png", title: "Hopper", href: "/games/hopper", game: "hopper", free: true },
  { image: "/art/owp_worm.png", title: "Worm Frog", href: "/games/worm", game: "worm", free: true },
  { image: "/art/owp_ff.jpg", title: "Fraud Frog Exterminator" },
  { image: "/art/owp_poker.png", title: "Poker Face" },
];

// "2h ago" style timestamps for the payout ledger.
function ago(d: Date): string {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export default async function Home() {
  const [chain, burnAgg, buyBurnAgg, roundCount, openBounties, awards, paidAgg, gameBounties, openPrizeAgg] =
    await Promise.all([
      getTreasuryStats(),
      prisma.burnEvent.aggregate({ _sum: { amountRaw: true } }),
      prisma.creditPurchase.aggregate({ _sum: { burnedRaw: true } }),
      prisma.gameRound.count(),
      prisma.bounty.count({ where: { status: "open" } }),
      prisma.bountyAward.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { wallet: true } },
          bounty: { select: { title: true, game: true } },
        },
      }),
      prisma.bountyAward.aggregate({ _sum: { amountRaw: true } }),
      prisma.bounty.findMany({
        where: { status: "open", game: { not: null } },
        select: { game: true, prizeRibbit: true },
        orderBy: { prizeRibbit: "desc" },
      }),
      prisma.bounty.aggregate({ where: { status: "open" }, _sum: { prizeRibbit: true } }),
    ]);
  const houseCfg = await houseConfig(); // live, admin-tunable values
  // Richest live pool per game — powers the bounty chip on each card.
  const poolByGame = new Map<string, bigint>();
  for (const b of gameBounties) {
    if (b.game && !poolByGame.has(b.game)) poolByGame.set(b.game, b.prizeRibbit);
  }
  // Pure burns + the burn leg of every credit purchase — the real number.
  const burned = fromRaw(
    (burnAgg._sum.amountRaw ?? 0n) + (buyBurnAgg._sum.burnedRaw ?? 0n)
  );
  const paidOut = fromRaw(paidAgg._sum.amountRaw ?? 0n);
  const openPrize = fromRaw(openPrizeAgg._sum.prizeRibbit ?? 0n);

  return (
    <div className="pt-6">
      <PageHero
        image="/art/hero-flagship.jpg"
        imagePosition="center 42%"
        interactive
        kicker="Decentralized bounty arcade · Solana"
        badge={houseCfg.inviteRequired ? "Invite-only beta" : "The hunt is always open"}
        title="Token holders become"
        titleAccent="bounty hunters."
        subtitle={
          <>
            Turn $RIBBIT into credits — part burned forever, part funding the
            prize pool. Play provably-fair games, bid on lots, and hunt
            bounties that pay out automatically. Everything settles against
            one transparent treasury.
          </>
        }
        actions={
          <>
            <Link href="/games" className="btn btn-primary btn-lg" data-magnetic>
              Enter the arcade
            </Link>
            <Link href="/auctions" className="btn btn-ghost btn-lg" data-magnetic>
              View the lots
            </Link>
          </>
        }
        stats={[
          {
            value: chain.solBalance !== null ? `${chain.solBalance.toFixed(2)} SOL` : "—",
            label: "Treasury",
          },
          {
            value: burned.toLocaleString(undefined, { maximumFractionDigits: 0 }),
            label: "$RIBBIT burned",
          },
          { value: roundCount.toLocaleString(), label: "Rounds settled" },
          { value: openBounties.toLocaleString(), label: "Open bounties" },
        ]}
        brand
      />

      <ActivityTicker />

      {/* The wings */}
      <section className="mt-16">
        <Reveal>
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="kicker mb-2">The house</div>
              <h2 className="text-[1.5rem]">Three wings, one treasury</h2>
            </div>
          </div>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-4">
          {WINGS.map((w, i) => (
            <Reveal key={w.href} delay={i * 70}>
              <Link href={w.href} className="lot-card h-full group">
                <div className="card-media">
                  {w.href === "/auctions" && (
                    <span className="badge badge-urgent absolute top-2 right-2 z-10">Beta</span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.image} alt="" loading="lazy" />
                </div>
                <div className="card-body">
                  <div className="kicker !text-[0.6rem]">{w.kicker}</div>
                  <h3 className="!text-[1.05rem]">{w.title}</h3>
                  <p className="text-fog text-[0.85rem] leading-relaxed">{w.desc}</p>
                  <div className="card-price-row">
                    <span className="card-price-label">{w.cta}</span>
                    <span className="text-fog group-hover:text-neon transition-colors">→</span>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How the loop works */}
      <section className="mt-16">
        <Reveal>
          <div className="kicker mb-2">Protocol</div>
          <h2 className="text-[1.5rem] mb-6">How the loop works</h2>
        </Reveal>
        <div className="mesh-band p-4 sm:p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["01", "Connect & sign", "A free message signature proves wallet ownership. No custody, no email, no password."],
            ["02", "Buy credits", `${houseCfg.ribbitPerCredit} $RIBBIT per credit, verified on-chain — ${Math.round(houseCfg.buyBurnShare * 100)}% burned from supply forever, the rest funds the house that pays the prizes.`],
            ["03", "Play, bid, hunt", "Wager credits in the arcade, bid escrowed $RIBBIT on lots, climb the bounty boards."],
            ["04", "Pools unlock with play", "Every bounty posts a fixed $RIBBIT pool and a spend meter sized to it. The meter fills — every eligible winner is paid pro-rata, automatically."],
          ].map(([n, title, desc], i) => (
            <Reveal key={n} delay={i * 60}>
              <div className="panel panel-hover p-5 h-full">
                <div className="mono text-xs text-neon mb-3">{n}</div>
                <div className="font-medium mb-1.5 tracking-tight">{title}</div>
                <p className="text-fog text-[0.85rem] leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The bounty board — active hunts per game + what the house has paid */}
      <section className="mt-16">
        <Reveal>
          <div className="panel overflow-hidden">
            {/* header band */}
            <div className="flex items-end justify-between gap-4 flex-wrap p-6 pb-5">
              <div>
                <div className="kicker mb-2">The bounty board</div>
                <h2 className="text-[1.5rem]">Active hunts</h2>
                <p className="text-fog text-[0.85rem] mt-1.5 max-w-md leading-relaxed">
                  Every live game carries a fixed $RIBBIT pool that unlocks as
                  it&apos;s played. Pick a target, fill the meter, split the pool.
                </p>
              </div>
              <div className="flex items-baseline gap-6 text-right">
                <div>
                  <div className="stat-number text-neon text-[1.35rem]">
                    {openPrize.toLocaleString(undefined, { maximumFractionDigits: 0 })} $RIBBIT
                  </div>
                  <div className="kicker !text-[0.6rem]">on the board now</div>
                </div>
                <div>
                  <div className="stat-number text-gold text-[1.35rem]">
                    {paidOut.toLocaleString(undefined, { maximumFractionDigits: 0 })} $RIBBIT
                  </div>
                  <div className="kicker !text-[0.6rem]">paid to hunters, all time</div>
                </div>
              </div>
            </div>

            {/* the games, each with its live bounty pool */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6">
              {GAME_SLATE.map((e, i) => {
                const poolRaw = e.game ? poolByGame.get(e.game) : undefined;
                const live = !!e.href;
                const card = (
                  <div className="lot-card h-full group">
                    <div className="card-media !aspect-square">
                      <MatteMedia src={e.image} alt={e.title} fit="cover" />
                      {live ? (
                        <span className="badge badge-live absolute top-2 right-2">
                          <span className="live-dot" /> Live
                        </span>
                      ) : (
                        <span className="badge badge-urgent absolute top-2 right-2">
                          Soon
                        </span>
                      )}
                      {poolRaw !== undefined && (
                        <span className="badge badge-gold absolute bottom-2 left-2 !text-[0.6rem]">
                          {fromRaw(poolRaw).toLocaleString(undefined, { maximumFractionDigits: 0 })} $RIBBIT
                        </span>
                      )}
                    </div>
                    <div className="card-body !p-3">
                      <h3 className="!text-[0.8rem] !min-h-0">{e.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        {live && (
                          <span
                            className="text-[0.55rem] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                            style={
                              e.free
                                ? { background: "oklch(0.78 0.11 150 / 0.15)", color: "oklch(0.85 0.12 150)" }
                                : { background: "oklch(0.78 0.12 85 / 0.15)", color: "oklch(0.85 0.13 85)" }
                            }
                          >
                            {e.free ? "Free" : "Credits"}
                          </span>
                        )}
                        <span className="text-[0.66rem]" style={{ color: "var(--text-dim)" }}>
                          {poolRaw !== undefined ? "Bounty live" : live ? "Play now" : "In production"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
                return (
                  <Reveal key={e.title} delay={i * 50}>
                    {e.href ? <Link href={e.href}>{card}</Link> : card}
                  </Reveal>
                );
              })}
            </div>

            {/* the ledger footer — proof the pools actually pay */}
            <div
              className="mt-6 border-t"
              style={{ borderColor: "var(--hairline)" }}
            >
              {awards.length === 0 ? (
                <div className="p-5 px-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-fog text-sm">
                    <span className="kicker !text-[0.6rem] mr-2">Recent payouts</span>
                    No pools have triggered yet — the first hunts are filling
                    their meters now.
                  </p>
                  <Link href="/bounties" className="btn btn-ghost !text-xs">
                    Watch the board →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-6 pt-4 pb-1">
                    <span className="kicker !text-[0.6rem]">Recent payouts</span>
                    <Link href="/bounties" className="text-xs text-fog hover:text-neon transition-colors">
                      Full board →
                    </Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {awards.slice(0, 5).map((a) => (
                          <tr key={a.id} className="table-row">
                            <td className="py-2.5 px-6 mono text-xs whitespace-nowrap">
                              {shortWallet(a.user.wallet)}
                            </td>
                            <td className="py-2.5 pr-4 min-w-0">
                              <Link
                                href={a.bounty.game ? `/games/${a.bounty.game}` : "/bounties"}
                                className="hover:text-neon transition-colors"
                              >
                                {a.bounty.title}
                              </Link>
                            </td>
                            <td className="py-2.5 pr-4 stat-number text-gold text-right whitespace-nowrap">
                              +{fromRaw(a.amountRaw).toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                              $RIBBIT
                            </td>
                            <td
                              className="py-2.5 pr-6 text-xs text-right whitespace-nowrap"
                              style={{ color: "var(--text-dim)" }}
                            >
                              {ago(a.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </Reveal>
      </section>

      {/* Token */}
      <section className="mt-16">
        <Reveal>
          <div className="panel panel-glow overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="p-5 sm:p-8">
              <div className="kicker mb-2">Settlement currency</div>
              <h2 className="text-[1.5rem] mb-3">$RIBBIT</h2>
              <p className="text-fog text-[0.9375rem] leading-relaxed max-w-lg mb-5">
                One token fuels the house: it buys your credits (part of every
                purchase is burned at the mint), backs your bids, and pays out
                of every bounty pool. Launched fair on pump.fun — the treasury
                holds no premine.
              </p>
              <div className="flex items-center gap-2 flex-wrap mb-6">
                <div
                  className="mono text-xs rounded-md border px-3.5 py-2.5 inline-block break-all"
                  style={{ borderColor: "var(--hairline-strong)", color: "var(--color-neon)" }}
                >
                  {CLIENT_CONFIG.ribbitMint}
                </div>
                <CopyChip text={CLIENT_CONFIG.ribbitMint} />
              </div>
              <div className="flex flex-wrap gap-2.5">
                <a href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                  Acquire on pump.fun ↗
                </a>
                <a href={CLIENT_CONFIG.xUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  @OWProjex ↗
                </a>
                <Link href="/treasury" className="btn btn-ghost">
                  Inspect the treasury
                </Link>
              </div>
            </div>
            <div className="hidden md:block relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/art/ribbit-mark.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "brightness(0.85)" }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, var(--color-surface) 0%, transparent 45%)",
                }}
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* Vault-intro "go" flag — lives INSIDE the page so it streams WITH the
          content it vouches for (App Router streams the layout shell out of
          order, so an end-of-body script in the layout runs too early). When
          the parser executes this, the homepage markup above it is in the
          DOM: the doors are cleared to open onto a real page. The 1.15s floor
          keeps the wheel moment on fast loads. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var h=document.documentElement;if(h.getAttribute("data-intro")==="1"){setTimeout(function(){h.setAttribute("data-intro-go","1")},Math.max(0,1150-performance.now()))}}catch(e){}`,
        }}
      />
    </div>
  );
}
