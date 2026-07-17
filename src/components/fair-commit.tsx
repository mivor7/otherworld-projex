"use client";

// The pre-play commitment line shown on every table: the hash the house is
// locked to, the nonce the next round will use, and the player's own seed —
// everything needed to verify the round later, visible BEFORE betting.
import Link from "next/link";
import { useSession } from "./session";

export function FairCommit({ clientSeed }: { clientSeed: string }) {
  const { me } = useSession();
  if (!me.signedIn || !me.seedHash) return null;
  return (
    <p
      className="mono text-[0.68rem] mt-5 text-center break-all leading-relaxed"
      style={{ color: "var(--text-dim)" }}
    >
      committed hash {me.seedHash.slice(0, 20)}… · next nonce {me.nonce} · your
      seed “{clientSeed}” ·{" "}
      <Link href="/fairness" className="text-neon hover:underline">
        change seed / verify
      </Link>
    </p>
  );
}
