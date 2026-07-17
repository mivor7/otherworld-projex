"use client";

// Sandbox bankroll — practice credits that live in localStorage. No wallet,
// no $RIBBIT, no server round-trips, and no limits: the bankroll quietly
// refills itself whenever it can't cover the next wager, so free players can
// practice forever. The running number is just for fun between refills.
import { useCallback, useEffect, useState } from "react";

const KEY = "owp-practice-credits";
const START = 100;

export function usePractice() {
  const [credits, setCredits] = useState(START);

  useEffect(() => {
    const stored = Number(localStorage.getItem(KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCredits(Number.isFinite(stored) && stored > 0 ? stored : START);
  }, []);

  const adjust = useCallback((delta: number) => {
    setCredits((c) => {
      const next = Math.max(0, c + delta);
      localStorage.setItem(KEY, String(next));
      return next;
    });
  }, []);

  /** Bottomless bankroll: top up so `amount` is always coverable. */
  const ensure = useCallback((amount: number) => {
    setCredits((c) => {
      if (c >= amount) return c;
      const next = Math.max(START, amount);
      localStorage.setItem(KEY, String(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.setItem(KEY, String(START));
    setCredits(START);
  }, []);

  return { credits, adjust, ensure, reset };
}
