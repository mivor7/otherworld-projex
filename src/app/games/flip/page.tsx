"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { celebrate } from "@/components/confetti";
import { usePractice } from "@/components/practice";
import { useClientSeed } from "@/components/use-client-seed";
import { FairCommit } from "@/components/fair-commit";

type FlipResult = {
  outcome: { landed: "frog" | "fly" };
  payout: number;
  win: boolean;
  credits: number;
  nonce: number;
  seedHash: string;
};

export default function FlipPage() {
  const { me, refresh } = useSession();
  const [side, setSide] = useState<"frog" | "fly">("frog");
  const [wager, setWager] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [landing, setLanding] = useState(false);
  const [rotation, setRotation] = useState(0);
  const turnsRef = useRef(0);
  const [result, setResult] = useState<FlipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const practice = usePractice();
  const { seed: clientSeed } = useClientSeed();

  const land = (data: FlipResult) => {
    // Hand off from the fast spin to a decelerating landing on the result
    // face — 4 extra revolutions, then reveal.
    setSpinning(false);
    setLanding(true);
    turnsRef.current += 4;
    setRotation(turnsRef.current * 360 + (data.outcome.landed === "fly" ? 180 : 0));
    setTimeout(async () => {
      setResult(data);
      setLanding(false);
      if (data.win) celebrate();
      if (!sandbox) await refresh();
    }, 1150);
  };

  const play = async () => {
    setSpinning(true);
    setError(null);
    setResult(null);

    if (sandbox) {
      // Practice table: same odds, local coin, zero $RIBBIT. Bottomless
      // bankroll — top up first so the flip can never be blocked.
      practice.ensure(wager);
      const landed = Math.random() < 0.5 ? "frog" : "fly";
      const win = landed === side;
      const payout = win ? Math.floor(wager * 1.92) : 0;
      practice.adjust(-wager + payout);
      setTimeout(
        () => land({ outcome: { landed }, payout, win, credits: 0, nonce: 0, seedHash: "" }),
        700
      );
      return;
    }

    const res = await fetch("/api/games/flip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, wager, clientSeed }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSpinning(false);
      setError(data.error ?? "Something went wrong");
      return;
    }
    land(data);
  };
  const busy = spinning || landing;
  const balance = sandbox ? practice.credits : (me.credits ?? 0);
  const canPlay = sandbox || me.signedIn;

  return (
    <div className="pt-10 max-w-2xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        kicker="Wing I — table 01"
        title="Frog Flip"
        desc="Frog or fly, even odds, 1.92× payout on a win — 4% published edge."
      />

      <div className="panel panel-glow p-8 text-center">
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
        <div className="coin-scene mb-6">
          <div
            className={`coin ${spinning ? "coin--spin" : ""}`}
            style={spinning ? undefined : { transform: `rotateY(${rotation}deg)` }}
          >
            <div className="coin-face coin-face--front">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/art/ribbit-mark.jpg" alt="Frog side" className="coin-face-art" />
              <span className="coin-face-sheen" aria-hidden />
              <span className="coin-face-ring" aria-hidden />
              <span className="coin-face-badge" aria-hidden>🐸</span>
            </div>
            <div className="coin-face coin-face--back">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/art/logo.png" alt="Fly side" className="coin-face-art" />
              <span className="coin-face-sheen" aria-hidden />
              <span className="coin-face-ring" aria-hidden />
              <span className="coin-face-badge" aria-hidden>🪰</span>
            </div>
          </div>
        </div>

        {result && !busy && (
          <div className={`stat-number text-2xl mb-4 ${result.win ? "neon-text" : "text-danger"}`}>
            {result.win ? `+${result.payout} credits!` : "The pond takes it."}
          </div>
        )}

        <div className="flex justify-center gap-3 mb-6">
          {(["frog", "fly"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`btn text-lg px-8 ${side === s ? "btn-primary" : "btn-ghost"}`}
            >
              {s === "frog" ? "🐸 Frog" : "🪰 Fly"}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          <label className="text-sm text-fog">Wager</label>
          <input
            type="number"
            className="input max-w-28 text-center"
            min={1}
            max={1000}
            value={wager}
            onChange={(e) => setWager(Math.max(1, Math.floor(Number(e.target.value))))}
          />
          <span className="text-sm text-fog">
            credits → win <span className="text-neon">{Math.floor(wager * 1.92)}</span>
          </span>
        </div>

        <button
          className="btn btn-primary text-lg px-12 py-3"
          onClick={play}
          disabled={busy || !canPlay || (!sandbox && balance < wager)}
        >
          {busy ? "Flipping…" : sandbox ? "Flip (practice)" : "Flip it"}
        </button>

        {!sandbox && !me.signedIn && (
          <p className="text-fog text-sm mt-4">
            Sign in with your wallet to play — or try the sandbox above.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get credits →
            </Link>
          </p>
        )}
        {!sandbox && me.signedIn && (me.credits ?? 0) < wager && (
          <p className="text-fog text-sm mt-4">
            Not enough credits.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Burn $RIBBIT for more →
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
    </div>
  );
}
