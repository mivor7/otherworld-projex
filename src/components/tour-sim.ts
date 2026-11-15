"use client";

// Self-contained client-only simulation store for "Enter the Other World".
// Active ONLY while the interactive tour is running — never touches the backend
// database, wallets, or real balances, and restores clean state on exit.
import { useSyncExternalStore } from "react";
import type { BountyLive, BountyLiveEntry } from "./use-bounty-live";
import type { JustEnded } from "./bounty-ended-card";

export const SIM_WALLET = "7xOWPHunter9kQ2mN8vP3rT6yZ4wA1cE5Sim";
export const SIM_SEED_HASH =
  "8f4e2a91b0c7d34e5f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e";
const OWP_DECIMALS = 6;

export const simRaw = (owp: number): string =>
  String(Math.max(0, Math.round(owp * 10 ** OWP_DECIMALS)));

export interface SimBountyPool {
  id: string;
  title: string;
  round: number;
  prizeRibbit: number;
  mode: "credit" | "time";
  spent: number;
  threshold: number;
  unit: "net $OWP" | "best score";
  yourValue: number;
  rivals: { wallet: string; staker?: boolean; value: number }[];
  justEnded: JustEnded | null;
}

export interface SimBidEntry {
  id: string;
  amountRaw: string;
  status: string;
  createdAt: string;
  bidder: string;
  isYou: boolean;
}

export interface SimAuction {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  category: string;
  sellerWallet: string | null;
  startBidRaw: string;
  minIncrement: string;
  currentRaw: string;
  status: string;
  endsAt: string;
  bids: SimBidEntry[];
}

export interface SimRound {
  id: string;
  game: string;
  wager: number;
  payout: number;
  createdAt: string;
}

export interface SimBountyWin {
  id: string;
  title: string;
  game: string;
  rank: number;
  amountRaw: string;
  status: string;
  signature: string | null;
  createdAt: string;
}

export interface SimWithdrawal {
  id: string;
  amountRaw: string;
  status: string;
  signature: string | null;
  createdAt: string;
  kind?: string;
}

export interface TourSimState {
  active: boolean;
  runKey: number;
  wallet: string;
  walletOwp: number;
  credits: number;
  lockedOwp: number;
  seedHash: string;
  nonce: number;
  bounties: Record<string, SimBountyPool>;
  bountyWins: SimBountyWin[];
  bountyPaidExtra: number;
  auctions: SimAuction[];
  myBids: {
    id: string;
    amountRaw: string;
    status: string;
    auction: {
      id: string;
      title: string;
      status: string;
      endsAt: string;
      currentRaw: string;
    };
  }[];
  withdrawals: SimWithdrawal[];
  rounds: SimRound[];
}

function buildInitialBounties(): Record<string, SimBountyPool> {
  return {
    flip: {
      id: "sim-bounty-flip",
      title: "Frog Flip Streak Pot",
      round: 4,
      prizeRibbit: 5000,
      mode: "credit",
      spent: 2150,
      threshold: 2500,
      unit: "net $OWP",
      yourValue: 120,
      rivals: [
        { wallet: "4mKx…9pRt", staker: true, value: 94 },
        { wallet: "9vQn…2wLc", value: 62 },
        { wallet: "2bDz…7yHs", value: 38 },
      ],
      justEnded: null,
    },
    dice: {
      id: "sim-bounty-dice",
      title: "Pond Dice Sniper Hunt",
      round: 2,
      prizeRibbit: 7500,
      mode: "credit",
      spent: 1700,
      threshold: 2500,
      unit: "net $OWP",
      yourValue: 22,
      rivals: [
        { wallet: "8kPr…3mVx", staker: true, value: 58 },
        { wallet: "5tJw…6nBq", value: 34 },
        { wallet: "3fYc…1rKp", value: 14 },
      ],
      justEnded: null,
    },
    blackjack: {
      id: "sim-bounty-blackjack",
      title: "Blackjack 21 Pot",
      round: 3,
      prizeRibbit: 10000,
      mode: "credit",
      spent: 1350,
      threshold: 2500,
      unit: "net $OWP",
      yourValue: 35,
      rivals: [
        { wallet: "6pLm…4xZd", staker: true, value: 48 },
        { wallet: "1wQs…8cNv", value: 25 },
        { wallet: "9rTa…5bGj", value: 15 },
      ],
      justEnded: null,
    },
    hopper: {
      id: "sim-bounty-hopper",
      title: "Hopper Weekly Crossing",
      round: 7,
      prizeRibbit: 3000,
      mode: "time",
      spent: 0,
      threshold: 0,
      unit: "best score",
      yourValue: 0,
      rivals: [
        { wallet: "4mKx…9pRt", staker: true, value: 90 },
        { wallet: "8kPr…3mVx", value: 75 },
        { wallet: "2bDz…7yHs", value: 55 },
      ],
      justEnded: null,
    },
    frogris: {
      id: "sim-bounty-frogris",
      title: "Frogris Weekly Grid",
      round: 7,
      prizeRibbit: 3500,
      mode: "time",
      spent: 0,
      threshold: 0,
      unit: "best score",
      yourValue: 0,
      rivals: [
        { wallet: "6pLm…4xZd", staker: true, value: 140 },
        { wallet: "9vQn…2wLc", value: 100 },
        { wallet: "3fYc…1rKp", value: 60 },
      ],
      justEnded: null,
    },
    worm: {
      id: "sim-bounty-worm",
      title: "Worm Frog Serpent Race",
      round: 7,
      prizeRibbit: 2500,
      mode: "time",
      spent: 0,
      threshold: 0,
      unit: "best score",
      yourValue: 0,
      rivals: [
        { wallet: "5tJw…6nBq", value: 40 },
        { wallet: "1wQs…8cNv", staker: true, value: 30 },
        { wallet: "8kPr…3mVx", value: 20 },
      ],
      justEnded: null,
    },
  };
}

