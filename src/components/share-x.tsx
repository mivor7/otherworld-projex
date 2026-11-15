"use client";

import Link from "next/link";

const DEFAULT_ORIGIN = "https://www.otherworldprojex.xyz";

export function ShareOnX({
  text,
  path = "/",
  label = "Post on X",
  className = "btn btn-ghost !text-xs",
}: {
  text: string;
  /** Relative path (e.g. "/waitlist?ref=...") or full URL. */
  path?: string;
  label?: string;
  className?: string;
}) {
  const onClick = () => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : DEFAULT_ORIGIN;
    const url = path.startsWith("http")
      ? path
      : `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
    const intent = new URL("https://x.com/intent/tweet");
    intent.searchParams.set("text", text);
    intent.searchParams.set("url", url);
    window.open(intent.toString(), "_blank", "noopener,noreferrer,width=600,height=520");
  };

  return (
    <button type="button" onClick={onClick} className={className}>
      <span aria-hidden="true" className="font-mono text-[0.78rem] leading-none">
        𝕏
      </span>
      <span>{label}</span>
    </button>
  );
}

/**
 * Shown right after a winning practice round in Sandbox mode so guests who
 * test the tables get a direct, zero-confusion path to buying/depositing $OWP.
 */
export function SandboxWinPrompt({
  payout,
  gameName,
}: {
  payout: number;
  gameName: string;
}) {
  if (payout <= 0) return null;
  return (
    <div
      className="mt-4 rounded-lg p-3.5 text-left flex flex-wrap items-center justify-between gap-3"
      style={{
        background: "oklch(0.78 0.11 150 / 0.07)",
        border: "1px solid oklch(0.78 0.11 150 / 0.28)",
      }}
    >
      <div className="text-xs leading-relaxed text-fog max-w-md">
        <span className="text-neon font-medium">
          +{payout.toLocaleString()} $OWP in practice.
        </span>{" "}
        On the live {gameName} table, wins pay withdrawable $OWP and every wager
        feeds the open bounty pot.
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/#buy" className="btn btn-primary !text-xs !py-1.5 !px-3">
          Buy $OWP
        </Link>
        <Link href="/games" className="btn btn-ghost !text-xs !py-1.5 !px-3">
          Deposit →
        </Link>
      </div>
    </div>
  );
}
