"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { celebrate } from "@/components/confetti";

type View = {
  roundId: string;
  phase: "player" | "done";
  player: number[];
  playerTotal: number;
  playerSoft: boolean;
  dealer: number[];
  dealerTotal: number | null;
  doubled: boolean;
  result: "win" | "lose" | "push" | "blackjack" | null;
  wager: number;
  payout: number | null;
  nonce: number;
  seedHash?: string;
  canDouble: boolean;
};

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];

function PlayingCard({
  card,
  hidden = false,
  delay = 0,
}: {
  card?: number;
  hidden?: boolean;
  delay?: number;
}) {
  if (hidden || card === undefined) {
    return (
      <div
        className="card-in w-14 h-20 sm:w-16 sm:h-24 rounded-lg border flex items-center justify-center"
        style={{
          borderColor: "var(--hairline-strong)",
          background:
            "repeating-linear-gradient(45deg, oklch(0.17 0.02 150), oklch(0.17 0.02 150) 4px, oklch(0.14 0.015 150) 4px, oklch(0.14 0.015 150) 8px)",
        }}
      >
        <span className="text-neon opacity-40 text-lg">◆</span>
      </div>
    );
  }
  const rank = RANKS[card % 13];
  const suit = SUITS[Math.floor(card / 13)];
  const red = suit === "♥" || suit === "♦";
  return (
    <div
      className="card-in w-14 h-20 sm:w-16 sm:h-24 rounded-lg flex flex-col justify-between p-1.5 select-none"
      style={{
        background: "oklch(0.97 0.003 270)",
        color: red ? "oklch(0.5 0.19 25)" : "oklch(0.2 0.01 270)",
        border: "1px solid oklch(0 0 0 / 0.35)",
        boxShadow: "0 2px 8px oklch(0 0 0 / 0.4)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="text-sm font-semibold leading-none" style={{ fontFamily: "var(--font-display)" }}>
        {rank}
        <span className="block text-base leading-none mt-0.5">{suit}</span>
      </div>
      <div className="text-2xl text-right leading-none">{suit}</div>
    </div>
  );
}

function Hand({
  label,
  cards,
  total,
  soft,
  hiddenHole,
}: {
  label: string;
  cards: number[];
  total: number | null;
  soft?: boolean;
  hiddenHole?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="kicker">{label}</span>
        {total !== null && (
          <span className="stat-number text-neon text-sm">
            {soft ? `${total} soft` : total}
          </span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {cards.map((c, i) => (
          <PlayingCard key={`${c}-${i}`} card={c} delay={i * 70} />
        ))}
        {hiddenHole && <PlayingCard hidden delay={cards.length * 70} />}
      </div>
    </div>
  );
}

const RESULT_COPY: Record<string, string> = {
  blackjack: "Blackjack — paid 3:2.",
  win: "You win.",
  push: "Push — wager returned.",
  lose: "The house takes it.",
};

export default function BlackjackPage() {
  const { me, refresh } = useSession();
  const [round, setRound] = useState<View | null>(null);
  const [wager, setWager] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an open hand on mount (e.g. after refresh).
  useEffect(() => {
    if (!me.signedIn) return;
    fetch("/api/games/blackjack")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.round && setRound(d.round))
      .catch(() => {});
  }, [me.signedIn]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/games/blackjack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setRound(data);
      if (data.phase === "done") {
        if (data.result === "win" || data.result === "blackjack") celebrate();
        await refresh();
      }
      if (body.action === "deal" || body.action === "double") await refresh();
    } else {
      setError(data.error ?? "Something went wrong");
    }
    setBusy(false);
  };

  const dealNew = () =>
    post({
      action: "deal",
      wager,
      clientSeed: Math.random().toString(36).slice(2, 12),
    });

  const inHand = round?.phase === "player";
  const done = round?.phase === "done";

  return (
    <div className="pt-10 max-w-3xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        kicker="Wing I — table 03"
        title="Blackjack"
        desc="Single deck, dealer stands on 17, blackjack pays 3:2. The whole deck order is committed before your first card — verifiably fair."
      />

      <div className="panel panel-glow p-6 sm:p-8">
        {/* Table felt */}
        <div
          className="rounded-lg p-5 sm:p-6 mb-6"
          style={{
            background: "oklch(0.14 0.015 160)",
            border: "1px solid oklch(0.78 0.11 150 / 0.12)",
          }}
        >
          <div className="space-y-6">
            <Hand
              label="Dealer"
              cards={round?.dealer ?? []}
              total={round?.dealerTotal ?? null}
              hiddenHole={inHand}
            />
            <Hand
              label={`Your hand${round?.doubled ? " · doubled" : ""}`}
              cards={round?.player ?? []}
              total={round ? round.playerTotal : null}
              soft={round?.playerSoft}
            />
            {!round && (
              <p className="text-fog text-sm py-4 text-center">
                Set your wager and deal in.
              </p>
            )}
          </div>
        </div>

        {done && round?.result && (
          <div
            className={`stat-number text-center text-xl mb-5 ${
              round.result === "lose" ? "text-danger" : "text-neon"
            }`}
          >
            {RESULT_COPY[round.result]}
            {round.payout !== null && round.payout > 0 && ` +${round.payout} credits`}
          </div>
        )}

        {/* Controls */}
        {inHand ? (
          <div className="flex flex-wrap justify-center gap-2.5">
            <button className="btn btn-primary btn-lg px-8" onClick={() => post({ action: "hit", roundId: round!.roundId })} disabled={busy}>
              Hit
            </button>
            <button className="btn btn-ghost btn-lg px-8" onClick={() => post({ action: "stand", roundId: round!.roundId })} disabled={busy}>
              Stand
            </button>
            {round!.canDouble && (
              <button
                className="btn btn-portal btn-lg px-8"
                onClick={() => post({ action: "double", roundId: round!.roundId })}
                disabled={busy || (me.credits ?? 0) < round!.wager}
                title="Double the wager, take exactly one card"
              >
                Double
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <label className="text-sm text-fog">Wager</label>
            <input
              type="number"
              className="input max-w-28 text-center"
              min={1}
              max={1000}
              value={wager}
              onChange={(e) => setWager(Math.max(1, Math.floor(Number(e.target.value))))}
            />
            <button
              className="btn btn-primary btn-lg px-10"
              onClick={dealNew}
              disabled={busy || !me.signedIn || (me.credits ?? 0) < wager}
            >
              {busy ? "Dealing…" : done ? "Deal again" : "Deal"}
            </button>
          </div>
        )}

        {!me.signedIn && (
          <p className="text-fog text-sm mt-5 text-center">
            Sign in with your wallet to take a seat.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get credits →
            </Link>
          </p>
        )}
        {me.signedIn && !inHand && (me.credits ?? 0) < wager && (
          <p className="text-fog text-sm mt-5 text-center">
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

        {round && (
          <p
            className="text-xs mt-6 text-center break-all"
            style={{ color: "var(--text-dim)" }}
          >
            round nonce {round.nonce}
            {round.seedHash && <> · seed hash {round.seedHash.slice(0, 16)}…</>} ·{" "}
            <Link href="/fairness" className="text-neon hover:underline">
              verify the deck
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
