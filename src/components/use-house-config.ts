"use client";

// Live house parameters for display: starts from the build-time CLIENT_CONFIG
// fallbacks, then refreshes from /api/config (admin-tunable at runtime).
// Anything that PRICES or BUILDS a transaction must not rely on this alone —
// use-chain re-fetches just-in-time; the server always re-verifies.
import { useEffect, useState } from "react";
import { CLIENT_CONFIG } from "@/lib/client-config";

export type LiveHouseConfig = {
  ribbitPerCredit: number;
  buyBurnShare: number;
  houseEdge: number;
  minWager: number;
  maxWager: number;
  rankedMinBurnedRibbit: number;
  rankedMinWindowBurnedRibbit: number;
  rankedMinTableVolume: number;
  gamesPaused: boolean;
  creditSalesPaused: boolean;
};

const FALLBACK: LiveHouseConfig = {
  ribbitPerCredit: CLIENT_CONFIG.ribbitPerCredit,
  buyBurnShare: CLIENT_CONFIG.buyBurnShare,
  houseEdge: CLIENT_CONFIG.houseEdge,
  minWager: 1,
  maxWager: 1_000,
  rankedMinBurnedRibbit: CLIENT_CONFIG.rankedMinBurnedRibbit,
  rankedMinWindowBurnedRibbit: CLIENT_CONFIG.rankedMinWindowBurnedRibbit,
  rankedMinTableVolume: 100,
  gamesPaused: false,
  creditSalesPaused: false,
};

export function useHouseConfig(): LiveHouseConfig {
  const [cfg, setCfg] = useState<LiveHouseConfig>(FALLBACK);
  useEffect(() => {
    let alive = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || typeof d?.ribbitPerCredit !== "number") return;
        setCfg({ ...FALLBACK, ...d });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
