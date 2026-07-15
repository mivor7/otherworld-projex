"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { WalletButton } from "./wallet-button";
import { useSession } from "./session";

const LINKS = [
  { href: "/games", label: "Games" },
  { href: "/auctions", label: "Auctions" },
  { href: "/bounties", label: "Bounties" },
  { href: "/treasury", label: "Treasury" },
  { href: "/fairness", label: "Fairness" },
];

export function Navbar() {
  const pathname = usePathname();
  const { me } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-abyss/85 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Logo size={34} />
          <span className="font-bold tracking-tight leading-none">
            Other World{" "}
            <span className="neon-text">Projex</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                pathname.startsWith(l.href)
                  ? "text-neon bg-surface-2"
                  : "text-fog hover:text-frost"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {me.isAdmin && (
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-md text-sm ${
                pathname.startsWith("/admin") ? "portal-text" : "text-portal/70 hover:text-portal"
              }`}
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
      <nav className="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1 rounded-md text-sm whitespace-nowrap ${
              pathname.startsWith(l.href) ? "text-neon bg-surface-2" : "text-fog"
            }`}
          >
            {l.label}
          </Link>
        ))}
        {me.isAdmin && (
          <Link href="/admin" className="px-3 py-1 text-sm text-portal">
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}
