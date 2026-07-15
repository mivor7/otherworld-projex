import Link from "next/link";
import { Logo } from "@/components/logo";
import { StatCard } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getTreasuryStats } from "@/lib/solana";
import { CONFIG, fromRaw } from "@/lib/config";
import { CLIENT_CONFIG } from "@/lib/client-config";

export const dynamic = "force-dynamic";

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
    <div>
      {/* Hero */}
      <section className="pt-16 pb-12 text-center flex flex-col items-center">
        <div className="mb-6 drop-shadow-[0_0_45px_rgba(54,245,129,0.35)]">
          <Logo size={110} />
        </div>
        <div className="text-xs uppercase tracking-[0.3em] text-neon mb-3">
          Decentralized bounty arcade on Solana
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl leading-[1.05]">
          Enter the <span className="neon-text">Other World</span>.
        </h1>
        <p className="text-fog max-w-2xl mt-5 text-lg leading-relaxed">
          Burn <span className="text-neon font-semibold">$RIBBIT</span> to play
          provably-fair games. Bid in community auctions. Hunt bounties for big
          prizes. Every credit, every roll, every payout — verifiable against one
          transparent treasury.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <Link href="/games" className="btn btn-primary text-base px-7 py-3">
            Enter the Arcade
          </Link>
          <Link href="/auctions" className="btn btn-portal text-base px-7 py-3">
            Auction House
          </Link>
        </div>
      </section>

      {/* Live stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-16">
        <StatCard
          label="Treasury SOL"
          value={chain.solBalance !== null ? chain.solBalance.toFixed(2) : "—"}
          sub={chain.configured ? "live on-chain" : "treasury not configured"}
        />
        <StatCard
          label="$RIBBIT burned"
          value={burned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          sub="burn-to-play, forever out of supply"
          tone="gold"
        />
        <StatCard label="Rounds played" value={roundCount.toLocaleString()} sub="provably fair" tone="portal" />
        <StatCard
          label="Live now"
          value={`${liveAuctions} / ${openBounties}`}
          sub="auctions / bounties"
          tone="plain"
        />
      </section>

      {/* Pillars */}
      <section className="grid md:grid-cols-3 gap-4 mb-16">
        <Link href="/games" className="panel panel-glow p-6 hover:border-neon-dim transition-colors group">
          <div className="text-3xl mb-3">🎮</div>
          <h3 className="font-bold text-lg mb-2 group-hover:text-neon">The Arcade</h3>
          <p className="text-fog text-sm leading-relaxed">
            Frog Flip, Pond Dice and the Hopper arcade. Burn $RIBBIT for credits,
            play against the house at a published {Math.round(CONFIG.houseEdge * 100)}% edge,
            withdraw or keep hunting. Every outcome is commit–reveal verifiable.
          </p>
        </Link>
        <Link href="/auctions" className="panel p-6 hover:border-portal-dim transition-colors group">
          <div className="text-3xl mb-3">🏛️</div>
          <h3 className="font-bold text-lg mb-2 group-hover:text-portal">Auction House</h3>
          <p className="text-fog text-sm leading-relaxed">
            Bid with $RIBBIT on listed items — collectibles, NFTs, merch.
            Community members apply to list their own items. Anti-snipe timers,
            escrowed bids, instant refunds when outbid.
          </p>
        </Link>
        <Link href="/bounties" className="panel p-6 hover:border-gold/40 transition-colors group">
          <div className="text-3xl mb-3">🏆</div>
          <h3 className="font-bold text-lg mb-2 group-hover:text-gold">Bounties</h3>
          <p className="text-fog text-sm leading-relaxed">
            Weekly leaderboard competitions and one-off challenges, funded by the
            house take. Top hunters split prize pools paid in $RIBBIT.
          </p>
        </Link>
      </section>

      {/* How it works */}
      <section className="mb-16">
        <h2 className="text-xl font-bold mb-6 text-center">How the loop works</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["1", "Connect & sign", "Prove wallet ownership with a free message signature. No custody, no email, no password."],
            ["2", "Burn for credits", `Burn ${CLIENT_CONFIG.ribbitPerCredit} $RIBBIT per play credit — verified on-chain, gone from supply forever.`],
            ["3", "Play, bid, hunt", "Wager credits in the arcade, bid deposited $RIBBIT in auctions, climb bounty leaderboards."],
            ["4", "House take flows back", "50% treasury · 30% bounty prize pools · 20% operations. All movements published."],
          ].map(([n, title, desc]) => (
            <div key={n} className="panel p-5">
              <div className="stat-number text-neon text-sm mb-2">{n}</div>
              <div className="font-semibold mb-1.5">{title}</div>
              <p className="text-fog text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Token */}
      <section className="panel panel-glow p-8 text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-neon mb-2">The token</div>
        <h2 className="text-2xl font-bold mb-3">$RIBBIT</h2>
        <p className="text-fog max-w-xl mx-auto text-sm leading-relaxed mb-5">
          $RIBBIT is the fuel of the Other World: burn it to play, bid it in
          auctions, win it from bounty pools. Launched fair on pump.fun.
        </p>
        <code className="stat-number text-xs sm:text-sm text-neon-soft bg-abyss border border-edge rounded-lg px-4 py-2 inline-block break-all">
          {CLIENT_CONFIG.ribbitMint}
        </code>
        <div className="flex flex-wrap gap-3 justify-center mt-6">
          <a href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
            Buy on pump.fun ↗
          </a>
          <a href={CLIENT_CONFIG.xUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
            Follow @OWProjex ↗
          </a>
          <Link href="/treasury" className="btn btn-ghost">
            Inspect the treasury
          </Link>
        </div>
      </section>
    </div>
  );
}