function buildInitialAuctions(now: number): SimAuction[] {
  const plushEnd = new Date(now + (3 * 60 + 40) * 60_000).toISOString();
  const vaultEnd = new Date(now + 14 * 60 * 60_000).toISOString();
  return [
    {
      id: "sim-lot-croupier-plush",
      title: "Velvet Croupier Frog Plush · 1/1 Prototype",
      description:
        "Hand-stitched emerald velvet mascot with antique gold bowtie — numbered 1/1 house atelier prototype. Winner claims physical shipping or custody swap.",
      imageUrl: "/art/lot-plush.jpg",
      category: "Collectible",
      sellerWallet: null,
      startBidRaw: simRaw(2500),
      minIncrement: simRaw(250),
      currentRaw: simRaw(3450),
      status: "live",
      endsAt: plushEnd,
      bids: [
        {
          id: "sim-bid-1",
          amountRaw: simRaw(3450),
          status: "active",
          createdAt: new Date(now - 9 * 60_000).toISOString(),
          bidder: "9kRx…4pLv",
          isYou: false,
        },
        {
          id: "sim-bid-2",
          amountRaw: simRaw(3000),
          status: "outbid",
          createdAt: new Date(now - 24 * 60_000).toISOString(),
          bidder: "4mKx…9pRt",
          isYou: false,
        },
        {
          id: "sim-bid-3",
          amountRaw: simRaw(2500),
          status: "outbid",
          createdAt: new Date(now - 42 * 60_000).toISOString(),
          bidder: "2bDz…7yHs",
          isYou: false,
        },
      ],
    },
    {
      id: "sim-lot-vault-print",
      title: "House Vault Steel Edition · Signed 1/1",
      description:
        "Gallery-lit archival steel print of the Other World Treasury Vault doors with emerald interior bloom. Signed and numbered 1/1.",
      imageUrl: "/art/lot-vault-print.jpg",
      category: "1/1 Artwork",
      sellerWallet: null,
      startBidRaw: simRaw(4000),
      minIncrement: simRaw(500),
      currentRaw: simRaw(5000),
      status: "live",
      endsAt: vaultEnd,
      bids: [
        {
          id: "sim-bid-v1",
          amountRaw: simRaw(5000),
          status: "active",
          createdAt: new Date(now - 35 * 60_000).toISOString(),
          bidder: "6pLm…4xZd",
          isYou: false,
        },
      ],
    },
  ];
}

function createFreshState(runKey = 0, active = false): TourSimState {
  return {
    active,
    runKey,
    wallet: SIM_WALLET,
    walletOwp: 140_000,
    credits: 10_000,
    lockedOwp: 0,
    seedHash: SIM_SEED_HASH,
    nonce: 14,
    bounties: buildInitialBounties(),
    bountyWins: [],
    bountyPaidExtra: 0,
    auctions: buildInitialAuctions(Date.now()),
    myBids: [],
    withdrawals: [],
    rounds: [],
  };
}

