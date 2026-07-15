"use client";

// Sandbox bankroll — practice credits that live in localStorage. No wallet,
// no $RIBBIT, no server round-trips; "Play now, no wallet needed."
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

  const reset = useCallback(() => {
    localStorage.setItem(KEY, String(START));
    setCredits(START);
  }, []);

  return { credits, adjust, reset };
}
