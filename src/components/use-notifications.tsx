"use client";

// Notifications state, polled once for the whole app and shared via context so
// the bell (personal feed) and the admin nav dot (action queue) never double-
// poll. Events are derived server-side from existing rows; the only per-user
// state is "when did I last open the bell", which is device-local (localStorage)
// — no server round-trip, no schema, matches the app's compute-live ethos.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "./session";

export type Notif = {
  id: string;
  type: "bounty_win" | "payout_sent" | "payout_rejected" | "auction_won";
  time: string;
  title: string;
  body: string;
  amountRibbit?: number;
  href: string;
  tone: "gold" | "neon" | "danger" | "portal";
  signature?: string | null;
};

export type AdminItem = {
  id: string;
  count: number;
  title: string;
  href: string;
  tone: "gold" | "portal" | "neon";
};

type Ctx = {
  items: Notif[];
  adminItems: AdminItem[];
  adminTotal: number;
  /** Personal events newer than the last time the bell was opened, this device. */
  personalUnread: number;
  /** Personal + admin — the single number on the bell. */
  attention: number;
  markSeen: () => void;
};

const SEEN_KEY = "owp:notifs:seenAt";
const POLL_MS = 30_000;

const NotifCtx = createContext<Ctx | null>(null);

export function useNotifications(): Ctx {
  const ctx = useContext(NotifCtx);
  if (!ctx) throw new Error("useNotifications outside NotificationsProvider");
  return ctx;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const [items, setItems] = useState<Notif[]>([]);
  const [adminItems, setAdminItems] = useState<AdminItem[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [seenAt, setSeenAt] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Read the last-seen watermark once, on the client only (avoids an SSR
  // hydration mismatch). Until then we report 0 unread so no wrong dot flashes.
  useEffect(() => {
    let v = 0;
    try {
      const stored = localStorage.getItem(SEEN_KEY);
      if (stored === null) {
        // FIRST EVER load on this device: start the watermark at NOW and
        // persist it. Without this, a watermark of 0 marks every event in the
        // 60-day lookback as unread — so a new device, a cleared cache, a
        // private window, or the installed PWA lights the bell with a pile of
        // OLD, already-known events that no amount of refreshing clears
        // (only opening the panel does). Only genuinely new events should
        // ever ring.
        v = Date.now();
        localStorage.setItem(SEEN_KEY, String(v));
      } else {
        v = Number(stored) || 0;
      }
    } catch {
      /* private mode / storage disabled — nothing to remember, so treat
         everything as already seen rather than crying wolf every load */
      v = Date.now();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeenAt(v);
    setHydrated(true);
  }, []);

  const load = useCallback(() => {
    if (!me.signedIn) {
      setItems([]);
      setAdminItems([]);
      setAdminTotal(0);
      return;
    }
    fetch("/api/me/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setItems(d.items ?? []))
      .catch(() => {});
    if (me.isAdmin) {
      fetch("/api/admin/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setAdminItems(d.items ?? []);
          setAdminTotal(d.total ?? 0);
        })
        .catch(() => {});
    } else {
      setAdminItems([]);
      setAdminTotal(0);
    }
  }, [me.signedIn, me.isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const personalUnread = hydrated
    ? items.filter((i) => new Date(i.time).getTime() > seenAt).length
    : 0;

  const markSeen = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* ignore */
    }
    setSeenAt(now);
  }, []);

  return (
    <NotifCtx.Provider
      value={{
        items,
        adminItems,
        adminTotal,
        personalUnread,
        attention: personalUnread + adminTotal,
        markSeen,
      }}
    >
      {children}
    </NotifCtx.Provider>
  );
}
