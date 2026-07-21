"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";
import { useSession } from "./session";
import { NotificationBell } from "./notification-bell";
import { useNotifications } from "./use-notifications";
import { SealMark } from "./seal";

const LINKS = [
  { href: "/games", label: "Arcade" },
  { href: "/auctions", label: "Auction House" },
  { href: "/bounties", label: "Bounties" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/treasury", label: "Treasury" },
  { href: "/fairness", label: "Fairness" },
  { href: "/about", label: "About" },
];

export function Navbar() {
  const pathname = usePathname();
  const { me } = useSession();
  const { adminTotal } = useNotifications();

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        background: "oklch(0.12 0.008 270 / 0.85)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2.5 min-w-0 group">
          <SealMark size={38} />
          <span className="leading-none min-w-0">
            <span
              className="block font-semibold tracking-tight text-[0.95rem] truncate"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Other World Projex
            </span>
            <span className="kicker mt-0.5 !text-[0.6rem] hidden sm:block">
              The $RIBBIT house
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 ml-6 flex-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md text-[0.85rem] font-medium tracking-tight transition-colors ${
                pathname.startsWith(l.href)
                  ? "text-frost"
                  : "text-fog hover:text-frost"
              }`}
              style={
                pathname.startsWith(l.href)
                  ? { background: "oklch(1 0 0 / 0.07)" }
                  : undefined
              }
            >
              {l.label}
            </Link>
          ))}
          {me.isAdmin && (
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-md text-[0.85rem] font-medium ${
                pathname.startsWith("/admin") ? "text-portal" : "text-portal/60 hover:text-portal"
              }`}
            >
              Admin
              <AdminBadge n={adminTotal} />
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <NotificationBell />
          <WalletButton />
        </div>
      </div>

      <nav
        className="md:hidden flex gap-0.5 px-3 pb-2 overflow-x-auto mobile-nav-scroll"
        aria-label="Sections"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-[0.82rem] whitespace-nowrap ${
              pathname.startsWith(l.href) ? "text-frost" : "text-fog"
            }`}
            style={
              pathname.startsWith(l.href)
                ? { background: "oklch(1 0 0 / 0.07)" }
                : undefined
            }
          >
            {l.label}
          </Link>
        ))}
        {me.isAdmin && (
          <Link href="/admin" className="px-3 py-1 text-[0.82rem] text-portal whitespace-nowrap">
            Admin
            <AdminBadge n={adminTotal} />
          </Link>
        )}
      </nav>
    </header>
  );
}

/** Red count of admin action-items, inline so it never clips in the mobile
    horizontal-scroll nav. Renders nothing when the queue is empty. */
function AdminBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span
      className="ml-1.5 inline-grid place-items-center min-w-[16px] h-4 px-1 rounded-full text-[0.6rem] font-bold align-middle"
      style={{ background: "var(--color-danger)", color: "white" }}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}
