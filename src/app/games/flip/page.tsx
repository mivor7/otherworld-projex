"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { celebrate } from "@/components/confetti";
import { usePractice } from "@/components/practice";
import { randomClientSeed, useClientSeed } from "@/components/use-client-seed";
import { useHouseConfig } from "@/components/use-house-config";
import { FairCommit } from "@/components/fair-commit";
import { BountyStandings } from "@/components/bounty-standings";
import { GameBountyStrip } from "@/components/game-bounty-strip";
import { FirstVisitHint } from "@/components/first-visit-hint";

type FlipResult = {
  outcome: { landed: "frog" | "fly" };
  payout: number;
  win: boolean;
  credits: number;
  nonce: number;
  seedHash: string;
};

export default function FlipPage() {
  const { me, refresh, loading } = useSession();
  const [side, setSide] = useState<"frog" | "fly">("frog");
  const [wager, setWager] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [landing, setLanding] = useState(false);
  const [rotation, setRotation] = useState(0);
  const turnsRef = useRef(0);
  const [result, setResult] = useState<FlipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  // Guests default to the playable Sandbox (Live table needs a signed-in
  // wallet). ONCE, when the session first resolves — never again, so a
  // transient session blip mid-play can't yank a live player into practice,
  // and a manual toggle is never overridden.
  const sandboxDefaulted = useRef(false);
  useEffect(() => {
    if (loading || sandboxDefaulted.current) return;
    sandboxDefaulted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!me.signedIn) setSandbox(true);
  }, [loading, me.signedIn]);
  // Double-or-nothing streak: after a win you may cash the pot or re-flip it.
  const [streak, setStreak] = useState(0);
  const [pot, setPot] = useState(0); // winnings riding, after a win
  const [pendingWin, setPendingWin] = useState(false); // awaiting cash-out / continue
  const practice = usePractice();
  const { seed: clientSeed } = useClientSeed();
  const house = useHouseConfig();
  const flipMult = 2 * (1 - house.houseEdge); // live house edge

  const land = (data: FlipResult) => {
    setSpinning(false);
    setLanding(true);
    turnsRef.current += 4;
    setRotation(turnsRef.current * 360 + (data.outcome.landed === "fly" ? 180 : 0));
    setTimeout(async () => {
      setResult(data);
      setLanding(false);
      if (data.win) {
        celebrate();
        setStreak((s) => s + 1);
        setPot(data.payout);
        setPendingWin(true);
      } else {
        setStreak(0);
        setPot(0);
        setPendingWin(false);
      }
      if (!sandbox) {
        await refresh();
        window.dispatchEvent(new Event("owp:round")); // live-update the bounty meter
      }
    }, 1150);
  };

  const play = async (amount: number) => {
    if (amount < house.minWager) return;
    setSpinning(true);
    setError(null);
    setResult(null);
    setPendingWin(false);

    if (sandbox) {
      practice.ensure(amount);
      const landed = Math.random() < 0.5 ? "frog" : "fly";
      const win = landed === side;
      const payout = win ? Math.floor(amount * flipMult) : 0;
      practice.adjust(-amount + payout);
      setTimeout(() => land({ outcome: { landed }, payout, win, credits: 0, nonce: 0, seedHash: "" }), 700);
      return;
    }

    try {
      const res = await fetch("/api/games/flip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, wager: amount, clientSeed: clientSeed || randomClientSeed() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSpinning(false);
        setError(data.error ?? "Something went wrong");
        return;
      }
      land(data);
    } catch {
      setSpinning(false);
      setError("Connection hiccup — check your balance before retrying.");
      await refresh().catch(() => {});
    }
  };

  const cashOut = () => {
    setPendingWin(false);
    setStreak(0);
    setPot(0);
    setResult(null);
  };

  const busy = spinning || landing;
  const balance = sandbox ? practice.credits : me.credits ?? 0;
  const canPlay = sandbox || me.signedIn;
  const potNext = Math.floor(pot * flipMult);
  const canDouble =
    pot >= house.minWager &&
    pot <= house.maxWager &&
    (sandbox || (balance >= pot && !house.gamesPaused));

  return (
    <div className="pt-6 max-w-2xl lg:max-w-5xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        compact
        kicker="Wing I — table 01"
        title="Frog Flip"
        desc={`Call frog or fly, even odds, ${flipMult.toFixed(2)}× a win — then ride the streak or cash out. ${Math.round(house.houseEdge * 100)}% published edge.`}
      />

      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      <div className="lg:hidden">
        <GameBountyStrip game="flip" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="panel panel-glow game-stage p-5 sm:p-6 text-center">
          {!sandbox && house.gamesPaused && (
            <div className="mb-4">
              <Notice kind="info">Live tables are paused by the house right now — the sandbox above still works.</Notice>
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <div className="chips">
              <button className={`chip ${!sandbox ? "active" : ""}`} aria-pressed={!sandbox} onClick={() => setSandbox(false)}>
                Live table
              </button>
              <button className={`chip ${sandbox ? "active" : ""}`} aria-pressed={sandbox} onClick={() => setSandbox(true)}>
                Sandbox
              </button>
            </div>
            <div className="text-right">
              <div className="kicker !text-[0.6rem]">{sandbox ? "Practice credits" : "Credits"}</div>
              <div className="stat-number text-neon">{canPlay ? balance : "—"}</div>
            </div>
          </div>

          {sandbox && (
            <div className="mb-5 text-left">
              <Notice kind="info">
                Sandbox — no wallet needed, no $RIBBIT involved. Same odds,
                bottomless practice bankroll: play as long as you like.
              </Notice>
            </div>
          )}

          {/* Streak ladder — lights up as the run climbs */}
          {(streak > 0 || pendingWin) && (
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i < streak ? "1.6rem" : "0.7rem",
                    background:
                      i < streak
                        ? "linear-gradient(90deg, oklch(0.8 0.1 85), oklch(0.82 0.11 150))"
                        : "var(--hairline-strong)",
                  }}
                />
              ))}
              <span className="text-xs ml-1.5 text-gold stat-number">🔥 {streak}×</span>
            </div>
          )}

          <div className="coin-stage mb-4">
            <div className="coin-scene">
              <div
                className={`coin ${spinning ? "coin--spin" : ""}`}
                style={spinning ? undefined : { transform: `rotateY(${rotation}deg)` }}
              >
                <div className="coin-face coin-face--front">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/art/owp_coin_frog.png" alt="Frog side" className="coin-face-art" />
                  <span className="coin-face-sheen" aria-hidden />
                </div>
                <div className="coin-face coin-face--back">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/art/owp_coin_fly.png" alt="Fly side" className="coin-face-art" />
                  <span className="coin-face-sheen" aria-hidden />
                </div>
              </div>
            </div>
            <div className="coin-cast" aria-hidden />
          </div>

          {/* Fixed-height slot so the result never shoves the controls. */}
          <div className="min-h-[2.25rem] mb-4 flex items-center justify-center">
            {result && !busy && (
              <span
                key={result.nonce + "-" + streak}
                className={`stat-number text-2xl result-pop ${result.win ? "neon-text" : "text-danger"}`}
              >
                {result.win
                  ? streak > 1
                    ? `🔥 ${streak} in a row — +${result.payout}!`
                    : `+${result.payout} credits!`
                  : "The pond takes it."}
              </span>
            )}
          </div>

          {/* Pick a side (before every flip) */}
          <div className="flex justify-center gap-3 mb-6">
            {(["frog", "fly"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                disabled={busy}
                className={`btn text-lg px-8 ${side === s ? "btn-primary" : "btn-ghost"}`}
              >
                {s === "frog" ? "🐸 Frog" : "🪰 Fly"}
              </button>
            ))}
          </div>

          {pendingWin && !busy ? (
            /* Won — bank the pot or risk it all on the next call */
            <div className="flex flex-col items-center gap-3 mb-2">
              <div className="text-sm text-fog">
                Pot riding: <span className="stat-number text-gold">{pot}</span> credits
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button className="btn btn-ghost text-lg px-8 py-3" onClick={cashOut}>
                  Cash out {pot}
                </button>
                <button
                  className="btn btn-primary text-lg px-8 py-3"
                  onClick={() => play(pot)}
                  disabled={!canDouble}
                >
                  Double or nothing → {potNext}
                </button>
              </div>
              {pot > house.maxWager && (
                <p className="text-xs text-fog">
                  Table max ({house.maxWager.toLocaleString()}) reached — cash out to keep it.
                </p>
              )}
            </div>
          ) : (
            /* Fresh run — set the wager and flip */
            <>
              <div className="flex items-center justify-center gap-3 mb-6">
                <label className="text-sm text-fog">Wager</label>
                <input
                  type="number"
                  className="input max-w-28 text-center"
                  min={house.minWager}
                  max={house.maxWager}
                  aria-label="Wager in credits"
                  value={wager || ""}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    setWager(Number.isFinite(n) && n > 0 ? Math.min(house.maxWager, n) : 0);
                  }}
                />
                <span className="text-sm text-fog">
                  credits → win <span className="text-neon">{Math.floor(wager * flipMult)}</span>
                </span>
              </div>

              <button
                className="btn btn-primary text-lg px-12 py-3"
                onClick={() => play(wager)}
                disabled={busy || !canPlay || wager < house.minWager || (!sandbox && (house.gamesPaused || balance < wager))}
              >
                {busy ? "Flipping…" : sandbox ? "Flip (practice)" : "Flip it"}
              </button>
            </>
          )}

          {!sandbox && !me.signedIn && (
            <p className="text-fog text-sm mt-4">
              Sign in with your wallet to play — or try the sandbox above.{" "}
              <Link href="/games" className="text-neon hover:underline">
                Get credits →
              </Link>
            </p>
          )}
          {!sandbox && me.signedIn && !pendingWin && (me.credits ?? 0) < wager && (
            <p className="text-fog text-sm mt-4">
              Not enough credits.{" "}
              <Link href="/games" className="text-neon hover:underline">
                Get more credits →
              </Link>
            </p>
          )}
          {error && (
            <div className="mt-4">
              <Notice kind="err">{error}</Notice>
            </div>
          )}

          {result && !sandbox && result.seedHash && (
            <p className="text-xs text-fog/70 mt-6 break-all">
              round nonce {result.nonce} · seed hash {result.seedHash.slice(0, 16)}… ·{" "}
              <Link href="/fairness" className="text-neon hover:underline">
                verify
              </Link>
            </p>
          )}
          {result && sandbox && (
            <p className="text-xs mt-6" style={{ color: "var(--text-dim)" }}>
              practice round — nothing wagered, nothing won
            </p>
          )}
          {!sandbox && <FairCommit clientSeed={clientSeed} />}
        </div>

        <BountyStandings game="flip" />
      </div>
    </div>
  );
}
