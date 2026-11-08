"use client";

// Buy $OWP with SOL. The connected wallet pays the house wallet. The server
// prices the payment at the pump.fun spot, and that same wallet sends $OWP.
import { useCallback, useEffect, useState } from "react";
import { CLIENT_CONFIG, shortWallet } from "@/lib/client-config";
import { owpRawForQuote } from "@/lib/owp-quote";
import { Notice } from "@/components/ui";
import { useSession } from "@/components/session";
import { useChain } from "@/components/use-chain";

type Price =
  | {
      available: true;
      decimals: number;
      lamportsPerWhole: string;
      solPerToken: number;
      source: "bonding-curve" | "pump-amm";
      virtualToken: string | null;
      virtualSol: string | null;
      houseOwp: number | null;
      treasuryWallet: string;
    }
  | { available: false; reason: string; treasuryWallet: string };

const PRESETS = [0.05, 0.1, 0.5, 1];

function fmtPrice(sol: number): string {
  if (!Number.isFinite(sol) || sol <= 0) return "—";
  if (sol < 0.0001) return sol.toExponential(3);
  return sol.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtOwp(whole: number): string {
  return whole.toLocaleString(undefined, { maximumFractionDigits: whole >= 100 ? 0 : 2 });
}

export function BuyOwp() {
  const { me } = useSession();
  const { buyOwpWithSol } = useChain();
  const [price, setPrice] = useState<Price | null>(null);
  const [sol, setSol] = useState(0.1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owp/price");
      if (!res.ok) throw new Error("price");
      setPrice(await res.json());
    } catch {
      setPrice({
        available: false,
        reason: "Could not read the pump.fun price. Try again in a moment.",
        treasuryWallet: "",
      });
    }
  }, []);

  useEffect(() => {
    // The quote lands after the fetch, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const quote = price?.available ? price : null;
  const lamports = Number.isFinite(sol) && sol > 0 ? BigInt(Math.round(sol * 1_000_000_000)) : 0n;
  const estimate =
    quote && lamports > 0n ? Number(owpRawForQuote(lamports, quote)) / 10 ** quote.decimals : 0;
  const treasury = quote?.treasuryWallet || price?.treasuryWallet || "";
  const soldOut = quote?.houseOwp === 0;
  const canBuy =
    !!quote &&
    !soldOut &&
    quote.houseOwp != null &&
    me.signedIn &&
    sol >= 0.01 &&
    sol <= 50 &&
    estimate > 0 &&
    quote.houseOwp >= estimate;

  async function buy() {
    setBusy(true);
    setMessage(null);
    const res = await buyOwpWithSol(sol);
    setBusy(false);
    if (!res.ok) {
      setMessage({ kind: "err", text: res.error });
      return;
    }
    const raw = res.data.owpRaw;
    const decimals = quote?.decimals ?? CLIENT_CONFIG.ribbitDecimals;
    const whole =
      typeof raw === "string" || typeof raw === "number" ? Number(raw) / 10 ** decimals : estimate;
    if (res.data.alreadyRedeemed) {
      setMessage({ kind: "ok", text: "This payment was already accepted. The house wallet sends the $OWP." });
    } else {
      setMessage({
        kind: "ok",
        text: `Payment confirmed. The house wallet will send ${fmtOwp(whole)} $OWP to your wallet.`,
      });
    }
    load();
  }

  return (
    <section id="buy" className="mt-10" style={{ scrollMarginTop: "6rem" }}>
      <div className="panel panel-glow p-5 sm:p-8">
        <div className="kicker mb-2">Buy $OWP</div>
        <h2 className="text-[1.5rem] mb-2">Buy from the house wallet</h2>
        <p className="text-fog text-[0.9375rem] leading-relaxed max-w-xl mb-5">
          Pay SOL from your wallet. The house wallet sends $OWP at the current
          pump.fun price. The amount locks in when the payment confirms — it
          does not arrive in the same click.
        </p>

        {!price ? (
          <p className="text-sm text-fog">Reading the pump.fun price…</p>
        ) : !price.available ? (
          <Notice kind="info">{price.reason}</Notice>
        ) : (
          <>
            <div className="flex flex-wrap gap-6 mb-5">
              <div>
                <div className="kicker !text-[0.6rem] mb-1">Price</div>
                <div className="stat-number text-neon text-lg">
                  {fmtPrice(price.solPerToken)} SOL
                </div>
                <p className="text-xs text-fog mt-1">
                  per $OWP · {price.source === "pump-amm" ? "PumpSwap" : "pump.fun curve"}
                </p>
              </div>
              <div>
                <div className="kicker !text-[0.6rem] mb-1">House wallet holds</div>
                <div className="stat-number text-lg">
                  {price.houseOwp == null
                    ? "—"
                    : price.houseOwp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <p className="text-xs text-fog mt-1">$OWP ready to send</p>
              </div>
            </div>

            {soldOut && (
              <div className="mb-4">
                <Notice kind="info">
                  The house wallet has no $OWP to sell right now. Tokens still
                  sitting in the pump.fun curve are not part of this balance.
                </Notice>
              </div>
            )}
            {price.houseOwp == null && (
              <div className="mb-4">
                <Notice kind="info">
                  Could not read how much $OWP the house wallet holds, so buying
                  is paused until that balance is visible.
                </Notice>
              </div>
            )}

            <label className="kicker !text-[0.6rem]" htmlFor="buy-sol">
              You pay
            </label>
            <div className="flex gap-2 mt-1.5 mb-2">
              <input
                id="buy-sol"
                type="number"
                className="input"
                min={0.01}
                max={50}
                step={0.01}
                aria-label="SOL to pay for $OWP"
                value={Number.isFinite(sol) ? sol : ""}
                onChange={(e) => setSol(Number(e.target.value))}
              />
              <button className="btn btn-primary" onClick={buy} disabled={busy || !canBuy}>
                {busy ? "…" : "Buy"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => setSol(n)}
                >
                  {n} SOL
                </button>
              ))}
            </div>

            <p className="text-sm mb-1">
              <span className="text-fog">You receive about </span>
              <span className="stat-number text-neon">{estimate > 0 ? fmtOwp(estimate) : "—"} $OWP</span>
            </p>
            <p className="text-xs text-fog mb-4 max-w-xl">
              {treasury
                ? `SOL goes to ${shortWallet(treasury)}, the house wallet. That wallet sends the $OWP.`
                : "The house wallet is not set, so buys are closed."}{" "}
              Minimum 0.01 SOL, maximum 50 SOL.
            </p>

            {!me.signedIn && (
              <Notice kind="info">Connect your wallet and sign in, top right, before buying.</Notice>
            )}
          </>
        )}

        {message && (
          <div className="mt-4">
            <Notice kind={message.kind}>{message.text}</Notice>
          </div>
        )}

        <div className="mt-5">
          <a href={CLIENT_CONFIG.pumpFunUrl} target="_blank" rel="noreferrer" className="btn btn-ghost text-xs">
            Or trade on pump.fun ↗
          </a>
        </div>
      </div>
    </section>
  );
}
