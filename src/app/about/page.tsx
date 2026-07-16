import Link from "next/link";
import { PageHero } from "@/components/hero";
import { Reveal } from "@/components/reveal";
import { CopyChip } from "@/components/copy-chip";
import { CLIENT_CONFIG } from "@/lib/client-config";

export const metadata = {
  title: "About — Other World Projex",
  description: "The full dossier: the story, the house rules, the episodes, the treasury.",
};

const EPISODES = [
  {
    ep: "EP 01",
    name: "Fraud Frog Exterminator",
    target: "The Fraud Frog Kingpin",
    brief: "Hunt the copy cats. Stop the fraud frogs before they reach your base.",
    reward: "5,000 $RIBBIT",
    href: null,
  },
  {
    ep: "EP 02",
    name: "Frogris",
    target: "The Stack-Smuggler",
    brief: "Stack the falling frogs. Clear the lines. Don't top out.",
    reward: "7,500 $RIBBIT",
    href: "/games/frogris",
  },
  {
    ep: "EP 03",
    name: "Pac-Frog",
    target: "The Maze Ghost Boss",
    brief: "Eat the pellets. Dodge the ghosts. Survive the maze.",
    reward: "10,000 $RIBBIT",
    href: null,
  },
  {
    ep: "EP 04",
    name: "Worm Frog",
    target: "The Tail-Bite Serpent",
    brief: "Slither, grow, and don't bite your own tail.",
    reward: "12,500 $RIBBIT",
    href: "/games/worm",
  },
  {
    ep: "EP 05",
    name: "Hopper",
    target: "The Highway Bandit",
    brief: "Hop the lanes. Dodge the traffic. Ride the logs home.",
    reward: "15,000 $RIBBIT",
    href: "/games/hopper",
  },
  {
    ep: "EP 06",
    name: "Blackjack",
    target: "The House Toad",
    brief: "Beat the dealer. Hold the line. Bank the RIBBIT.",
    reward: "1,200 $RIBBIT + Card Shark badge",
    href: "/games/blackjack",
  },
  {
    ep: "EP 07",
    name: "Poker Face",
    target: "The Swamp Bot Ring",
    brief: "Outplay three swamp bots. Win the pot. Bank the RIBBIT.",
    reward: "2,500 $RIBBIT + Poker Face badge",
    href: null,
  },
];

export default function AboutPage() {
  return (
    <div className="pt-6">
      <PageHero
        compact
        image="/art/hero-dossier.jpg"
        imagePosition="center 45%"
        kicker="The dossier"
        title="Beyond the"
        titleAccent="arcade"
        subtitle="What Other World Projex actually is: seven bounty episodes, one treasury, and a token that only ever gets scarcer."
        brand
      />

      {/* The story */}
      <Reveal>
        <section className="mt-12 grid md:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <div className="kicker pt-1.5">01 — The story</div>
          <div className="panel p-7 text-[0.95rem] text-fog leading-relaxed space-y-4">
            <p>
              Somewhere past the last block of the chain there is a vault carved
              into black marble, and inside it, an arcade. The frogs got there
              first. They run it like an old house: every cabinet is a{" "}
              <span className="text-frost">contract</span>, every contract names
              a target, and every target has a price on its head — paid in{" "}
              <span className="text-neon">$RIBBIT</span>.
            </p>
            <p>
              Token holders become bounty hunters. Play the cabinets, beat the
              targets, claim the rewards. The hunt is always open.
            </p>
          </div>
        </section>
      </Reveal>

      {/* House rules */}
      <Reveal>
        <section className="mt-6 grid md:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <div className="kicker pt-1.5">02 — House rules</div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              ["Burn to play", `${CLIENT_CONFIG.ribbitPerCredit} $RIBBIT buys one credit — burned on-chain, gone from supply forever. The arcade episodes are free.`],
              ["Provably fair", "Every table outcome derives from a seed the house commits to before you play. Rotate your seed and re-check every round yourself."],
              ["One treasury", "The house take splits 50% treasury · 30% bounty pools · 20% operations. Balances read live from Solana; every movement is published."],
              ["Escrowed bids", "Auction bids lock deposited $RIBBIT held by the treasury. Outbid funds release instantly; withdrawals queue for the treasury signer."],
            ].map(([title, desc]) => (
              <div key={title} className="panel panel-hover p-5">
                <div className="font-medium tracking-tight mb-1.5">{title}</div>
                <p className="text-fog text-[0.85rem] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* The episodes — contracts */}
      <Reveal>
        <section className="mt-6 grid md:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <div className="kicker pt-1.5">03 — The episodes</div>
          <div className="panel overflow-hidden">
            {EPISODES.map((e) => (
              <div key={e.ep} className="table-row ep-row">
                <span className="mono text-xs" style={{ color: "var(--text-dim)" }}>
                  {e.ep}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {e.href ? (
                      <Link href={e.href} className="font-medium tracking-tight hover:text-neon transition-colors">
                        {e.name}
                      </Link>
                    ) : (
                      <span className="font-medium tracking-tight">{e.name}</span>
                    )}
                    {e.href ? (
                      <span className="badge badge-live">
                        <span className="live-dot" /> live
                      </span>
                    ) : (
                      <span className="badge badge-urgent">soon</span>
                    )}
                  </div>
                  <p className="text-fog text-[0.82rem] mt-0.5">{e.brief}</p>
                </div>
                <div className="ep-row-meta">
                  <div className="text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                    Target · {e.target}
                  </div>
                  <div className="stat-number text-gold text-sm">{e.reward}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* The token */}
      <Reveal>
        <section className="mt-6 grid md:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <div className="kicker pt-1.5">04 — The token</div>
          <div className="panel p-7">
            <p className="text-fog text-[0.95rem] leading-relaxed mb-5 max-w-xl">
              $RIBBIT launched fair on pump.fun — no premine, no team allocation
              held by the treasury. It is the only currency the house accepts:
              burn it to play, bid it on lots, win it from bounty pools.
            </p>
            <div className="flex items-center gap-2 flex-wrap mb-5">
              <code
                className="mono text-xs rounded-md border px-3.5 py-2.5 inline-block break-all"
                style={{ borderColor: "var(--hairline-strong)", color: "var(--color-neon)" }}
              >
                {CLIENT_CONFIG.ribbitMint}
              </code>
              <CopyChip text={CLIENT_CONFIG.ribbitMint} />
            </div>
            <div className="flex flex-wrap gap-2.5">
              <a href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                pump.fun ↗
              </a>
              <a href={CLIENT_CONFIG.xUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                @OWProjex ↗
              </a>
              <Link href="/treasury" className="btn btn-ghost">
                The treasury
              </Link>
              <Link href="/fairness" className="btn btn-ghost">
                Fairness
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Fine print */}
      <Reveal>
        <section className="mt-6 grid md:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <div className="kicker pt-1.5">05 — Fine print</div>
          <div className="panel p-7 text-[0.85rem] leading-relaxed space-y-3" style={{ color: "var(--text-dim)" }}>
            <p>
              $RIBBIT is a memecoin. It is not a registered security and nothing
              on this site is investment advice. Do your own research before
              holding or transacting.
            </p>
            <p>
              Games are for entertainment. The house edge is published, the math
              is verifiable, and the outcome is still chance — never burn more
              than you can afford to lose. Real-money gaming may be restricted
              in your jurisdiction; you are responsible for your own compliance.
            </p>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
