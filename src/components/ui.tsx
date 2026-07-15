"use client";

import { useEffect, useState } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neon" | "portal" | "gold" | "plain";
}) {
  const toneClass =
    tone === "neon"
      ? "text-neon"
      : tone === "portal"
        ? "text-portal"
        : tone === "gold"
          ? "text-gold"
          : "text-frost";
  return (
    <div className="panel panel-hover px-4 py-4">
      <div className="kicker mb-1.5">{label}</div>
      <div className={`stat-number text-[1.35rem] ${toneClass}`}>{value}</div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          {sub}
        </div>
      )}
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
  if (ms <= 0) return <span className="text-danger stat-number">ended</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const str =
    d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  const urgent = ms < 10 * 60 * 1000;
  return (
    <span className={`stat-number ${urgent ? "text-gold" : "text-frost"}`}>{str}</span>
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
    <div className="mb-7">
      {kicker && <div className="kicker mb-2">{kicker}</div>}
      <h1 className="text-[1.6rem] sm:text-[1.9rem]">{title}</h1>
      {desc && (
        <p className="text-fog mt-2.5 max-w-2xl leading-relaxed text-[0.9375rem]">
          {desc}
        </p>
      )}
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
  const style =
    kind === "ok"
      ? {
          borderColor: "oklch(0.78 0.11 150 / 0.3)",
          color: "var(--color-neon-soft)",
          background: "oklch(0.78 0.11 150 / 0.05)",
        }
      : kind === "err"
        ? {
            borderColor: "oklch(0.64 0.18 25 / 0.35)",
            color: "var(--color-danger)",
            background: "oklch(0.64 0.18 25 / 0.06)",
          }
        : {
            borderColor: "var(--border-solid)",
            color: "var(--color-fog)",
            background: "var(--color-surface)",
          };
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm leading-relaxed"
      style={style}
    >
      {children}
    </div>
  );
}
