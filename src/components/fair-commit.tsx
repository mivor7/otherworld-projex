"use client";

// The pre-play commitment shown on every table. Before you bet, the house is
// already locked to a secret seed (only its hash is shown); the outcome is that
// seed mixed with YOUR seed, so it can't be chosen to beat you. Labelled plainly
// and with a copy button so it reads as a trust signal, not cryptic fine print —
// the full verification lives at /fairness (now one click).
import Link from "next/link";
import { useSession } from "./session";
import { CopyChip } from "./copy-chip";

export function FairCommit({ clientSeed }: { clientSeed: string }) {
  const { me } = useSession();
  if (!me.signedIn || !me.seedHash) return null;
  return (
    <div
      className="mt-5 pt-4 border-t text-center"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="kicker !text-[0.6rem] mb-1.5">🔒 Provably fair</div>
      <p
        className="text-[0.7rem] mb-2.5 max-w-sm mx-auto leading-relaxed"
        style={{ color: "var(--text-dim)" }}
      >
        This round&apos;s result is locked to a hash the house published{" "}
        <em>before</em> you bet, mixed with your own seed — so it can&apos;t be
        rigged.{" "}
        <Link href="/fairness" className="text-neon hover:underline">
          Verify it →
        </Link>
      </p>
      <div
        className="flex items-center gap-2 justify-center flex-wrap text-[0.65rem]"
        style={{ color: "var(--text-dim)" }}
      >
        <span className="mono break-all">{me.seedHash.slice(0, 16)}…</span>
        <CopyChip text={me.seedHash} label="Copy hash" />
        <span aria-hidden>·</span>
        <span>
          your seed <span className="mono text-frost">{clientSeed}</span>
        </span>
        <Link href="/fairness" className="text-neon hover:underline">
          change
        </Link>
      </div>
    </div>
  );
}
