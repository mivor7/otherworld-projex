"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";
import { celebrate } from "@/components/confetti";
import { usePractice } from "@/components/practice";
import { useHouseConfig } from "@/components/use-house-config";
import { randomClientSeed, useClientSeed } from "@/components/use-client-seed";
import { FairCommit } from "@/components/fair-commit";
import { BountyStandings } from "@/components/bounty-standings";
import { GameBountyStrip } from "@/components/game-bounty-strip";
import { FirstVisitHint } from "@/components/first-visit-hint";

type SplitView = {
  cards: number[];
  total: number;
  soft: boolean;
  doubled: boolean;
  result: "win" | "lose" | "push" | null;
};

type View = {
  roundId: string;
  phase: "player" | "split" | "done";
  player: number[];
  playerTotal: number;
  playerSoft: boolean;
  dealer: number[];
  dealerTotal: number | null;
  doubled: boolean;
  result: "win" | "lose" | "push" | "blackjack" | null;
  split: SplitView | null;
  activeHand: 0 | 1 | null;
  wager: number;
  baseWager?: number;
  payout: number | null;
  nonce: number;
  seedHash?: string;
  canDouble: boolean;
  canSplit?: boolean;
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
  phase: "player" | "split" | "done";
  doubled: boolean;
  result: View["result"];
  split: { cards: number[]; doubled: boolean; result: SplitView["result"] } | null;
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
  const st = r.split ? handTotal(r.split.cards) : null;
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
    split: r.split
      ? { cards: r.split.cards, total: st!.total, soft: st!.soft, doubled: r.split.doubled, result: r.split.result }
      : null,
    activeHand: r.phase === "player" ? 0 : r.phase === "split" ? 1 : null,
    wager:
      r.wager * (r.doubled ? 2 : 1) +
      (r.split ? r.wager * (r.split.doubled ? 2 : 1) : 0),
    baseWager: r.wager,
    payout: done ? r.payout : null,
    nonce: 0,
    canDouble:
      r.phase === "player"
        ? r.player.length === 2 && !r.doubled
        : r.phase === "split"
          ? r.split!.cards.length === 2 && !r.split!.doubled
          : false,
    canSplit:
      r.phase === "player" &&
      !r.split &&
      !r.doubled &&
      r.player.length === 2 &&
      r.player[0] % 13 === r.player[1] % 13,
  };
}

const RESULT_COPY: Record<string, string> = {
  blackjack: "Blackjack — paid 3:2.",
  win: "You win.",
  push: "Push — wager returned.",
  lose: "The house takes it.",
};

// Dealer only draws when at least one hand is live — same as the server.
function practiceDealerPlay(r: PracticeRound) {
  const anyLive =
    handTotal(r.player).total <= 21 ||
    (r.split !== null && handTotal(r.split.cards).total <= 21);
  if (!anyLive) return;
  while (handTotal(r.dealer).total < 17) r.dealer.push(r.deck[r.pos++]);
}

const HAND_COPY: Record<string, string> = {
  win: "wins",
  push: "pushes",
  lose: "folds",
};

/** Headline for a settled split round — one line covering both hands. */
function splitResultCopy(a: string, b: string): string {
  if (a === b) {
    if (a === "win") return "Both hands win.";
    if (a === "push") return "Both hands push — wagers returned.";
    return "The house takes both hands.";
  }
  return `First hand ${HAND_COPY[a]}, split hand ${HAND_COPY[b]}.`;
}

