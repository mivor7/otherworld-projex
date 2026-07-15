"use client";

import { useEffect, useState } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "neon",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neon" | "portal" | "gold" | "plain";
}) {
  const toneClass =
    tone === "neon" ? "neon-text" : tone === "portal" ? "portal-text" : tone === "gold" ? "text-gold" : "text-frost";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-fog mb-1">{label}</div>
      <div className={`stat-number text-2xl ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-fog mt-1">{sub}</div>}
    </div>
  );
}

export function Countdown({ to }: { to: string | Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className="text-danger">ended</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const str =
    d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  const urgent = ms < 10 * 60 * 1000;
  return (
    <span className={`stat-number ${urgent ? "text-danger" : "text-neon"}`}>{str}</span>
  );
}

export function SectionTitle({
  kicker,
  title,
  desc,
}: {
  kicker?: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-6">
      {kicker && (
        <div className="text-xs uppercase tracking-[0.2em] text-neon mb-1.5">{kicker}</div>
      )}
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      {desc && <p className="text-fog mt-2 max-w-2xl leading-relaxed">{desc}</p>}
    </div>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: "ok" | "err" | "info";
  children: React.ReactNode;
}) {
  const cls =
    kind === "ok"
      ? "border-neon-dim text-neon-soft bg-neon/5"
      : kind === "err"
        ? "border-danger/40 text-danger bg-danger/5"
        : "border-edge-bright text-fog bg-surface-2";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}
