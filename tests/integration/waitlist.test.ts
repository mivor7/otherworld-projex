import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { claimWaitlistPlace } from "@/lib/waitlist";
import { HAS_DB } from "./helpers";

const tag = `wl-${randomUUID().slice(0, 8)}`;
const wallet = (n: number | string) => `${tag}-${n}`;
const claim = (w: string, referredBy: string | null = null) =>
  claimWaitlistPlace({ wallet: w, displayName: w, referredBy, heldRibbitRaw: 250_000_000_000n });

describe.skipIf(!HAS_DB)("waitlist places", () => {
  afterAll(async () => {
    await prisma.waitlistEntry.deleteMany({ where: { wallet: { startsWith: tag } } });
  });

  it("gives concurrent joiners distinct positions", async () => {
    const entries = await Promise.all(Array.from({ length: 25 }, (_, i) => claim(wallet(i))));
    const positions = entries.map((e) => e.position);
    expect(new Set(positions).size).toBe(25);
    // Everyone landed directly after the previous last place: no gaps, no ties.
    const sorted = [...positions].sort((a, b) => a - b);
    expect(sorted[24] - sorted[0]).toBe(24);
  });

  it("gives one wallet one place however many times it asks at once", async () => {
    const w = wallet("double-tap");
    const entries = await Promise.all(Array.from({ length: 10 }, () => claim(w)));
    expect(new Set(entries.map((e) => e.id)).size).toBe(1);
    expect(await prisma.waitlistEntry.count({ where: { wallet: w } })).toBe(1);
  });

  it("counts each referral once", async () => {
    const referrer = wallet("referrer");
    await claim(referrer);
    await Promise.all(Array.from({ length: 6 }, (_, i) => claim(wallet(`ref-${i}`), referrer)));
    // A repeat join by an already-listed wallet must not credit the referrer again.
    await claim(wallet("ref-0"), referrer);
    const row = await prisma.waitlistEntry.findFirstOrThrow({ where: { wallet: referrer } });
    expect(row.referrals).toBe(6);
  });
});