let simState: TourSimState = createFreshState(0, false);
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function setState(next: TourSimState) {
  simState = next;
  emit();
}

export function getTourSimSnapshot(): TourSimState {
  return simState;
}

export function subscribeTourSim(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_SNAPSHOT: TourSimState = createFreshState(0, false);
export function useTourSim(): TourSimState {
  return useSyncExternalStore(
    subscribeTourSim,
    getTourSimSnapshot,
    () => SERVER_SNAPSHOT
  );
}

function clearSimEndedSessionStorage(prevRunKey: number) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`owp:bountyEnded:sim-flip-end-${prevRunKey}`);
    sessionStorage.removeItem("owp:bountyEnded:sim-bounty-flip");
  } catch {
    /* ignore */
  }
}

export function startTourSim(startChapter = 0) {
  const nextKey = simState.runKey + 1;
  clearSimEndedSessionStorage(simState.runKey);
  let next = createFreshState(nextKey, true);

  // If jumping directly to later chapters, pre-seed earlier milestones so every
  // board, bid rail, and account ledger looks rich and internally consistent.
  if (startChapter >= 2) {
    next = applyBountySettle(next, "flip", 1850);
    next = {
      ...next,
      credits: next.credits + 45,
      rounds: [
        {
          id: `sim-rd-flip-${nextKey}`,
          game: "flip",
          wager: 5,
          payout: 32,
          createdAt: new Date(Date.now() - 45_000).toISOString(),
        },
        ...next.rounds,
      ],
    };
  }
  if (startChapter >= 3) {
    next = {
      ...next,
      credits: next.credits + 83,
      bounties: {
        ...next.bounties,
        dice: { ...next.bounties.dice, spent: 1980, yourValue: 105 },
      },
      rounds: [
        {
          id: `sim-rd-dice-${nextKey}`,
          game: "dice",
          wager: 10,
          payout: 40,
          createdAt: new Date(Date.now() - 32_000).toISOString(),
        },
        ...next.rounds,
      ],
    };
  }
  if (startChapter >= 4) {
    next = {
      ...next,
      credits: next.credits + 20,
      bounties: {
        ...next.bounties,
        blackjack: { ...next.bounties.blackjack, spent: 1580, yourValue: 55 },
      },
      rounds: [
        {
          id: `sim-rd-bj-${nextKey}`,
          game: "blackjack",
          wager: 20,
          payout: 40,
          createdAt: new Date(Date.now() - 20_000).toISOString(),
        },
        ...next.rounds,
      ],
    };
  }
  if (startChapter >= 5) {
    next = {
      ...next,
      bounties: {
        ...next.bounties,
        hopper: { ...next.bounties.hopper, yourValue: 320 },
      },
    };
  }
  if (startChapter >= 6) {
    next = {
      ...next,
      bounties: {
        ...next.bounties,
        frogris: { ...next.bounties.frogris, yourValue: 200 },
      },
    };
  }
  if (startChapter >= 7) {
    next = {
      ...next,
      bounties: {
        ...next.bounties,
        worm: { ...next.bounties.worm, yourValue: 60 },
      },
    };
  }
  setState(next);
  if (startChapter >= 8) {
    simPlaceBid("sim-lot-croupier-plush", 3795);
  }
}

export function stopTourSim() {
  if (!simState.active) return;
  clearSimEndedSessionStorage(simState.runKey);
  setState(createFreshState(simState.runKey, false));
}

function applyBountySettle(
  state: TourSimState,
  game: string,
  awardRibbit: number
): TourSimState {
  const pool = state.bounties[game];
  if (!pool) return state;
  const endedId = `sim-flip-end-${state.runKey}`;
  const nowIso = new Date().toISOString();
  const nextPool: SimBountyPool = {
    ...pool,
    round: pool.round + 1,
    spent: 120,
    yourValue: 0,
    justEnded: {
      id: endedId,
      title: pool.title,
      round: pool.round,
      outcome: "paid",
      prizeRibbit: pool.prizeRibbit,
      winners: 4,
      you: { won: true, rank: 1, amountRibbit: awardRibbit },
      next: { round: pool.round + 1, autoRenew: true },
    },
  };
  return {
    ...state,
    credits: state.credits + awardRibbit,
    bountyPaidExtra: state.bountyPaidExtra + awardRibbit,
    bounties: { ...state.bounties, [game]: nextPool },
    bountyWins: [
      {
        id: `sim-win-${state.runKey}-${pool.round}`,
        title: pool.title,
        game,
        rank: 1,
        amountRaw: simRaw(awardRibbit),
        status: "paid",
        signature: `5xOWP${state.runKey}BountyPaidFlip${pool.round}Sim`,
        createdAt: nowIso,
      },
      ...state.bountyWins,
    ],
  };
}

