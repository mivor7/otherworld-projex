import Link from "next/link";
import { PageHero } from "@/components/hero";
import { Reveal } from "@/components/reveal";
import { ActivityTicker } from "@/components/activity-ticker";
import { BuyOwp } from "@/components/buy-owp";
import { EnterOtherWorld } from "@/components/enter-other-world";
import { CopyChip } from "@/components/copy-chip";
import { HomeBountyBoard } from "@/components/home-bounty-board";
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
    desc: "Provably-fair games at a published house edge. Deposit $OWP, wager it from your balance, withdraw anytime. Verify every roll.",
    cta: "Enter",
  },
  {
    href: "/auctions",
    image: "/art/hero-auction.jpg",
    kicker: "Wing II",
    title: "The Auction House",
    desc: "Collectibles, 1/1s and services under the gavel. Escrowed $OWP bids, anti-snipe closings, community consignments.",
    cta: "View lots",
  },
  {
    href: "/bounties",
    image: "/art/art-bounty.jpg",
    kicker: "Wing III",
    title: "The Bounty Board",
    desc: "Fixed $OWP pools that unlock as each game is played. Every eligible winner is paid automatically, pro-rata — free episodes pay weekly.",
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
  free?: boolean; // arcade games are free; tables wager $OWP
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
  const [chain, depositAgg, roundCount, openBounties, awards, paidAgg, gameBounties, openPrizeAgg] =
    await Promise.all([
      getTreasuryStats(),
      prisma.deposit.aggregate({ _sum: { amountRaw: true } }),
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
  const poolByGame: Record<string, number> = {};
  for (const b of gameBounties) {
    if (b.game && poolByGame[b.game] === undefined) {
      poolByGame[b.game] = fromRaw(b.prizeRibbit);
    }
  }
  const awardRows = awards.map((a) => ({
    id: a.id,
    walletShort: shortWallet(a.user.wallet),
    title: a.bounty.title,
    game: a.bounty.game,
    amountRibbit: fromRaw(a.amountRaw),
    ago: ago(a.createdAt),
  }));
  const deposited = fromRaw(depositAgg._sum.amountRaw ?? 0n);
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
            Deposit $OWP to the house and it becomes your balance. Play
            provably-fair games, bid on lots, and hunt bounties. Withdraw
            anytime — the same wallet pays you automatically.
          </>
        }
        actions={
          <>
            <Link href="#buy" className="btn btn-primary btn-lg" data-magnetic>
              Buy $OWP
            </Link>
            <Link href="/games" className="btn btn-ghost btn-lg" data-magnetic>
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
            value: deposited.toLocaleString(undefined, { maximumFractionDigits: 0 }),
            label: "$OWP deposited",
          },
          { value: roundCount.toLocaleString(), label: "Rounds settled" },
          { value: openBounties.toLocaleString(), label: "Open bounties" },
        ]}
        brand
      />

      <EnterOtherWorld />

      <BuyOwp />

      <ActivityTicker />

      {/* The wings */}
      <section id="owp-wings" className="mt-16 scroll-mt-24">
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
            ["02", "Deposit $OWP", "Send $OWP to the house wallet. The transfer is verified on-chain and credited to your in-app balance."],
            ["03", "Play, bid, hunt", "Wager $OWP at the tables, bid from the same balance, and climb the bounty boards."],
            ["04", "Pools unlock with play", "Every bounty posts a fixed $OWP pool and a spend meter sized to it. The meter fills — every eligible winner is paid pro-rata, automatically."],
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
      <HomeBountyBoard
        gameSlate={GAME_SLATE}
        poolByGame={poolByGame}
        openPrize={openPrize}
        paidOut={paidOut}
        awards={awardRows}
      />

      {/* Token */}
      <section className="mt-16">
        <Reveal>
          <div className="panel panel-glow overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="p-5 sm:p-8">
              <div className="kicker mb-2">Settlement currency</div>
              <h2 className="text-[1.5rem] mb-3">$OWP</h2>
              <p className="text-fog text-[0.9375rem] leading-relaxed max-w-lg mb-5">
                $OWP is the balance. People buy and sell it on the open market.
                The house does not trade its wallet to move that price. Deposit
                it, play and bid with it, and withdraw it. On Frog Flip and Pond
                Dice the only cut is a 4% house edge. The software was written
                by mivor7. The live mint is below.
              </p>
              {CLIENT_CONFIG.ribbitMint && (
                <div className="flex items-center gap-2 flex-wrap mb-6">
                  <div
                    className="mono text-xs rounded-md border px-3.5 py-2.5 inline-block break-all"
                    style={{ borderColor: "var(--hairline-strong)", color: "var(--color-neon)" }}
                  >
                    {CLIENT_CONFIG.ribbitMint}
                  </div>
                  <CopyChip text={CLIENT_CONFIG.ribbitMint} />
                </div>
              )}
              <div className="flex flex-wrap gap-2.5">
                <a href="#buy" className="btn btn-primary">
                  Buy from the house
                </a>
                {CLIENT_CONFIG.raydiumUrl && (
                  <a href={CLIENT_CONFIG.raydiumUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    Raydium ↗
                  </a>
                )}
                <Link href="/whitepaper" className="btn btn-ghost">
                  Whitepaper
                </Link>
                <Link href="/treasury" className="btn btn-ghost">
                  Inspect the treasury
                </Link>
              </div>
            </div>
            <div className="hidden md:block relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/art/logo.png"
                alt="$OWP"
                className="absolute inset-0 w-full h-full object-contain"
                style={{ background: "#05070a" }}
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
