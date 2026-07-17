"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { PageHero } from "@/components/hero";
import { Notice } from "@/components/ui";
import { useClientSeed } from "@/components/use-client-seed";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type FairnessData = {
  activeHash: string;
  nextNonce: number;
  revealed: { seed: string; seedHash: string; nonce: number; revealedAt: string }[];
};

export default function FairnessPage() {
  const { me } = useSession();
  const [data, setData] = useState<FairnessData | null>(null);
  const [rotateMsg, setRotateMsg] = useState<string | null>(null);

  // Verifier inputs
  const [vSeed, setVSeed] = useState("");
  const [vClient, setVClient] = useState("");
  const [vNonce, setVNonce] = useState(0);
  const [vResult, setVResult] = useState<{ roll: number; digest: string } | null>(null);
  const [deck, setDeck] = useState<string[] | null>(null);
  const { seed: myClientSeed, setSeed: setMyClientSeed, randomize } = useClientSeed();

  const load = () => {
    fetch("/api/fairness")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => {
    if (me.signedIn) load();
  }, [me.signedIn]);

  // Deep-link prefill: /fairness?seed=…&client=…&nonce=… from round history.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("seed");
    const c = p.get("client");
    const n = p.get("nonce");
    // Mount-time init from the URL, not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setVSeed(s);
    if (c) setVClient(c);
    if (n && Number.isFinite(Number(n))) setVNonce(Number(n));
  }, []);

  const rotate = async () => {
    const res = await fetch("/api/fairness/rotate", { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      setRotateMsg(
        d.revealedSeed
          ? `Seed revealed: ${d.revealedSeed}`
          : "New seed committed."
      );
      load();
    }
  };

  // Blackjack: re-derive the full committed deck order in the browser —
  // the same Fisher\u2013Yates walk the server ran at deal time.
  const deriveDeck = async () => {
    const d = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 51; i > 0; i--) {
      const digest = await hmacSha256Hex(
        vSeed.trim(),
        `${vClient.trim()}:${vNonce}:${51 - i}`
      );
      const r = parseInt(digest.slice(0, 8), 16) / 0x100000000;
      const j = Math.floor(r * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    setDeck(d.map((c) => `${RANKS[c % 13]}${SUITS[Math.floor(c / 13)]}`));
  };

  const verify = async () => {
    const digest = await hmacSha256Hex(vSeed.trim(), `${vClient.trim()}:${vNonce}`);
    const roll = parseInt(digest.slice(0, 8), 16) / 0x100000000;
    setVResult({ roll, digest });
  };

  return (
    <div className="pt-6 max-w-3xl mx-auto">
      <PageHero
        compact
        image="/art/hero-atelier.jpg"
        kicker="Commit–reveal"
        badge="Verifiable by anyone"
        title="Provable"
        titleAccent="fairness"
        subtitle="Before you play a single round, the house commits to a secret seed by publishing its SHA-256 hash. Outcomes are HMAC-SHA256(serverSeed, clientSeed:nonce) — the house cannot bend a roll without breaking its own commitment."
      />
      <div className="mb-6" />

      <div className="panel p-6 mb-6">
        <h3 className="font-bold mb-3">How to verify any round</h3>
        <ol className="text-sm text-fog space-y-2 leading-relaxed list-decimal ml-4">
          <li>Note the seed hash shown with each round you play.</li>
          <li>Rotate your seed below — the old seed is revealed.</li>
          <li>Check SHA-256(revealed seed) equals the hash you saw.</li>
          <li>
            Recompute HMAC-SHA256(seed, <code>clientSeed:nonce</code>): the first 8 hex
            chars ÷ 2³² give the roll. Flip wins under 0.5 for frog; dice wins when
            roll × 100 is under your target.
          </li>
          <li>
            Blackjack: the deck is a Fisher–Yates shuffle whose i-th swap uses the
            roll from HMAC-SHA256(seed, <code>clientSeed:nonce:i</code>) — re-derive all
            52 cards and compare with the hand you were dealt. Open hands block seed
            rotation so a reveal can never expose a live deck.
          </li>
        </ol>
      </div>

      <div className="panel p-6 mb-6">
        <h3 className="font-bold mb-1">Your client seed</h3>
        <p className="text-sm text-fog mb-4 leading-relaxed">
          Half of every roll is yours. This seed is mixed into each outcome —
          set it to anything <em>after</em> the house has committed and the
          server seed can&apos;t have been picked around it. Stored only in your
          browser.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            className="input flex-1 min-w-48"
            maxLength={64}
            value={myClientSeed}
            onChange={(e) => setMyClientSeed(e.target.value)}
            aria-label="Your client seed"
          />
          <button className="btn btn-ghost" onClick={randomize}>
            Randomize
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
          Used by Frog Flip, Pond Dice and Blackjack from your next round. It
          appears in each round&apos;s record so anyone can recompute the result.
        </p>
      </div>

      {me.signedIn && data && (
        <div className="panel panel-glow p-6 mb-6">
          <h3 className="font-bold mb-3">Your current commitment</h3>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-fog">Active seed hash: </span>
              <code className="stat-number text-neon break-all">{data.activeHash}</code>
            </div>
            <div>
              <span className="text-fog">Next nonce: </span>
              <span className="stat-number">{data.nextNonce}</span>
            </div>
          </div>
          <button className="btn btn-ghost mt-4" onClick={rotate}>
            Rotate seed & reveal previous
          </button>
          {rotateMsg && (
            <div className="mt-3">
              <Notice kind="ok">
                <span className="break-all">{rotateMsg}</span>
              </Notice>
            </div>
          )}
          {data.revealed.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs uppercase tracking-wider text-fog mb-2">
                Revealed seeds
              </h4>
              <div className="space-y-2 text-xs">
                {data.revealed.map((s) => (
                  <div key={s.seedHash} className="panel p-3 break-all">
                    <div>
                      <span className="text-fog">seed:</span>{" "}
                      <code className="text-neon-soft">{s.seed}</code>
                    </div>
                    <div>
                      <span className="text-fog">hash:</span>{" "}
                      <code>{s.seedHash}</code>
                    </div>
                    <div className="text-fog">rounds played: {s.nonce}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="panel p-6">
        <h3 className="font-bold mb-4">Independent verifier (runs in your browser)</h3>
        <div className="space-y-3">
          <input
            className="input"
            placeholder="Revealed server seed (hex)"
            value={vSeed}
            onChange={(e) => setVSeed(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              className="input"
              placeholder="Client seed"
              value={vClient}
              onChange={(e) => setVClient(e.target.value)}
            />
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Nonce"
              value={vNonce}
              onChange={(e) => setVNonce(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" onClick={verify} disabled={!vSeed || !vClient}>
              Recompute roll
            </button>
            <button
              className="btn btn-ghost"
              onClick={deriveDeck}
              disabled={!vSeed || !vClient}
              title="Re-derive the committed blackjack deck for this seed/nonce"
            >
              Derive blackjack deck
            </button>
          </div>
          {deck && (
            <Notice kind="info">
              <div className="text-xs">
                <div className="mb-2">
                  Committed deck order — deal goes <strong>you, dealer,
                  you, dealer&nbsp;(hole)</strong>, then hits continue from the
                  5th card:
                </div>
                <div className="mono leading-relaxed break-words">
                  {deck.map((c, i) => (
                    <span
                      key={i}
                      className={
                        c.includes("♥") || c.includes("♦")
                          ? "text-danger"
                          : undefined
                      }
                    >
                      {i > 0 && " "}
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </Notice>
          )}
          {vResult && (
            <Notice kind="info">
              <div className="break-all text-xs">
                <div>
                  digest: <code>{vResult.digest}</code>
                </div>
                <div className="mt-1 text-base">
                  roll ={" "}
                  <span className="stat-number text-neon">{vResult.roll.toFixed(8)}</span>{" "}
                  → dice value {(vResult.roll * 100).toFixed(2)} · flip lands{" "}
                  {vResult.roll < 0.5 ? "🐸 frog" : "🪰 fly"}
                </div>
              </div>
            </Notice>
          )}
        </div>
      </div>

      <div className="panel p-6 mt-6">
        <h3 className="font-bold mb-3">What about the arcade episodes?</h3>
        <p className="text-sm text-fog leading-relaxed">
          Worm Frog, Frogris and Lily Hopper are games of skill — there is no
          house randomness to commit to. Instead, each run gets a signed run
          token, and for Worm Frog your inputs are recorded and{" "}
          <strong className="text-frost">replayed move-by-move on the
          server</strong>, which recomputes the score itself and rejects
          anything that doesn&apos;t reproduce — including runs faster than
          real time. Leaderboard and bounty placements only count for wallets
          with real burned $RIBBIT behind them.
        </p>
      </div>
    </div>
  );
}
