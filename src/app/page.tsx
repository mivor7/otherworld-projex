import Link from "next/link";
import { PageHero } from "@/components/hero";
import { Reveal } from "@/components/reveal";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { fromRaw } from "@/lib/config";
import { CLIENT_CONFIG } from "@/lib/client-config";

export const dynamic = "force-dynamic";

const WINGS = [
  {
    href: "/games",
    image: "/art/owp_hero.jpg",
    kicker: "Wing I",
    title: "The Arcade",
    desc: "Provably-fair games at a published house edge. Burn $RIBBIT for credits, call your shots, verify every roll.",
    cta: "Enter",
  },
  {
    href: "/auctions",
    image: "/art/art-gavel.jpg",
    kicker: "Wing II",
    title: "The Auction House",
    desc: "Collectibles, 1/1s and services under the gavel. Escrowed $RIBBIT bids, anti-snipe closings, community consignments.",
    cta: "View lots",
  },
  {
    href: "/bounties",
    image: "/art/lot-card-shark.jpg",
    kicker: "Wing III",
    title: "The Bounty Board",
    desc: "Weekly competitions and one-off challenges, funded by the house take. Top hunters split the pool.",
    cta: "Open board",
  },
];

const EPISODES = [
  { image: "/art/owp_ff.jpg", title: "Fraud Frog Exterminator" },
  { image: "/art/owp_frogris.png", title: "Frogris" },
  { image: "/art/owp_frogger.png", title: "Frogger" },
  { image: "/art/owp_worm.png", title: "Worm Frog" },
  { image: "/art/owp_bj.png", title: "Blackjack" },
  { image: "/art/owp_poker.png", title: "Poker Face" },
];

export default async function Home() {
  const [chain, burnAgg, roundCount, liveAuctions, openBounties] =
    await Promise.all([
      getTreasuryStats(),
      prisma.burnEvent.aggregate({ _sum: { amountRaw: true } }),
      prisma.gameRound.count(),
      prisma.auction.count({ where: { status: "live" } }),
      prisma.bounty.count({ where: { status: "open" } }),
    ]);
  const burned = fromRaw(burnAgg._sum.amountRaw ?? 0n);

  return (
    <div className="pt-6">
      <PageHero
        image="/art/hero-auction.jpg"
        kicker="Decentralized bounty arcade · Solana"
        badge="The hunt is always open"
        title="Token holders become"
        titleAccent="bounty hunters."
        subtitle={
          <>
            Burn $RIBBIT to play provably-fair games. Bid on lots in the
            auction house. Hunt bounties funded by the house take. Every
            credit, roll and payout settles against one transparent treasury.
          </>
        }
        actions={
          <>
            <Link href="/games" className="btn btn-primary btn-lg">
              Enter the arcade
            </Link>
            <Link href="/auctions" className="btn btn-ghost btn-lg">
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
          { value: `${liveAuctions} · ${openBounties}`, label: "Lots · bounties" },
        ]}
        brand
      />

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
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["01", "Connect & sign", "A free message signature proves wallet ownership. No custody, no email, no password."],
            ["02", "Burn for credits", `${CLIENT_CONFIG.ribbitPerCredit} $RIBBIT per credit — verified on-chain, removed from supply forever.`],
            ["03", "Play, bid, hunt", "Wager credits in the arcade, bid escrowed $RIBBIT on lots, climb the bounty boards."],
            ["04", "The take flows back", "House take splits 50% treasury · 30% bounty pools · 20% operations. Every movement is published."],
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

      {/* Episodes — production slate */}
      <section className="mt-16">
        <Reveal>
          <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
            <div>
              <div className="kicker mb-2">In production</div>
              <h2 className="text-[1.5rem]">The episodes</h2>
            </div>
            <p className="text-fog text-sm max-w-xs leading-relaxed">
              The original five arcade episodes, remastered for the new house.
              Badge rewards for the card tables.
            </p>
          </div>
        </Reveal>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {EPISODES.map((e, i) => (
            <Reveal key={e.title} delay={i * 50}>
              <div className="lot-card">
                <div className="card-media !aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.image} alt={e.title} loading="lazy" />
                  <span className="badge badge-urgent absolute top-2 right-2">
                    Soon
                  </span>
                </div>
                <div className="card-body !p-3">
                  <h3 className="!text-[0.8rem] !min-h-0">{e.title}</h3>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Token */}
      <section className="mt-16">
        <Reveal>
          <div className="panel panel-glow overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="p-8">
              <div className="kicker mb-2">Settlement currency</div>
              <h2 className="text-[1.5rem] mb-3">$RIBBIT</h2>
              <p className="text-fog text-[0.9375rem] leading-relaxed max-w-lg mb-5">
                One token fuels the house: burn it to play, bid it on lots, win
                it from bounty pools. Launched fair on pump.fun — the treasury
                holds no premine.
              </p>
              <div
                className="mono text-xs rounded-md border px-3.5 py-2.5 inline-block break-all mb-6"
                style={{ borderColor: "var(--hairline-strong)", color: "var(--color-neon)" }}
              >
                {CLIENT_CONFIG.ribbitMint}
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
    </div>
  );
}