export function simBuyOwp(owpAmount: number) {
  if (!simState.active || owpAmount <= 0) return;
  setState({
    ...simState,
    walletOwp: simState.walletOwp + Math.round(owpAmount),
  });
}

export function simCreditDelta(delta: number) {
  if (!simState.active) return;
  setState({
    ...simState,
    credits: Math.max(0, simState.credits + Math.round(delta)),
  });
}

export function simRoundPlay(params: {
  game: "flip" | "dice" | "blackjack";
  wager: number;
  payout: number;
  creditDelta: number;
  deltaNet: number;
  potAdvance: number;
}) {
  if (!simState.active) return;
  const { game, wager, payout, creditDelta, deltaNet, potAdvance } = params;
  const pool = simState.bounties[game];
  let next: TourSimState = {
    ...simState,
    credits: Math.max(0, simState.credits + Math.round(creditDelta)),
    nonce: simState.nonce + 1,
    rounds: [
      {
        id: `sim-rd-${game}-${simState.nonce + 1}`,
        game,
        wager,
        payout,
        createdAt: new Date().toISOString(),
      },
      ...simState.rounds,
    ].slice(0, 12),
  };

  if (pool) {
    const nextSpent = pool.spent + potAdvance;
    next = {
      ...next,
      bounties: {
        ...next.bounties,
        [game]: {
          ...pool,
          spent: nextSpent,
          yourValue: pool.yourValue + deltaNet,
        },
      },
    };
    if (pool.mode === "credit" && nextSpent >= pool.threshold) {
      next = applyBountySettle(next, game, 1850);
    }
  }
  setState(next);
}

export function simArcadeScore(
  game: "hopper" | "frogris" | "worm",
  score: number
) {
  if (!simState.active || score <= 0) return;
  const pool = simState.bounties[game];
  if (!pool) return;
  setState({
    ...simState,
    bounties: {
      ...simState.bounties,
      [game]: {
        ...pool,
        yourValue: Math.max(pool.yourValue, score),
      },
    },
  });
}

export function simPlaceBid(
  auctionId: string,
  amountOwp: number
): { ok: boolean; error?: string } {
  if (!simState.active) return { ok: false, error: "Tour inactive" };
  if (amountOwp > simState.credits) {
    return { ok: false, error: "Not enough available $OWP" };
  }
  const idx = simState.auctions.findIndex((a) => a.id === auctionId);
  if (idx === -1) return { ok: false, error: "Lot not found" };
  const target = simState.auctions[idx];
  const nowIso = new Date().toISOString();
  const amountRaw = simRaw(amountOwp);

  // Refund any prior active bid we held on the same lot
  const prevYou = target.bids.find((b) => b.isYou && b.status === "active");
  const prevYouOwp = prevYou ? Number(prevYou.amountRaw) / 10 ** OWP_DECIMALS : 0;

  const nextBids: SimBidEntry[] = [
    {
      id: `sim-bid-you-${Date.now()}`,
      amountRaw,
      status: "active",
      createdAt: nowIso,
      bidder: `${SIM_WALLET.slice(0, 4)}…${SIM_WALLET.slice(-4)}`,
      isYou: true,
    },
    ...target.bids.map((b) =>
      b.status === "active" ? { ...b, status: "outbid" } : b
    ),
  ];

  const nextLot: SimAuction = {
    ...target,
    currentRaw: amountRaw,
    bids: nextBids,
  };
  const nextAuctions = [...simState.auctions];
  nextAuctions[idx] = nextLot;

  const nextMyBids = [
    {
      id: `sim-mybid-${auctionId}`,
      amountRaw,
      status: "active",
      auction: {
        id: nextLot.id,
        title: nextLot.title,
        status: nextLot.status,
        endsAt: nextLot.endsAt,
        currentRaw: amountRaw,
      },
    },
    ...simState.myBids.filter((b) => b.auction.id !== auctionId),
  ];

  setState({
    ...simState,
    credits: simState.credits + prevYouOwp - amountOwp,
    lockedOwp: simState.lockedOwp - prevYouOwp + amountOwp,
    auctions: nextAuctions,
    myBids: nextMyBids,
  });
  return { ok: true };
}

