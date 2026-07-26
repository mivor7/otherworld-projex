// Blackjack — single deck per round, dealer stands on all 17s, blackjack
// pays 3:2, double on any first two cards, split an identical-rank pair once
// (one card each on split aces, double after split allowed, a split 21 pays
// 1:1 — only a natural pays 3:2). No insurance.
//
// Provably fair: the entire deck order is derived from the committed server
// seed before the first card is dealt — shuffle randoms come from
// HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${i}`). Rotating your seed
// reveals it, letting you re-derive the deck and audit every card. Rounds in
// progress block rotation (see /api/fairness/rotate) so a reveal can never
// expose live cards.
import { createHmac } from "crypto";
import { z } from "zod";
import { prisma } from "./db";
import { adjustCredits } from "./credits";
import { getActiveSeed } from "./fairness";
import { ApiError } from "./api";
import { houseConfig } from "./settings";
import { assertWagerAllowed } from "./games";

export const dealParams = z.object({
  action: z.literal("deal"),
  // Live bounds enforced in deal() via assertWagerAllowed.
  wager: z.number().int().min(1).max(100_000_000),
  clientSeed: z.string().min(1).max(64),
});

export const actParams = z.object({
  action: z.enum(["hit", "stand", "double", "split"]),
  roundId: z.string().min(1),
});

// Card index 0..51 → rank 0..12 (2..10, J, Q, K, A), suit 0..3.
export function cardRank(card: number): number {
  return card % 13;
}
export function cardSuit(card: number): number {
  return Math.floor(card / 13);
}

function rankValue(rank: number): number {
  if (rank === 12) return 11; // ace
  if (rank >= 8) return 10; // 10, J, Q, K
  return rank + 2;
}

