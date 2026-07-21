"use client";

// The bell in the navbar: a red count of things worth your attention, and a
// dropdown that splits "needs your action" (admin queue) from "your activity"
// (personal money events). Opening it clears the personal unread mark. Renders
// nothing until you're signed in.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "./session";
import { useNotifications, type Notif } from "./use-notifications";

const fmt = (n: number) => n.toLocaleString();

const ICON: Record<Notif["type"], string> = {
  bounty_win: "🏆",
  payout_sent: "🪙",
  payout_rejected: "⚠️",
  auction_won: "🔨",
};
const ADMIN_ICON: Record<string, string> = {
  bounties: "🏁",
  withdrawals: "💸",
  applications: "📝",
  fulfillment: "📦",
};
const TONE: Record<string, string> = {
  gold: "text-gold",
  neon: "text-neon",
  danger: "text-danger",
  portal: "text-portal",
};

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const { me } = useSession();
  const { items, adminItems, attention, markSeen } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!me.signedIn) return null;

  const toggle = () => {
    setOpen((o) => {
      if (!o) markSeen(); // opening clears the personal unread mark
      return !o;
    });
  };

  const badge = attention > 9 ? "9+" : String(attention);
  const empty = items.length === 0 && adminItems.length === 0;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={attention > 0 ? `${attention} notifications` : "Notifications"}
        aria-expanded={open}
        className="relative grid place-items-center h-9 w-9 rounded-lg text-fog hover:text-frost transition-colors"
        style={open ? { background: "oklch(1 0 0 / 0.07)" } : undefined}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {attention > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full text-[0.6rem] font-bold leading-none"
            style={{ background: "var(--color-danger)", color: "white" }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{
            width: "min(92vw, 360px)",
            background: "oklch(0.13 0.008 270 / 0.98)",
            border: "1px solid var(--hairline-strong)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <span className="text-sm font-semibold tracking-tight">Notifications</span>
          </div>

          <div className="max-h-[68vh] overflow-y-auto py-1.5">
            {empty && (
              <p className="px-4 py-8 text-center text-sm text-fog">
                You&apos;re all caught up.
              </p>
            )}

            {adminItems.length > 0 && (
              <>
                <div className="kicker px-4 pt-2 pb-1">Needs your action</div>
                {adminItems.map((a) => (
                  <Link
                    key={a.id}
                    href={a.href}
                    onClick={close}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="text-base leading-none">{ADMIN_ICON[a.id] ?? "•"}</span>
                    <span className="text-sm flex-1 min-w-0 truncate">{a.title}</span>
                    <span
                      className={`stat-number text-xs ${TONE[a.tone] ?? "text-frost"}`}
                    >
                      {a.count}
                    </span>
                  </Link>
                ))}
                {items.length > 0 && (
                  <div className="kicker px-4 pt-3 pb-1">Your activity</div>
                )}
              </>
            )}

            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={close}
                className="flex gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors"
              >
                <span className="text-base leading-none mt-0.5">{ICON[n.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate">{n.title}</span>
                    {n.amountRibbit != null && (
                      <span className={`ml-auto stat-number text-xs whitespace-nowrap ${TONE[n.tone] ?? "text-frost"}`}>
                        +{fmt(n.amountRibbit)}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-fog mt-0.5 leading-snug">{n.body}</span>
                  <span className="block text-[0.65rem] mt-1" style={{ color: "var(--text-dim)" }}>
                    {ago(n.time)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