export function simWithdrawAll(): { ok: boolean; amount: number } {
  if (!simState.active || simState.credits <= 0) {
    return { ok: false, amount: 0 };
  }
  const amount = simState.credits;
  const wdId = `sim-wd-${simState.runKey}-${Date.now()}`;
  const runKey = simState.runKey;
  setState({
    ...simState,
    credits: 0,
    walletOwp: simState.walletOwp + amount,
    withdrawals: [
      {
        id: wdId,
        amountRaw: simRaw(amount),
        status: "processing",
        signature: null,
        createdAt: new Date().toISOString(),
      },
      ...simState.withdrawals,
    ],
  });

  setTimeout(() => {
    if (!simState.active || simState.runKey !== runKey) return;
    setState({
      ...simState,
      withdrawals: simState.withdrawals.map((w) =>
        w.id === wdId
          ? { ...w, status: "sent", signature: `3xOWPWithdraw${runKey}SentSim` }
          : w
      ),
    });
  }, 600);

  return { ok: true, amount };
}

export function findSimAuction(id: string): SimAuction | null {
  return simState.auctions.find((a) => a.id === id) ?? null;
}

export function computeRankedEntries(pool: SimBountyPool): {
  entries: BountyLiveEntry[];
  yourRank: number | null;
  projectedRibbit: number;
} {
  const list: { wallet: string; staker?: boolean; value: number; isYou: boolean }[] =
    pool.rivals.map((r) => ({ ...r, isYou: false }));
  if (pool.yourValue > 0) {
    list.push({
      wallet: `${SIM_WALLET.slice(0, 4)}…${SIM_WALLET.slice(-4)}`,
      staker: true,
      value: pool.yourValue,
      isYou: true,
    });
  }
  list.sort((a, b) => b.value - a.value);
  const totalPos = list.reduce((s, r) => s + Math.max(1, r.value), 0);

  let yourRank: number | null = null;
  let projectedRibbit = 0;
  const entries: BountyLiveEntry[] = list.map((item, idx) => {
    const share =
      totalPos > 0
        ? Math.round((Math.max(1, item.value) / totalPos) * pool.prizeRibbit)
        : 0;
    const rank = idx + 1;
    if (item.isYou) {
      yourRank = rank;
      projectedRibbit = share;
    }
    return {
      rank,
      wallet: item.wallet,
      staker: item.staker,
      value: item.value,
      projectedRibbit: share,
      isYou: item.isYou,
    };
  });
  return { entries, yourRank, projectedRibbit };
}

export function toBountyLiveSnapshot(
  game: string,
  state: TourSimState
): BountyLive | null {
  const pool = state.bounties[game];
  if (!pool) return null;
  const { entries, projectedRibbit } = computeRankedEntries(pool);
  const pct =
    pool.mode === "credit" && pool.threshold > 0
      ? Math.min(100, Math.round((pool.spent / pool.threshold) * 100))
      : 0;

  return {
    bounty: {
      id: pool.id,
      title: pool.title,
      round: pool.round,
      autoRenew: true,
      prizeRibbit: pool.prizeRibbit,
      prizeText: null,
      autoPay: true,
      unit: pool.unit,
      progress:
        pool.mode === "credit"
          ? {
              mode: "credit",
              spent: pool.spent,
              threshold: pool.threshold,
              pct,
              potRibbit: pool.spent,
              targetRibbit: pool.threshold,
            }
          : {
              mode: "time",
              endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            },
    },
    entries,
    you: {
      inRunning: pool.yourValue > 0,
      value: pool.yourValue,
      unit: pool.unit,
      projectedRibbit,
      spendEligible: true,
      lifetimeEligible: true,
      windowEligible: true,
      lifetimeSpent: 2500,
      windowSpent: 500,
      volumeEligible: true,
      windowWagered: 500,
    },
    justEnded: pool.justEnded,
  };
}