export function handTotal(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = rankValue(cardRank(c));
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

function isBlackjack(cards: number[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

/** Deterministic Fisher–Yates from the committed seed. Fully auditable. */
export function deriveDeck(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const digest = createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}:${51 - i}`)
      .digest("hex");
    const r = parseInt(digest.slice(0, 8), 16) / 0x100000000;
    const j = Math.floor(r * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

type BJState = {
  deckPos: number;
  player: number[];
  dealer: number[];
  // "player" = acting on the first hand, "split" = acting on the second.
  // Rounds written before split existed only ever hold "player" | "done" and
  // no `split` field — every path below must treat that absence as "no
  // split", so an in-flight round keeps playing across the deploy.
  phase: "player" | "split" | "done";
  doubled: boolean;
  result?: "win" | "lose" | "push" | "blackjack";
  split?: {
    cards: number[];
    doubled: boolean;
    result?: "win" | "lose" | "push";
  };
};

/** True credits staked so far: each hand's base wager, doubled where doubled. */
function stakedTotal(s: BJState, base: number): number {
  return base * (s.doubled ? 2 : 1) + (s.split ? base * (s.split.doubled ? 2 : 1) : 0);
}

/** The round's per-hand base wager. The `wager` COLUMN holds total credits
 *  staked (it grows on double/split), so the immutable base lives in params. */
function baseWager(round: { wager: number; params?: string | null }): number {
  try {
    const w = JSON.parse(round.params ?? "").wager;
    return typeof w === "number" && w > 0 ? w : round.wager;
  } catch {
    return round.wager;
  }
}

/** What the player is allowed to see. Hole card stays hidden until done. */
export function publicView(round: {
  id: string;
  wager: number;
  payout: number;
  nonce: number;
  outcome: string;
  params?: string | null;
  seed?: { seedHash: string };
}) {
  const s = JSON.parse(round.outcome) as BJState;
  const playerTotal = handTotal(s.player);
  const done = s.phase === "done";
  const base = baseWager(round);
  const splitTotal = s.split ? handTotal(s.split.cards) : null;
  return {
    roundId: round.id,
    phase: s.phase,
    player: s.player,
    playerTotal: playerTotal.total,
    playerSoft: playerTotal.soft,
    dealer: done ? s.dealer : [s.dealer[0]],
    dealerTotal: done ? handTotal(s.dealer).total : null,
    doubled: s.doubled,
    result: s.result ?? null,
    split: s.split
      ? {
          cards: s.split.cards,
          total: splitTotal!.total,
          soft: splitTotal!.soft,
          doubled: s.split.doubled,
          result: s.split.result ?? null,
        }
      : null,
    // 0 = first hand acting, 1 = split hand acting, null = round over.
    activeHand: s.phase === "player" ? 0 : s.phase === "split" ? 1 : null,
    // The wager column always holds the TRUE credits staked so far — doubles
    // and splits persist their extra stake the moment they happen — so no
    // multiplier here: rankings and bounty volume read the same column.
    wager: round.wager,
    // Doubling or splitting costs one more base wager; the client greys the
    // buttons against this, the server re-checks funds regardless.
    baseWager: base,
    payout: done ? round.payout : null,
    nonce: round.nonce,
    seedHash: round.seed?.seedHash,
    canDouble:
      s.phase === "player"
        ? s.player.length === 2 && !s.doubled
        : s.phase === "split"
          ? s.split!.cards.length === 2 && !s.split!.doubled
          : false,
    canSplit:
      s.phase === "player" &&
      !s.split &&
      !s.doubled &&
      s.player.length === 2 &&
      cardRank(s.player[0]) === cardRank(s.player[1]),
  };
}

function settleHand(
  cards: number[],
  dealer: number[],
  stake: number
): { payout: number; result: "win" | "lose" | "push" } {
  const p = handTotal(cards).total;
  if (p > 21) return { payout: 0, result: "lose" };
  const d = handTotal(dealer).total;
  if (d > 21 || p > d) return { payout: stake * 2, result: "win" };
  if (p === d) return { payout: stake, result: "push" };
  return { payout: 0, result: "lose" };
}

/** Settle every hand against the dealer. Split 21s pay 1:1 by design —
 *  the 3:2 "blackjack" result only ever comes from a natural at deal. */
function settleState(s: BJState, base: number): { payout: number } {
  const first = settleHand(s.player, s.dealer, base * (s.doubled ? 2 : 1));
  s.result = first.result;
  let payout = first.payout;
  if (s.split) {
    const second = settleHand(s.split.cards, s.dealer, base * (s.split.doubled ? 2 : 1));
    s.split.result = second.result;
    payout += second.payout;
  }
  return { payout };
}

/**
 * Draw the next committed card. Unreachable past 52 in single-deck heads-up
 * (hands cap at 21) — but a corrupted state must fail loudly inside the
 * transaction, never deal `undefined` into a paying round.
 */
function draw(s: BJState, deck: number[]): number {
  if (s.deckPos >= deck.length) throw new ApiError("Deck exhausted", 500);
  return deck[s.deckPos++];
}

function dealerPlay(s: BJState, deck: number[]) {
  while (handTotal(s.dealer).total < 17) {
    s.dealer.push(draw(s, deck));
  }
}

/** Close the round: the dealer only draws when at least one hand is live —
 *  same behavior the table always had for a single busted hand. */
function finishRound(s: BJState, deck: number[]) {
  const anyLive =
    handTotal(s.player).total <= 21 ||
    (s.split !== undefined && handTotal(s.split.cards).total <= 21);
  if (anyLive) dealerPlay(s, deck);
  s.phase = "done";
}

/** The current hand is complete (stand, bust, 21, or double) — move on.
 *  With a waiting split hand: give it its second card and hand over control
 *  (auto-standing a two-card 21); otherwise the dealer plays and we settle. */
function advanceHand(s: BJState, deck: number[]) {
  if (s.phase === "player" && s.split) {
    s.phase = "split";
    s.split.cards.push(draw(s, deck));
    if (handTotal(s.split.cards).total === 21) finishRound(s, deck);
    return;
  }
  finishRound(s, deck);
}

async function loadRound(userId: string, roundId: string) {
  const round = await prisma.gameRound.findUnique({
    where: { id: roundId },
    include: { seed: true },
  });
  if (!round || round.userId !== userId || round.game !== "blackjack") {
    throw new ApiError("Round not found", 404);
  }
  return round;
}

export async function currentRound(userId: string) {
  const round = await prisma.gameRound.findFirst({
    where: { userId, game: "blackjack", settled: false },
    include: { seed: { select: { seedHash: true } } },
  });
  return round ? publicView(round) : null;
}

export async function deal(userId: string, wager: number, clientSeed: string) {
  // New hands respect the live table rules; open hands (hit/stand/double)
  // are never blocked — a pause can't strand a player mid-hand.
  assertWagerAllowed(await houseConfig(), wager);
  const open = await prisma.gameRound.count({
    where: { userId, game: "blackjack", settled: false },
  });
  if (open > 0) throw new ApiError("Finish your current hand first", 409);

  const seed = await getActiveSeed(userId);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.serverSeed.updateMany({
      where: { id: seed.id, nonce: seed.nonce, active: true },
      data: { nonce: { increment: 1 } },
    });
    if (claimed.count === 0) throw new ApiError("Concurrent round in flight — retry", 409);
    const nonce = seed.nonce;

    await adjustCredits(tx, userId, -wager, "wager");

    const deck = deriveDeck(seed.seed, clientSeed, nonce);
    const s: BJState = {
      deckPos: 4,
      player: [deck[0], deck[2]],
      dealer: [deck[1], deck[3]],
      phase: "player",
      doubled: false,
    };

    // Naturals resolve immediately (dealer peeks at deal — simplest fair rule).
    let payout = 0;
    let settled = false;
    const playerBJ = isBlackjack(s.player);
    const dealerBJ = isBlackjack(s.dealer);
    if (playerBJ || dealerBJ) {
      s.phase = "done";
      settled = true;
      if (playerBJ && dealerBJ) {
        s.result = "push";
        payout = wager;
      } else if (playerBJ) {
        s.result = "blackjack";
        payout = Math.floor(wager * 2.5);
      } else {
        s.result = "lose";
      }
    }

    const round = await tx.gameRound.create({
      data: {
        userId,
        seedId: seed.id,
        game: "blackjack",
        nonce,
        clientSeed,
        params: JSON.stringify({ wager }),
        outcome: JSON.stringify(s),
        wager,
        payout,
        houseTake: settled ? wager * (s.doubled ? 2 : 1) - payout : 0,
        settled,
      },
      include: { seed: { select: { seedHash: true } } },
    });

    let credits: number | undefined;
    if (payout > 0) {
      credits = await adjustCredits(tx, userId, payout, "payout", round.id);
    }
    return { ...publicView(round), credits };
  });
}

export async function act(
  userId: string,
  roundId: string,
  action: "hit" | "stand" | "double" | "split"
) {
  const round = await loadRound(userId, roundId);
  if (round.settled) throw new ApiError("Round already settled", 409);
  const s = JSON.parse(round.outcome) as BJState;
  if (s.phase !== "player" && s.phase !== "split") {
    throw new ApiError("No action available", 409);
  }
  const deck = deriveDeck(round.seed.seed, round.clientSeed, round.nonce);
  const prevOutcome = round.outcome;
  const base = baseWager(round);
  // The hand the action applies to: first hand in "player", second in "split".
  const active = s.phase === "player" ? s.player : s.split!.cards;

  return prisma.$transaction(async (tx) => {
    if (action === "split") {
      if (
        s.phase !== "player" ||
        s.split ||
        s.doubled ||
        s.player.length !== 2 ||
        cardRank(s.player[0]) !== cardRank(s.player[1])
      ) {
        throw new ApiError("Cannot split now");
      }
      await adjustCredits(tx, userId, -base, "wager", round.id);
      const aces = cardRank(s.player[0]) === 12;
      s.split = { cards: [s.player[1]], doubled: false };
      s.player = [s.player[0], draw(s, deck)];
      if (aces) {
        // Split aces take exactly one card each — both hands auto-stand.
        s.split.cards.push(draw(s, deck));
        finishRound(s, deck);
      } else if (handTotal(s.player).total === 21) {
        advanceHand(s, deck);
      }
    } else if (action === "double") {
      const handDoubled = s.phase === "player" ? s.doubled : s.split!.doubled;
      if (active.length !== 2 || handDoubled) throw new ApiError("Cannot double now");
      await adjustCredits(tx, userId, -base, "wager", round.id);
      if (s.phase === "player") s.doubled = true;
      else s.split!.doubled = true;
      active.push(draw(s, deck));
      advanceHand(s, deck);
    } else if (action === "hit") {
      active.push(draw(s, deck));
      const t = handTotal(active).total;
      if (t >= 21) advanceHand(s, deck);
    } else {
      advanceHand(s, deck);
    }

    let payout = 0;
    const done = s.phase === "done";
    if (done) ({ payout } = settleState(s, base));
    // Doubles and splits stake extra wagers — persist the TRUE total in the
    // wager column the moment it changes, or every ranking/volume/bounty-
    // meter read of this round would undercount the stake and overstate the
    // player's net win.
    const totalWager = stakedTotal(s, base);

    // Optimistic lock on the previous state blob — a concurrent action on
    // the same round loses the race and errors instead of double-drawing.
    const updated = await tx.gameRound.updateMany({
      where: { id: round.id, outcome: prevOutcome, settled: false },
      data: {
        outcome: JSON.stringify(s),
        settled: done,
        payout,
        wager: totalWager,
        houseTake: done ? totalWager - payout : 0,
      },
    });
    if (updated.count === 0) throw new ApiError("Concurrent action — retry", 409);

    let credits: number | undefined;
    if (payout > 0) {
      credits = await adjustCredits(tx, userId, payout, "payout", round.id);
    }
    return {
      ...publicView({ ...round, wager: totalWager, outcome: JSON.stringify(s), payout }),
      credits,
    };
  });
}

/**
 * Auto-stand an abandoned round so it can settle fairly (used before seed
 * rotation; a revealed seed must never expose a live deck). A split round
 * has two hands to stand — the first stand may hand control to the split
 * hand instead of closing the round.
 */
export async function forceSettle(userId: string, roundId: string) {
  let view = await act(userId, roundId, "stand");
  if (view.phase !== "done") view = await act(userId, roundId, "stand");
  return view;
}
