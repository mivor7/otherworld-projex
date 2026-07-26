"use client";

// One shared live-bounty poll per game, however many components consume it.
// Table pages mount two (GameBountyStrip + BountyStandings) — before this hook
// each ran its own 8s interval, so every viewer issued identical duplicate
// requests. Now the first subscriber starts the poll, later ones piggyback on
// the same data, and the last one out stops it. Also refreshes on the app-wide
// "owp:round" signal the games fire when a round/score lands.
import { useEffect, useState } from "react";
import type { JustEnded } from "./bounty-ended-card";

export type BountyLiveProgress =
  | {
      mode: "credit";
      spent: number;
      threshold: number;
      pct: number;
      potRibbit?: number;
      targetRibbit?: number;
      seedRibbit?: number;
    }
  | { mode: "time"; endsAt: string }
  | null;

export type BountyLiveYou = {
  inRunning: boolean;
  value: number;
  unit: "net credits" | "best score";
  projectedRibbit: number;
  spendEligible: boolean;
  lifetimeEligible: boolean;
  windowEligible: boolean;
  lifetimeSpent: number;
  windowSpent: number;
  // Optional: older cached payloads may lack them — treat absence as eligible.
  volumeEligible?: boolean;
  windowWagered?: number;
};

export type BountyLiveEntry = {
  rank: number;
  wallet: string;
  value: number;
  projectedRibbit: number;
  isYou: boolean;
};

export type BountyLive = {
  bounty: {
    id: string;
    title: string;
    prizeRibbit: number;
    prizeText: string | null;
    autoPay: boolean;
    unit: string;
    progress: BountyLiveProgress;
  } | null;
  entries: BountyLiveEntry[];
  you: BountyLiveYou | null;
  justEnded?: JustEnded | null;
};

// 15s is plenty for a slow-filling meter — and the owp:round listener refreshes
// instantly when the viewer's own round/score lands, so their numbers never lag.
const POLL_MS = 15_000;

type Slot = {
  data: BountyLive | null;
  subs: Set<(d: BountyLive) => void>;
  timer: ReturnType<typeof setInterval> | null;
  onRound: (() => void) | null;
};
const slots = new Map<string, Slot>();

function load(game: string, slot: Slot) {
  fetch(`/api/bounties/live?game=${encodeURIComponent(game)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: BountyLive | null) => {
      if (!d) return;
      slot.data = d;
      slot.subs.forEach((fn) => fn(d));
    })
    .catch(() => {});
}

export function useBountyLive(game: string): BountyLive | null {
  const [live, setLive] = useState<BountyLive | null>(null);

  useEffect(() => {
    let slot = slots.get(game);
    if (!slot) {
      slot = { data: null, subs: new Set(), timer: null, onRound: null };
      slots.set(game, slot);
    }
    slot.subs.add(setLive);
    // Late subscriber catches up on data an earlier one already fetched.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (slot.data) setLive(slot.data);
    if (!slot.timer) {
      load(game, slot);
      const s = slot;
      s.timer = setInterval(() => load(game, s), POLL_MS);
      s.onRound = () => load(game, s);
      window.addEventListener("owp:round", s.onRound);
    }
    return () => {
      const s = slots.get(game);
      if (!s) return;
      s.subs.delete(setLive);
      if (s.subs.size === 0) {
        if (s.timer) clearInterval(s.timer);
        if (s.onRound) window.removeEventListener("owp:round", s.onRound);
        s.timer = null;
        s.onRound = null;
        // Drop the snapshot too — a later remount should fetch fresh rather
        // than flash stale standings / a stale "just ended" card.
        s.data = null;
      }
    };
  }, [game]);

  return live;
}
