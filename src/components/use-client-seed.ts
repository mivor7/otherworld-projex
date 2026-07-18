"use client";

// The player's half of the fairness equation. Outcomes are
// HMAC(serverSeed, `${clientSeed}:${nonce}`) — because the player picks this
// seed AFTER the server committed to its hash, the house can't have
// precomputed anything against it. Persisted so it's stable across rounds
// and auditable from round history.
import { useCallback, useEffect, useState } from "react";

const KEY = "owp-client-seed";

export function randomClientSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function useClientSeed() {
  const [seed, setSeedState] = useState("");

  useEffect(() => {
    let s = localStorage.getItem(KEY);
    if (!s) {
      s = randomClientSeed();
      localStorage.setItem(KEY, s);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeedState(s);
  }, []);

  const setSeed = useCallback((value: string) => {
    const v = value.slice(0, 64);
    localStorage.setItem(KEY, v);
    setSeedState(v);
  }, []);

  const randomize = useCallback(() => {
    const v = randomClientSeed();
    localStorage.setItem(KEY, v);
    setSeedState(v);
  }, []);

  // Empty until hydration reads localStorage — callers fall back to
  // randomClientSeed() at USE time. Never generate here: a per-render random
  // value breaks hydration and gives the UI a moving target.
  return { seed, setSeed, randomize, ready: seed !== "" };
}
