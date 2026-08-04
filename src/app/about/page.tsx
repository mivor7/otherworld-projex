import Link from "next/link";
import { PageHero } from "@/components/hero";
import { Reveal } from "@/components/reveal";
import { CopyChip } from "@/components/copy-chip";
import { CLIENT_CONFIG } from "@/lib/client-config";
import { prisma } from "@/lib/db";
import { fromRaw } from "@/lib/config";
import { houseConfig } from "@/lib/settings";

export const metadata = {
  title: "About — Other World Projex",
  description: "The full dossier: the story, the house rules, the episodes, the treasury.",
};

export const dynamic = "force-dynamic";

const EPISODES = [
  {
    ep: "EP 01",
    name: "Fraud Frog Exterminator",
    target: "The Fraud Frog Kingpin",
    brief: "Hunt the copy cats. Stop the fraud frogs before they reach your base.",
    reward: "pool TBA",
    href: null,
  },
  {
    ep: "EP 02",
    name: "Frogris",
    target: "The Stack-Smuggler",
    brief: "Stack the falling frogs. Clear the lines. Don't top out.",
    game: "frogris",
    href: "/games/frogris",
  },
  {
    ep: "EP 03",
    name: "Pac-Frog",
    target: "The Maze Ghost Boss",
    brief: "Eat the pellets. Dodge the ghosts. Survive the maze.",
    reward: "pool TBA",
    href: null,
  },
  {
    ep: "EP 04",
    name: "Worm Frog",
    target: "The Tail-Bite Serpent",
    brief: "Slither, grow, and don't bite your own tail.",
    game: "worm",
    href: "/games/worm",
  },
  {
    ep: "EP 05",
    name: "Hopper",
    target: "The Highway Bandit",
    brief: "Hop the lanes, dodge the traffic, and reach the far side alive.",
    game: "hopper",
    href: "/games/hopper",
  },
  {
    ep: "EP 06",
    name: "Blackjack",
    target: "The House Toad",
    brief: "Beat the dealer. Hold the line. Bank the RIBBIT.",
    game: "blackjack",
    href: "/games/blackjack",
  },
  {
    ep: "Table",
    name: "Frog Flip",
    target: "Double or Nothing",
    brief: "Call the flip, ride the streak, cash out before it cracks.",
    game: "flip",
    href: "/games/flip",
  },
  {
    ep: "Table",
    name: "Pond Dice",
    target: "The High Roller",
    brief: "Set your line and roll under it — steeper line, bigger pay.",
    game: "dice",
    href: "/games/dice",
  },
  {
    ep: "EP 07",
    name: "Poker Face",
    target: "The Swamp Bot Ring",
    brief: "Outplay three swamp bots. Win the pot. Bank the RIBBIT.",
    reward: "pool TBA",
    href: null,
  },
];

const ARCADE = new Set(["frogris", "worm", "hopper"]);

export default async function AboutPage() {
  // Rewards shown here are the LIVE open pools — never a frozen claim.
  const [cfg, openBounties] = await Promise.all([
    houseConfig(),
    prisma.bounty.findMany({
      where: { status: "open", game: { not: null } },
      select: { game: true, prizeRibbit: true },
      orderBy: { prizeRibbit: "desc" },
    }),
  ]);
  const poolByGame = new Map<string, bigint>();
  for (const b of openBounties) {
    if (b.game && !poolByGame.has(b.game)) poolByGame.set(b.game, b.prizeRibbit);
  }
  const rewardFor = (e: (typeof EPISODES)[number]): string => {
    const game = "game" in e ? (e as { game?: string }).game : undefined;
    const prize = game ? poolByGame.get(game) : undefined;
    if (!prize) return "reward" in e ? ((e as { reward?: string }).reward ?? "pool TBA") : "pool TBA";
    const amount = Math.round(fromRaw(prize)).toLocaleString();
    return ARCADE.has(game!) ? `${amount} $RIBBIT weekly pool` : `${amount} $RIBBIT unlock pool`;
  };

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
              ["Buy chips", `${cfg.ribbitPerCredit} $RIBBIT buys one table chip in a single on-chain transaction — ${Math.round(cfg.buyBurnShare * 100)}% burned from supply forever, the rest funds the house that pays the prizes. The arcade episodes are free.`],
              ["Provably fair", "Every table outcome derives from a seed the house commits to before you play. Rotate your seed and re-check every round yourself."],
              ["Pools that pay themselves", "Every bounty posts a fixed $RIBBIT prize with an unlock meter derived from it. When the table's pot meter fills, all eligible winners are paid pro-rata — automatically."],
              ["Escrowed bids", "Auction bids lock deposited $RIBBIT held by the treasury. Outbid funds release instantly; withdrawals queue for the payout signer."],
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
              // key must be unique — two episodes share ep "Table", and duplicate
              // keys corrupt hydration of this streamed list (rows detached to
              // the page bottom on slow connections).
              <div key={`${e.ep}-${e.name}`} className="table-row ep-row">
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
                  <div className="stat-number text-gold text-sm">{rewardFor(e)}</div>
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
              it buys your chips (part of every purchase is burned at the
              mint), backs your bids, and pays out of every bounty pool.
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
              {CLIENT_CONFIG.meteoraUrl && (
                <a href={CLIENT_CONFIG.meteoraUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  Meteora pool ↗
                </a>
              )}
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
