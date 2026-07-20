"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
import { PLINKO_ROWS, plinkoTable } from "@/lib/client-config";

type PlinkoResult = {
  outcome: { path: number[]; bucket: number; rows: number; mult: number; table: number[] };
  payout: number;
  win: boolean;
  wager: number;
  credits: number;
  nonce?: number;
  seedHash?: string;
};

const rows = PLINKO_ROWS;

// The row-by-row screen positions the token visits, in the same coordinate
// system as the pegs — start centred, ±half a gap per row, land on its bucket.
function tokenPositions(path: number[]) {
  const pos: { left: number; top: number }[] = [];
  let x = 0;
  for (let i = 0; i <= rows; i++) {
    pos.push({ left: ((x + rows / 2) / rows) * 100, top: (i / rows) * 100 });
    if (i < rows) x += path[i] ? 0.5 : -0.5;
  }
  return pos;
}

export default function PlinkoPage() {
  const { me, refresh } = useSession();
  const [wager, setWager] = useState(5);
  const [dropping, setDropping] = useState(false);
  const [result, setResult] = useState<PlinkoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [token, setToken] = useState<{ left: number; top: number } | null>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const practice = usePractice();
  const { seed: clientSeed } = useClientSeed();
  const house = useHouseConfig();
  const table = plinkoTable(house.houseEdge); // multipliers, house edge baked in

  const animate = (path: number[], done: () => void) => {
    const positions = tokenPositions(path);
    let i = 0;
    setLanded(null);
    setToken(positions[0]);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      i++;
      if (i >= positions.length) {
        if (timer.current) clearInterval(timer.current);
        done();
        return;
      }
      setToken(positions[i]);
    }, 95);
  };

  const play = async () => {
    setDropping(true);
    setError(null);
    setResult(null);

    if (sandbox) {
      practice.ensure(wager);
      const path: number[] = Array.from({ length: rows }, () => (Math.random() < 0.5 ? 0 : 1));
      const bucket = path.reduce((a, b) => a + b, 0);
      const mult = table[bucket];
      const payout = Math.floor(wager * mult);
      practice.adjust(-wager + payout);
      animate(path, () => {
        setLanded(bucket);
        setResult({
          outcome: { path, bucket, rows, mult, table },
          payout,
          win: payout > wager,
          wager,
          credits: 0,
        });
        setDropping(false);
        if (payout > wager) celebrate();
      });
      return;
    }

    try {
      const res = await fetch("/api/games/plinko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wager, clientSeed: clientSeed || randomClientSeed() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDropping(false);
        setError(data.error ?? "Something went wrong");
        return;
      }
      animate(data.outcome.path, async () => {
        setLanded(data.outcome.bucket);
        setResult(data);
        setDropping(false);
        if (data.payout > data.wager) celebrate();
        await refresh();
        window.dispatchEvent(new Event("owp:round")); // live-update the bounty meter
      });
    } catch {
      setDropping(false);
      setError("Connection hiccup — check your balance before retrying.");
      await refresh().catch(() => {});
    }
  };

  const balance = sandbox ? practice.credits : me.credits ?? 0;
  const canPlay = sandbox || me.signedIn;
  const topMult = Math.max(...table);

  return (
    <div className="pt-10 max-w-2xl lg:max-w-5xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        kicker="Wing I — table 04"
        title="Lily Pad Drop"
        desc={`Drop a frog through the pond and let it bounce. Land the edges for up to ${topMult.toFixed(1)}× — ${Math.round(house.houseEdge * 100)}% published edge.`}
      />

      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      <div className="lg:hidden">
        <GameBountyStrip game="plinko" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="panel panel-glow game-stage p-8">
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
                bottomless practice bankroll.
              </Notice>
            </div>
          )}

          <div className="plinko-board">
            {Array.from({ length: rows }).map((_, r) =>
              Array.from({ length: r + 1 }).map((_, j) => (
                <span
                  key={`${r}-${j}`}
                  className="plinko-peg"
                  style={{
                    left: `${((rows / 2 - r / 2 + j) / rows) * 100}%`,
                    top: `${((r + 0.5) / rows) * 100}%`,
                  }}
                />
              ))
            )}
            {token && (
              <span className="plinko-token" style={{ left: `${token.left}%`, top: `${token.top}%` }} />
            )}
          </div>

          <div className="flex gap-1 mt-2 mb-5">
            {table.map((m, b) => (
              <div key={b} className={`plinko-bucket ${landed === b ? "hit" : ""}`}>
                {m >= 10 ? m.toFixed(0) : m.toFixed(1)}×
              </div>
            ))}
          </div>

          <div className="min-h-[2.25rem] mb-4 flex items-center justify-center">
            {result && !dropping && (
              <span
                key={result.nonce ?? Math.round(result.outcome.mult * 1000)}
                className={`stat-number text-2xl result-pop ${result.win ? "neon-text" : "text-danger"}`}
              >
                {result.outcome.mult.toFixed(2)}× —{" "}
                {result.win ? `+${result.payout} credits!` : "the pond keeps it."}
              </span>
            )}
          </div>

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
          </div>

          <div className="text-center">
            <button
              className="btn btn-primary text-lg px-12 py-3"
              onClick={play}
              disabled={dropping || !canPlay || wager < house.minWager || (!sandbox && balance < wager)}
            >
              {dropping ? "Dropping…" : sandbox ? "Drop (practice)" : "Drop it"}
            </button>
          </div>

          {!sandbox && !me.signedIn && (
            <p className="text-fog text-sm mt-4 text-center">
              Sign in with your wallet to play — or try the sandbox above.{" "}
              <Link href="/games" className="text-neon hover:underline">
                Get credits →
              </Link>
            </p>
          )}
          {!sandbox && me.signedIn && (me.credits ?? 0) < wager && (
            <p className="text-fog text-sm mt-4 text-center">
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
            <p className="text-xs text-fog/70 mt-6 break-all text-center">
              round nonce {result.nonce} · seed hash {result.seedHash.slice(0, 16)}… ·{" "}
              <Link href="/fairness" className="text-neon hover:underline">
                verify
              </Link>
            </p>
          )}
          {!sandbox && <FairCommit clientSeed={clientSeed} />}
        </div>

        <BountyStandings game="plinko" />
      </div>
    </div>
  );
}