export default function BlackjackPage() {
  const { me, refresh, loading } = useSession();
  const [round, setRound] = useState<View | null>(null);
  const [wager, setWager] = useState(10);
  const [busy, setBusy] = useState(false);
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
  const house = useHouseConfig();
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
    // finally-guarded: a network blip or non-JSON 5xx must never leave the
    // table stuck on "Dealing…" — the server round (if it landed) is safe.
    try {
      const res = await fetch("/api/games/blackjack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setRound(data);
        if (data.phase === "done") {
          if (data.result === "win" || data.result === "blackjack" || data.split?.result === "win") celebrate();
          await refresh();
          window.dispatchEvent(new Event("owp:round")); // live-update the bounty meter
        }
        if (body.action === "deal" || body.action === "double" || body.action === "split") await refresh();
      } else {
        setError(data.error ?? "Something went wrong");
      }
    } catch {
      setError("Connection hiccup — your hand is safe on the server, retry.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  // ——— practice table actions (no wallet, no server, no $RIBBIT) ———
  const settlePractice = useCallback(
    (r: PracticeRound) => {
      const settleHand = (cards: number[], stake: number) => {
        const p = handTotal(cards).total;
        if (p > 21) return { payout: 0, result: "lose" as const };
        const d = handTotal(r.dealer).total;
        if (d > 21 || p > d) return { payout: stake * 2, result: "win" as const };
        if (p === d) return { payout: stake, result: "push" as const };
        return { payout: 0, result: "lose" as const };
      };
      const first = settleHand(r.player, r.wager * (r.doubled ? 2 : 1));
      r.result = first.result;
      r.payout = first.payout;
      if (r.split) {
        const second = settleHand(r.split.cards, r.wager * (r.split.doubled ? 2 : 1));
        r.split.result = second.result;
        r.payout += second.payout;
      }
      r.phase = "done";
      if (r.payout > 0) practice.adjust(r.payout);
      if (r.result === "win" || r.split?.result === "win") celebrate();
      setPracticeRound(practiceView(r));
    },
    [practice]
  );

  // Current hand complete — hand control to a waiting split hand (dealing its
  // second card, auto-standing a two-card 21) or play the dealer and settle.
  const advancePractice = useCallback(
    (r: PracticeRound) => {
      if (r.phase === "player" && r.split) {
        r.phase = "split";
        r.split.cards.push(r.deck[r.pos++]);
        if (handTotal(r.split.cards).total === 21) {
          practiceDealerPlay(r);
          settlePractice(r);
        } else {
          setPracticeRound(practiceView(r));
        }
        return;
      }
      practiceDealerPlay(r);
      settlePractice(r);
    },
    [settlePractice]
  );

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
      split: null,
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
    (action: "hit" | "stand" | "double" | "split") => {
      const r = practiceRef.current;
      if (!r || (r.phase !== "player" && r.phase !== "split")) return;
      const active = r.phase === "player" ? r.player : r.split!.cards;
      if (action === "split") {
        if (
          r.phase !== "player" || r.split || r.doubled ||
          r.player.length !== 2 || r.player[0] % 13 !== r.player[1] % 13
        ) return;
        practice.ensure(r.wager);
        practice.adjust(-r.wager);
        const aces = r.player[0] % 13 === 12;
        r.split = { cards: [r.player[1]], doubled: false, result: null };
        r.player = [r.player[0], r.deck[r.pos++]];
        if (aces) {
          // Split aces take exactly one card each — both hands auto-stand.
          r.split.cards.push(r.deck[r.pos++]);
          practiceDealerPlay(r);
          settlePractice(r);
        } else if (handTotal(r.player).total === 21) {
          advancePractice(r);
        } else {
          setPracticeRound(practiceView(r));
        }
      } else if (action === "double") {
        const handDoubled = r.phase === "player" ? r.doubled : r.split!.doubled;
        if (active.length !== 2 || handDoubled) return;
        practice.ensure(r.wager);
        practice.adjust(-r.wager);
        if (r.phase === "player") r.doubled = true;
        else r.split!.doubled = true;
        active.push(r.deck[r.pos++]);
        advancePractice(r);
      } else if (action === "hit") {
        active.push(r.deck[r.pos++]);
        if (handTotal(active).total >= 21) advancePractice(r);
        else setPracticeRound(practiceView(r));
      } else {
        advancePractice(r);
      }
    },
    [practice, settlePractice, advancePractice]
  );

  const dealNew = () =>
    sandbox
      ? dealPractice()
      : post({ action: "deal", wager, clientSeed: clientSeed || randomClientSeed() });
  const act = (action: "hit" | "stand" | "double" | "split") =>
    sandbox
      ? actPractice(action)
      : post({ action, roundId: view!.roundId });

  const view = sandbox ? practiceRound : round;
  const inHand = view?.phase === "player" || view?.phase === "split";
  const done = view?.phase === "done";
  const balance = sandbox ? practice.credits : (me.credits ?? 0);
  const canPlay = sandbox || me.signedIn;
  // Doubling or splitting stakes one more base wager.
  const extraBet = view?.baseWager ?? view?.wager ?? 0;
  const extraFundsOk = sandbox || (me.credits ?? 0) >= extraBet;

  return (
    <div className="pt-6 max-w-3xl lg:max-w-6xl mx-auto">
      <Link href="/games" className="text-fog text-sm hover:text-frost transition-colors inline-block mb-4">
        ← Arcade
      </Link>
      <SectionTitle
        compact
        kicker="Wing I — table 03"
        title="Blackjack"
        desc="Single deck, dealer stands on 17, blackjack pays 3:2, split any pair once. The whole deck order is committed before your first card — verifiably fair."
      />

      <FirstVisitHint id="how-games-work">
        New here? When a game shows a live bounty, playing enters you in a shared
        $RIBBIT prize — the panel tracks your standing in real time.
      </FirstVisitHint>

      {/* Mobile: the strip is the at-a-glance header (standings stack far
          below). Desktop: hidden — the full standings sit beside the game. */}
      <div className="lg:hidden">
        <GameBountyStrip game="blackjack" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
      <div className="panel panel-glow panel-etched game-stage p-6 sm:p-8">
        {!sandbox && house.gamesPaused && (
          <div className="mb-4">
            <Notice kind="info">Live tables are paused by the house right now — the sandbox above still works.</Notice>
          </div>
        )}
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
            <div className="kicker !text-[0.6rem]">{sandbox ? "Practice chips" : "Chips ⛁"}</div>
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
          className="rounded-xl p-5 sm:p-6 mb-6 relative overflow-hidden"
          style={{
            background:
              "radial-gradient(130% 110% at 50% -20%, oklch(0.19 0.03 160), oklch(0.135 0.018 160) 55%, oklch(0.115 0.015 160))",
            border: "1px solid oklch(0.78 0.11 150 / 0.14)",
            boxShadow:
              "inset 0 0 60px oklch(0 0 0 / 0.5), inset 0 0 0 1px oklch(1 0 0 / 0.03)",
          }}
        >
          {/* etched table markings */}
          <svg
            className="absolute inset-x-0 bottom-0 w-full pointer-events-none"
            viewBox="0 0 600 150"
            preserveAspectRatio="xMidYMax meet"
            aria-hidden
          >
            <defs>
              <path id="bj-arc" d="M 60 150 A 300 210 0 0 1 540 150" fill="none" />
              <path id="bj-arc-text" d="M 78 150 A 285 200 0 0 1 522 150" fill="none" />
            </defs>
            <use
              href="#bj-arc"
              stroke="oklch(0.78 0.11 150 / 0.16)"
              strokeWidth="1.2"
            />
            <text
              fontSize="10.5"
              letterSpacing="3.5"
              fill="oklch(0.78 0.11 150 / 0.3)"
              style={{ fontFamily: "var(--font-mono, monospace)" }}
            >
              <textPath href="#bj-arc-text" startOffset="50%" textAnchor="middle">
                BLACKJACK PAYS 3 : 2 · DEALER STANDS ON 17
              </textPath>
            </text>
          </svg>
          <div className="space-y-6 relative">
            <Hand
              label="Dealer"
              cards={view?.dealer ?? []}
              total={view?.dealerTotal ?? null}
              hiddenHole={inHand}
            />
            <Hand
              label={
                view?.split
                  ? `First hand${view.doubled ? " · doubled" : ""}${done && view.result ? ` · ${HAND_COPY[view.result]}` : ""}`
                  : `Your hand${view?.doubled ? " · doubled" : ""}`
              }
              cards={view?.player ?? []}
              total={view ? view.playerTotal : null}
              soft={view?.playerSoft}
              active={view?.split ? view.activeHand === 0 : undefined}
            />
            {view?.split && (
              <Hand
                label={`Split hand${view.split.doubled ? " · doubled" : ""}${done && view.split.result ? ` · ${HAND_COPY[view.split.result]}` : ""}`}
                cards={view.split.cards}
                total={view.split.total}
                soft={view.split.soft}
                active={view.activeHand === 1}
              />
            )}
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
            className={`stat-number text-center text-xl mb-5 result-pop ${
              (view.payout ?? 0) > 0 ? "text-neon" : "text-danger"
            }`}
          >
            {view.split && view.split.result
              ? splitResultCopy(view.result, view.split.result)
              : RESULT_COPY[view.result]}
            {view.payout !== null && view.payout > 0 &&
              ` +${view.payout} ${sandbox ? "practice chips" : "chips"}`}
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
                disabled={busy || !extraFundsOk}
                title="Double the wager, take exactly one card"
              >
                Double
              </button>
            )}
            {view!.canSplit && (
              <button
                className="btn btn-portal btn-lg px-8"
                onClick={() => act("split")}
                disabled={busy || !extraFundsOk}
                title="Split the pair into two hands — stakes a second wager. Split aces take one card each."
              >
                Split
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <label className="text-sm text-fog">Wager</label>
            <input
              type="number"
              className="input max-w-28 text-center"
              min={house.minWager}
              max={house.maxWager}
              aria-label="Wager in chips"
              value={wager || ""}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                setWager(Number.isFinite(n) && n > 0 ? Math.min(house.maxWager, n) : 0);
              }}
            />
            <button
              className="btn btn-primary btn-lg px-10"
              onClick={dealNew}
              disabled={busy || wager < house.minWager || (!sandbox && (house.gamesPaused || !me.signedIn || balance < wager))}
            >
              {busy ? "Dealing…" : done ? "Deal again" : sandbox ? "Deal (practice)" : "Deal"}
            </button>
          </div>
        )}

        {!sandbox && !me.signedIn && (
          <p className="text-fog text-sm mt-5 text-center">
            Sign in with your wallet to take a seat — or try the sandbox above.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get chips →
            </Link>
          </p>
        )}
        {!sandbox && me.signedIn && !inHand && (me.credits ?? 0) < wager && (
          <p className="text-fog text-sm mt-5 text-center">
            Not enough chips.{" "}
            <Link href="/games" className="text-neon hover:underline">
              Get more credits →
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
        <BountyStandings game="blackjack" />
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
        className="card-in w-14 h-20 sm:w-16 sm:h-24 rounded-lg relative overflow-hidden"
        style={{
          boxShadow: "0 3px 10px oklch(0 0 0 / 0.5), inset 0 0 0 1px oklch(1 0 0 / 0.08)",
          animationDelay: `${delay}ms`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/owp_card_back.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
      </div>
    );
  }
  const rank = RANKS[card % 13];
  const suit = SUITS[Math.floor(card / 13)];
  const red = suit === "♥" || suit === "♦";
  return (
    <div
      className="card-in w-14 h-20 sm:w-16 sm:h-24 rounded-lg relative select-none overflow-hidden"
      style={{
        color: red ? "oklch(0.48 0.19 25)" : "oklch(0.2 0.01 270)",
        boxShadow: "0 3px 10px oklch(0 0 0 / 0.45), inset 0 1px 0 oklch(1 0 0 / 0.5)",
        animationDelay: `${delay}ms`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/art/owp_card_face.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
      {/* corner index — top left */}
      <div
        className="absolute top-1 left-1.5 text-center leading-none"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <div className="text-[0.82rem] font-bold tracking-tight">{rank}</div>
        <div className="text-[0.72rem] -mt-px">{suit}</div>
      </div>
      {/* corner index — bottom right, rotated like a real card */}
      <div
        className="absolute bottom-1 right-1.5 text-center leading-none rotate-180"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <div className="text-[0.82rem] font-bold tracking-tight">{rank}</div>
        <div className="text-[0.72rem] -mt-px">{suit}</div>
      </div>
      {/* center suit pip (the face art already carries the frog watermark) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[1.55rem]">{suit}</span>
      </div>
    </div>
  );
}

function Hand({
  label,
  cards,
  total,
  soft,
  hiddenHole,
  active,
}: {
  label: string;
  cards: number[];
  total: number | null;
  soft?: boolean;
  hiddenHole?: boolean;
  /** Split rounds only: true = this hand is acting, false = waiting/finished,
   *  undefined = single-hand round (no marker at all). */
  active?: boolean;
}) {
  return (
    <div className={active === false ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="kicker">{label}</span>
        {total !== null && (
          <span className="stat-number text-neon text-sm">
            {soft ? `${total} soft` : total}
          </span>
        )}
        {active && (
          <span
            className="kicker !text-[0.6rem] px-1.5 py-0.5 rounded"
            style={{
              color: "oklch(0.78 0.11 150)",
              border: "1px solid oklch(0.78 0.11 150 / 0.35)",
            }}
          >
            to act
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
