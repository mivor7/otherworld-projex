"use client";

import Link from "next/link";
import { useState } from "react";
import { playFlip } from "@/lib/games";
import { useHouseConfig } from "@/components/use-house-config";
import { ShareOnX } from "@/components/share-x";

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WelcomeMagnet({
  waitlistCount,
  waitlistGoal,
  minHoldRibbit,
  openPrize,
}: {
  waitlistCount: number;
  waitlistGoal: number;
  minHoldRibbit: number;
  openPrize: number;
}) {
  const house = useHouseConfig();
  const [side, setSide] = useState<"frog" | "fly">("frog");
  const [spinning, setSpinning] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [practiceBank, setPracticeBank] = useState(1_000);
  const [lastResult, setLastResult] = useState<{
    win: boolean;
    landed: "frog" | "fly";
    payout: number;
  } | null>(null);

  const wager = 100;
  const mult = (2 * (1 - house.houseEdge)).toFixed(2);
  const spotsLeft = Math.max(0, waitlistGoal - waitlistCount);
  const fillPct = Math.min(100, Math.round((waitlistCount / Math.max(1, waitlistGoal)) * 100));

  const flipNow = (picked: "frog" | "fly") => {
    if (spinning) return;
    setSide(picked);
    setSpinning(true);
    const nextNonce = nonce + 1;
    setNonce(nextNonce);
    const out = playFlip(
      randomHex(16),
      "homepage-instant-preview",
      nextNonce,
      picked,
      wager,
      house.houseEdge
    );
    setTimeout(() => {
      setSpinning(false);
      setLastResult({
        win: out.win,
        landed: out.landed,
        payout: out.payout,
      });
      setPracticeBank((b) => Math.max(100, b - wager + out.payout));
      if (out.win) {
        setStreak((s) => {
          const next = s + 1;
          setBestStreak((bs) => Math.max(bs, next));
          return next;
        });
      } else {
        setStreak(0);
      }
    }, 380);
  };

  return (
    <section className="mt-10 grid lg:grid-cols-2 gap-4">
      {/* Left: 0-friction instant playable hook right on the homepage */}
      <div className="panel panel-glow p-5 sm:p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span className="kicker">Try the house in 1 click · No wallet needed</span>
            <span className="badge badge-live !text-[0.6rem]">
              <span className="live-dot" /> {mult}× instant flip
            </span>
          </div>
          <h2 className="text-[1.3rem] mb-1.5">Test your luck before you deposit</h2>
          <p className="text-fog text-[0.85rem] leading-relaxed mb-4">
            Call <span className="text-frost font-medium">Frog</span> or{" "}
            <span className="text-frost font-medium">Fly</span> with a 100 $OWP
            practice stake. Same provably-fair math as the live tables.
          </p>

          <div
            className="rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
              background: "oklch(0.11 0.012 160 / 0.75)",
              border: "1px solid var(--hairline-strong)",
            }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-14 h-14 rounded-full overflow-hidden shrink-0 border ${
                  spinning ? "coin-spinning" : ""
                }`}
                style={{
                  borderColor: "oklch(0.78 0.11 150 / 0.4)",
                  boxShadow: "0 6px 20px oklch(0 0 0 / 0.45)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    (lastResult?.landed ?? side) === "frog"
                      ? "/art/owp_coin_heads.png"
                      : "/art/owp_coin_tails.png"
                  }
                  alt="OWP Coin"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                {spinning ? (
                  <div className="stat-number text-neon text-base">Flipping…</div>
                ) : lastResult ? (
                  <div
                    className={`stat-number text-base ${
                      lastResult.win ? "text-neon" : "text-danger"
                    }`}
                  >
                    {lastResult.win
                      ? `Hit ${lastResult.landed.toUpperCase()}! +${lastResult.payout} $OWP`
                      : `Landed ${lastResult.landed.toUpperCase()} · try again`}
                  </div>
                ) : (
                  <div className="text-sm text-frost font-medium">
                    Pick a side to flip 100 practice $OWP
                  </div>
                )}
                <div className="text-xs text-fog mt-0.5">
                  Practice stack:{" "}
                  <span className="mono text-neon">{practiceBank.toLocaleString()}</span>{" "}
                  · Streak: <span className="mono text-gold">{streak}</span>
                  {bestStreak > 1 ? ` (best ${bestStreak})` : ""}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-center">
              <button
                type="button"
                disabled={spinning}
                onClick={() => flipNow("frog")}
                className="btn btn-primary !py-2 !px-4 flex-1 sm:flex-initial"
              >
                Flip Frog
              </button>
              <button
                type="button"
                disabled={spinning}
                onClick={() => flipNow("fly")}
                className="btn btn-ghost !py-2 !px-4 flex-1 sm:flex-initial"
              >
                Flip Fly
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <a href="#buy" className="btn btn-primary !text-xs !py-1.5 !px-3">
              Buy real $OWP ↓
            </a>
            <Link href="/games/flip" className="btn btn-ghost !text-xs !py-1.5 !px-3">
              Open live table →
            </Link>
          </div>
          {lastResult?.win && (
            <ShareOnX
              label="Flex win on X"
              path="/games/flip"
              text={`Just hit ${lastResult.landed.toUpperCase()} on Frog Flip (${mult}x)${
                streak > 1 ? ` — ${streak} win streak` : ""
              } at Other World Projex! Provably-fair Solana arcade & live $OWP bounties:`}
            />
          )}
        </div>
      </div>

      {/* Right: Airdrop Waitlist + Referral Magnet */}
      <div className="panel panel-glow p-5 sm:p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span className="kicker">Holder Airdrop & Referral Race</span>
            <span className="badge badge-gold !text-[0.6rem]">
              {spotsLeft.toLocaleString()} of {waitlistGoal.toLocaleString()} spots left
            </span>
          </div>
          <h2 className="text-[1.3rem] mb-1.5">
            Claim your Airdrop spot &amp; recruit hunters
          </h2>
          <p className="text-fog text-[0.85rem] leading-relaxed mb-4">
            The first <span className="text-frost font-medium">{waitlistGoal.toLocaleString()}</span>{" "}
            wallets holding{" "}
            <span className="text-neon font-medium">
              {minHoldRibbit.toLocaleString()} $OWP
            </span>{" "}
            lock in an early-holder airdrop place. Nothing leaves your wallet — and
            every holder you refer climbs you up the recruiter board.
          </p>

          <div
            className="rounded-xl p-4 mb-4"
            style={{
              background: "oklch(0.11 0.012 160 / 0.75)",
              border: "1px solid var(--hairline-strong)",
            }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="text-xs text-fog">
                Waitlist capacity:{" "}
                <span className="stat-number text-neon text-sm">
                  {waitlistCount.toLocaleString()}
                </span>{" "}
                / {waitlistGoal.toLocaleString()} claimed
              </div>
              <span className="mono text-xs text-gold">{fillPct}% full</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden mb-3"
              style={{ background: "oklch(1 0 0 / 0.07)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(4, fillPct)}%`,
                  background:
                    "linear-gradient(90deg, var(--color-neon), oklch(0.82 0.14 85))",
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div>
                <div className="stat-number text-neon text-sm">
                  {minHoldRibbit.toLocaleString()}
                </div>
                <div className="kicker !text-[0.55rem]">$OWP to qualify</div>
              </div>
              <div>
                <div className="stat-number text-gold text-sm">
                  {openPrize > 0
                    ? `${openPrize.toLocaleString(undefined, { maximumFractionDigits: 0 })} $OWP`
                    : "Live"}
                </div>
                <div className="kicker !text-[0.55rem]">Open bounties</div>
              </div>
              <div>
                <div className="stat-number text-frost text-sm">100%</div>
                <div className="kicker !text-[0.55rem]">Self-custody hold</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/waitlist" className="btn btn-primary !text-xs !py-1.5 !px-3">
              Claim Airdrop spot →
            </Link>
            <a href="#buy" className="btn btn-ghost !text-xs !py-1.5 !px-3">
              Get {minHoldRibbit.toLocaleString()} $OWP ↓
            </a>
          </div>
          <ShareOnX
            label="Share Airdrop on X"
            path="/waitlist"
            text={`Other World Projex ($OWP) early-holder airdrop waitlist is open on Solana — ${waitlistCount}/${waitlistGoal} spots claimed! Hold ${minHoldRibbit.toLocaleString()} $OWP, play provably-fair games & hunt live bounties:`}
          />
        </div>
      </div>
    </section>
  );
}
