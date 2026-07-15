"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { Notice, SectionTitle } from "@/components/ui";

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

  const load = () => {
    fetch("/api/fairness")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => {
    if (me.signedIn) load();
  }, [me.signedIn]);

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

  const verify = async () => {
    const digest = await hmacSha256Hex(vSeed.trim(), `${vClient.trim()}:${vNonce}`);
    const roll = parseInt(digest.slice(0, 8), 16) / 0x100000000;
    setVResult({ roll, digest });
  };

  return (
    <div className="pt-10 max-w-3xl mx-auto">
      <SectionTitle
        kicker="Commit–reveal"
        title="Provable fairness 🔍"
        desc="Before you play a single round, the server commits to a secret seed by publishing its SHA-256 hash. Outcomes are HMAC-SHA256(serverSeed, clientSeed:nonce) — the house cannot bend a roll without breaking its own commitment."
      />

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
        </ol>
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
          <button className="btn btn-primary" onClick={verify} disabled={!vSeed || !vClient}>
            Recompute roll
          </button>
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
    </div>
  );
}
