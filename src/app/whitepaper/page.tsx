import type { ReactNode } from "react";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { CONFIG } from "@/lib/config";

export const metadata = {
  title: "Whitepaper — Other World Projex",
  description:
    "Other World Projex is an open $OWP arcade. The team does not trade the house wallet to move the market. The only cut on Frog Flip and Pond Dice is a 4% house edge.",
};

function Section({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="mt-6 grid md:grid-cols-[240px_minmax(0,1fr)] gap-6">
        <div className="kicker pt-1.5">{kicker}</div>
        <div className="panel p-7 text-[0.95rem] text-fog leading-relaxed space-y-4">
          {children}
        </div>
      </section>
    </Reveal>
  );
}

export default function WhitepaperPage() {
  const mint = CONFIG.ribbitMint;
  const treasury = CONFIG.treasuryWallet;

  return (
    <div className="pt-10 pb-4">
      <div className="kicker mb-2">Whitepaper</div>
      <h1 className="text-[1.8rem] sm:text-[2.2rem] mb-3">Other World Projex</h1>
      <p className="text-fog text-[1.02rem] leading-relaxed max-w-2xl mb-2">
        An open bounty arcade on Solana. People buy and sell $OWP. Players win
        or lose it on the games. The team does not try to control that market.
      </p>
      <p className="text-xs mb-8" style={{ color: "var(--text-dim)" }}>
        This paper describes the app as it runs. It is not an offer of
        securities and it promises no return. The same text is in the public
        repository as <span className="mono">WHITEPAPER.md</span>.
      </p>

      <Section kicker="The creator">
        <p>
          mivor7 created Other World Projex and wrote this software. This
          site, www.otherworldprojex.xyz, is the original. The only token it
          uses is $OWP.
        </p>
        <p>
          The source is public so the rules can be read. That publication is
          not a license. No right is granted to copy the app, to use the name
          Other World Projex, or to launch a token with it. All rights
          reserved.
        </p>
        <p>
          otherworldprojex.io and otherworldprojex.com use this name and this
          codebase. mivor7 did not authorize that and does not operate those
          sites. Tokens they issue, including any coin they call RIBBIT or
          OWX, are not $OWP. The same is true of any other site or coin that
          presents itself as Other World Projex.
        </p>
      </Section>

      <Section kicker="01 — The market">
        <p>
          The team does not trade the house wallet to push the $OWP price up
          or down. Holders buy and sell on the open market, and that market
          sets the price. A win or a loss on a game is the player&apos;s.
        </p>
        <p>
          The house wallet holds deposits so the app can pay withdrawals and
          prizes. Those payments return a player&apos;s own balance. They are
          not orders placed to move the chart, and the wallet is not a trading
          book.
        </p>
        <p>
          On Frog Flip and Pond Dice the only cut is a 4% house edge. It is
          applied to the payout multiplier, never to the roll. A winning flip
          pays 1.92× the wager (2 × 0.96). Dice pays (100 ÷ target) × 0.96.
          By default, half of that edge fills the bounty pot and is paid back
          to eligible players. The live rate is on the{" "}
          <Link href="/treasury" className="text-frost underline">
            treasury
          </Link>{" "}
          page.
        </p>
        <p>
          Blackjack uses its published rules — a natural pays 3:2, the dealer
          stands on every 17 — and does not add the 4% on top. Hopper, Frogris,
          and Worm Frog are free. They take no wager.
        </p>
        <p>
          The rules above are the code in the public repository,{" "}
          <a
            href="https://github.com/mivor7/otherworld-projex"
            className="text-frost underline"
            target="_blank"
            rel="noreferrer"
          >
            mivor7/otherworld-projex
          </a>
          , published by mivor7.
        </p>
      </Section>

      <Section kicker="02 — $OWP">
        <p>
          $OWP is the balance of the house. There is no second chip. Deposit
          it, play, bid, hunt bounties, and withdraw the same token.
        </p>
        <p>
          The published mint is{" "}
          <span className="mono text-neon break-all">{mint}</span>. The app
          reads that account on Solana. Until the account exists, deposits,
          website buys, and automatic payouts stay closed. The site does not
          invent a price.
        </p>
        <p>
          Decimals default to 6 and are read from the mint when it exists. The
          token program, classic SPL or Token-2022, is read from the mint
          account owner. It is not hardcoded.
        </p>
        <p>
          $OWP is a memecoin. It is not a registered security. Nothing here is
          investment advice, a yield, a buyback, or a promise that the price
          rises.
        </p>
      </Section>

      <Section kicker="03 — One wallet">
        <p>
          One wallet is the admin, the treasury, and the payout signer. The
          private key is not on the website. A worker elsewhere pays the queue.
        </p>
        {treasury ? (
          <p>
            The public treasury address is{" "}
            <span className="mono text-neon break-all">{treasury}</span>. Live
            balances are on{" "}
            <Link href="/treasury" className="text-frost underline">
              /treasury
            </Link>
            .
          </p>
        ) : (
          <p>
            The public treasury address is shown on{" "}
            <Link href="/treasury" className="text-frost underline">
              /treasury
            </Link>
            .
          </p>
        )}
        <p>
          Deposited $OWP sits in that wallet until it is withdrawn or paid out
          as a prize. An Anchor program in the repository can custody SOL, with
          a multisig admin and a daily cap. It does not hold $OWP, and it has
          not been audited. $OWP payouts are signed by the house wallet.
        </p>
      </Section>

      <Section kicker="04 — Deposit and withdraw">
        <p>
          A deposit is a transfer of $OWP to the house wallet. The server
          checks the transaction on Solana, then credits the in-app balance.
          Tables play in whole tokens from that balance.
        </p>
        <p>
          A withdrawal queues a payment of the available balance back to the
          same wallet. The payout worker sends it. Rejecting a game result is
          not how this works: the player asked for their own balance, and the
          house sends it.
        </p>
      </Section>

      <Section kicker="05 — Buying">
        <p>
          The website can sell $OWP from the house at the live pump.fun spot.
          The visitor pays SOL from their own wallet. The house sends $OWP to
          that same wallet. The buy does not credit the in-app balance, and
          the team does not pick a private price.
        </p>
        <p>
          While the coin is on the bonding curve, the payout is one integer
          division in the house&apos;s favor: lamports paid, times the curve&apos;s
          virtual token reserve, divided by its virtual SOL reserve. After the
          curve migrates, the price is the PumpSwap price. If there is no
          price, the buy is refused. A buy is 0.01 to 50 SOL. If the house
          cannot cover the send, the buy is refused.
        </p>
        <p>
          Selling $OWP is something the holder does on the open market. The
          site does not run a sell book, and it does not buy the chart up.
        </p>
      </Section>

      <Section kicker="06 — Games">
        <p>
          Every round is provably fair. The server publishes the SHA-256 hash
          of a seed before play. The outcome is HMAC-SHA256 of that seed over
          the player&apos;s client seed and a nonce. When the player rotates the
          seed, the old seed is revealed and past rounds can be recomputed at{" "}
          <Link href="/fairness" className="text-frost underline">
            /fairness
          </Link>
          . Blackjack&apos;s whole deck is derived the same way before the first
          card.
        </p>
        <p>
          Frog Flip is a coin. Pond Dice is roll-under. Blackjack is the table
          above. Hopper, Frogris, and Worm Frog are the free arcade. Prize
          boards rank wallets that have deposited enough $OWP. The current
          minimums are shown on the games and the leaderboard.
        </p>
      </Section>

      <Section kicker="07 — Auctions and bounties">
        <p>
          The auction house takes bids in $OWP from the in-app balance. A bid
          is escrowed. An outbid is refunded. A bid in the last two minutes
          extends the close by two minutes. Community listings go through
          review.
        </p>
        <p>
          Bounties pay a fixed $OWP prize. One bounty is open per game. Table
          pots fill from the bounty&apos;s share of the house edge — half of the
          4%, by default, which is 0.02 $OWP added to the pot per 1 $OWP
          wagered. When the pot reaches the prize, every eligible winner is
          paid pro-rata, then the next round opens. Free arcade bounties pay
          on a weekly clock. The house can declare a seed as a head start. That
          seed is its own money, not a trade.
        </p>
      </Section>

      <Section kicker="08 — The waitlist">
        <p>
          The airdrop waitlist records wallets that hold $OWP on-chain. Joining
          does not lock or transfer those tokens. Once the list reaches its
          goal, the app treats the airdrop as guaranteed. The amount is not
          set in this paper and is not set on the waitlist page. There is no
          vesting schedule in the app.
        </p>
      </Section>

      <Section kicker="09 — What this is not">
        <p>
          There is no staking pool. There is no liquidity pool run by the
          house. The team does not market-make. The source is public so those
          claims can be checked.
        </p>
        <p>
          Games are entertainment. The edge is real, the outcome is chance, and
          you can lose the $OWP you wager. Do not spend more than you can
          afford to lose. Real-money play may be restricted where you live.
          You are responsible for your own compliance.
        </p>
      </Section>
    </div>
  );
}
