"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { celebrate } from "@/components/confetti";
import { usePractice } from "@/components/practice";
import { useClientSeed } from "@/components/use-client-seed";
import { FairCommit } from "@/components/fair-commit";

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

// ——— local rules for the practice table — identical to the live engine
// (single deck, dealer stands on all 17s, naturals 3:2, double = one card) ———
function rankValue(rank: number): number {
  if (rank === 12) return 11; // ace
  if (rank >= 8) return 10; // 10, J, Q, K
  return rank + 2;
}
function handTotal(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = rankValue(c % 13);
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}
const isBlackjack = (cards: number[]) =>
  cards.length === 2 && handTotal(cards).total === 21;

type PracticeRound = {
  deck: number[];
  pos: number;
  player: number[];
  dealer: number[];
  phase: "player" | "done";
  doubled: boolean;
  result: View["result"];
  wager: number;
  payout: number;
};

function shuffledDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function practiceView(r: PracticeRound): View {
  const pt = handTotal(r.player);
  const done = r.phase === "done";
  return {
    roundId: "practice",
    phase: r.phase,
    player: r.player,
    playerTotal: pt.total,
    playerSoft: pt.soft,
    dealer: done ? r.dealer : [r.dealer[0]],
    dealerTotal: done ? handTotal(r.dealer).total : null,
    doubled: r.doubled,
    result: r.result,
    wager: r.wager * (r.doubled ? 2 : 1),
    payout: done ? r.payout : null,
    nonce: 0,
    canDouble: r.phase === "player" && r.player.length === 2 && !r.doubled,
  };
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
  const [sandbox, setSandbox] = useState(false);
  const practice = usePractice();
  const practiceRef = useRef<PracticeRound | null>(null);
  const [practiceRound, setPracticeRound] = useState<View | null>(null);
  const { seed: clientSeed } = useClientSeed();

  // Restore an open live hand on mount (e.g. after refresh).
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

  // ——— practice table actions (no wallet, no server, no $RIBBIT) ———
  const settlePractice = useCallback(
    (r: PracticeRound) => {
      const total = r.wager * (r.doubled ? 2 : 1);
      const p = handTotal(r.player).total;
      const d = handTotal(r.dealer).total;
      if (p > 21) {
        r.result = "lose";
        r.payout = 0;
      } else if (d > 21 || p > d) {
        r.result = "win";
        r.payout = total * 2;
      } else if (p === d) {
        r.result = "push";
        r.payout = total;
      } else {
        r.result = "lose";
        r.payout = 0;
      }
      r.phase = "done";
      if (r.payout > 0) practice.adjust(r.payout);
      if (r.result === "win") celebrate();
      setPracticeRound(practiceView(r));
    },
    [practice]
  );

  const dealerPlay = (r: PracticeRound) => {
    while (handTotal(r.dealer).total < 17) r.dealer.push(r.deck[r.pos++]);
  };

  const dealPractice = useCallback(() => {
    setError(null);
    // Bottomless bankroll — top up first so the deal can never be blocked.
    practice.ensure(wager);
    practice.adjust(-wager);
    const deck = shuffledDeck();
    const r: PracticeRound = {
      deck,
      pos: 4,
      player: [deck[0], deck[2]],
      dealer: [deck[1], deck[3]],
      phase: "player",
      doubled: false,
      result: null,
      wager,
      payout: 0,
    };
    practiceRef.current = r;
    // Naturals resolve immediately, same as the live table.
    const playerBJ = isBlackjack(r.player);
    const dealerBJ = isBlackjack(r.dealer);
    if (playerBJ || dealerBJ) {
      r.phase = "done";
      if (playerBJ && dealerBJ) {
        r.result = "push";
        r.payout = r.wager;
      } else if (playerBJ) {
        r.result = "blackjack";
        r.payout = Math.floor(r.wager * 2.5);
      } else {
        r.result = "lose";
      }
      if (r.payout > 0) practice.adjust(r.payout);
      if (r.result === "blackjack") celebrate();
      setPracticeRound(practiceView(r));
      return;
    }
    setPracticeRound(practiceView(r));
  }, [practice, wager]);

  const actPractice = useCallback(
    (action: "hit" | "stand" | "double") => {
      const r = practiceRef.current;
      if (!r || r.phase !== "player") return;
      if (action === "double") {
        if (r.player.length !== 2 || r.doubled) return;
        practice.ensure(r.wager);
        practice.adjust(-r.wager);
        r.doubled = true;
        r.player.push(r.deck[r.pos++]);
        if (handTotal(r.player).total <= 21) dealerPlay(r);
        settlePractice(r);
      } else if (action === "hit") {
        r.player.push(r.deck[r.pos++]);
        const t = handTotal(r.player).total;
        if (t > 21) {
          settlePractice(r);
        } else if (t === 21) {
          dealerPlay(r);
          settlePractice(r);
        } else {
          setPracticeRound(practiceView(r));
        }
      } else {
        dealerPlay(r);
        settlePractice(r);
      }
    },
    [practice, settlePractice]
  );

  const dealNew = () =>
    sandbox ? dealPractice() : post({ action: "deal", wager, clientSeed });
  const act = (action: "hit" | "stand" | "double") =>
    sandbox
      ? actPractice(action)
      : post({ action, roundId: view!.roundId });

  const view = sandbox ? practiceRound : round;
  const inHand = view?.phase === "player";
  const done = view?.phase === "done";
  const balance = sandbox ? practice.credits : (me.credits ?? 0);
  const canPlay = sandbox || me.signedIn;
  const doubleFundsOk = sandbox || (me.credits ?? 0) >= (view?.wager ?? 0);

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

      <div className="panel panel-glow panel-etched p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="chips">
            <button
              className={`chip ${!sandbox ? "active" : ""}`}
              aria-pressed={!sandbox}
              onClick={() => { setSandbox(false); setError(null); }}
            >
              Live table
            </button>
            <button
              className={`chip ${sandbox ? "active" : ""}`}
              aria-pressed={sandbox}
              onClick={() => { setSandbox(true); setError(null); }}
            >
              Sandbox
            </button>
          </div>
          <div className="text-right">
            <div className="kicker !text-[0.6rem]">{sandbox ? "Practice credits" : "Credits"}</div>
            <div className="stat-number text-neon">{canPlay ? balance : "—"}</div>
          </div>
        </div>
        {sandbox && (
          <div className="mb-5">
            <Notice kind="info">
              Sandbox — no wallet needed, no $RIBBIT involved. Same single-deck
              rules, bottomless practice bankroll, nothing real won or lost.
            </Notice>
          </div>
        )}

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
              cards={view?.dealer ?? []}
              total={view?.dealerTotal ?? null}
              hiddenHole={inHand}
            />
            <Hand
              label={`Your hand${view?.doubled ? " · doubled" : ""}`}
              cards={view?.player ?? []}
              total={view ? view.playerTotal : null}
              soft={view?.playerSoft}
            />
            {!view && (
              <p className="text-fog text-sm py-4 text-center">
                {sandbox
                  ? "Set your wager and deal in — practice chips only."
                  : "Set your wager and deal in."}
              </p>
            )}
          </div>
        </div>

        {done && view?.result && (
          <div
            className={`stat-number text-center text-xl mb-5 ${
              view.result === "lose" ? "text-danger" : "text-neon"
            }`}
          >
            {RESULT_COPY[view.result]}
            {view.payout !== null && view.payout > 0 &&
              ` +${view.payout} ${sandbox ? "practice credits" : "credits"}`}
          </div>
        )}

        {/* Controls */}
        {inHand ? (
          <div className="flex flex-wrap justify-center gap-2.5">
            <button className="btn btn-primary btn-lg px-8" onClick={() => act("hit")} disabled={busy}>
              Hit
            </button>
            <button className="btn btn-ghost btn-lg px-8" onClick={() => act("stand")} disabled={busy}>
              Stand
            </button>
            {view!.canDouble && (
              <button
                className="btn btn-portal btn-lg px-8"
                onClick={() => act("double")}
                disabled={busy || !doubleFundsOk}
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
              disabled={busy || (!sandbox && (!me.signedIn || balance < wager))}
            >
              {busy ? "Dealing…" : done ? "Deal again" : sandbox ? "Deal (practice)" : "Deal"}
            </button>
          </div>
        )}

        {!sandbox && !me.signedIn && (
          <p className="text-fog text-sm mt-5 text-center">
            Sign in with your wallet to take a seat — or try the sandbox above.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get credits →
            </Link>
          </p>
        )}
        {!sandbox && me.signedIn && !inHand && (me.credits ?? 0) < wager && (
          <p className="text-fog text-sm mt-5 text-center">
            Not enough credits.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Burn $RIBBIT for more →
            </Link>
          </p>
        )}
        {error && !sandbox && (
          <div className="mt-4">
            <Notice kind="err">{error}</Notice>
          </div>
        )}

        {!sandbox && round && (
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
        {sandbox && practiceRound && done && (
          <p className="text-xs mt-6 text-center" style={{ color: "var(--text-dim)" }}>
            practice round — nothing wagered, nothing won
          </p>
        )}
        {!sandbox && <FairCommit clientSeed={clientSeed} />}
      </div>
    </div>
  );
}

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
