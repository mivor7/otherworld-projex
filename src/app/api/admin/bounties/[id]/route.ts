// Manage one bounty: edit it, close it early, cancel it, delete it, or award
// & pay the prize. Awarding recomputes the authoritative ranking server-side
// and queues real $RIBBIT payouts — see lib/bounty.awardBounty. Editing the
// prize of an auto-pay credit-game bounty re-derives its spend trigger, so
// the house-margin guarantee always holds.
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";
import { ARCADE_GAMES, awardBounty, requiredCreditSpend } from "@/lib/bounty";

const body = z.object({
  action: z.enum(["edit", "close", "cancel", "delete", "award"]),
  // Award only: prize split by percentage across the top places (sums to 100).
  splits: z.array(z.number().positive()).min(1).max(10).optional(),
  // Edit only — all optional; only provided fields change.
  title: z.string().min(3).max(80).optional(),
  description: z.string().min(10).max(2000).optional(),
  target: z.string().max(80).nullable().optional(),
  prizeRibbit: z.number().positive().max(1_000_000_000).optional(),
  seedRibbit: z.number().min(0).max(1_000_000_000).optional(),
  prizeText: z.string().max(120).nullable().optional(),
  autoPay: z.boolean().optional(),
  // Owner's re-open switch — editable while the bounty is live, so the
  // current round can be made the last one before it settles.
  autoRenew: z.boolean().optional(),
  // Extend (or shorten, negative) the deadline by this many days.
  extendDays: z.number().int().min(-90).max(90).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = body.parse(await req.json());

    if (data.action === "award") {
      const result = await awardBounty(id, data.splits ?? [100]);
      return ok(result);
    }

    const bounty = await prisma.bounty.findUnique({
      where: { id },
      include: { _count: { select: { awards: true } } },
    });
    if (!bounty) return err("Bounty not found", 404);

    if (data.action === "edit") {
      // A paid bounty is an immutable record of what was paid and why.
      if (bounty.status === "paid") return err("Paid bounties cannot be edited", 409);

      const prizeRaw =
        data.prizeRibbit !== undefined ? toRaw(data.prizeRibbit) : bounty.prizeRibbit;
      const seedRaw =
        data.seedRibbit !== undefined ? toRaw(data.seedRibbit) : bounty.seedRibbit;
      if (seedRaw > 0n && seedRaw >= prizeRaw) {
        return err("Seed must be smaller than the prize");
      }
      const autoPay = data.autoPay ?? bounty.autoPay;
      // Re-derive the pot trigger whenever prize/seed/autoPay change on a
      // credit-game bounty — never trust a client-supplied threshold.
      const isCreditGame = !!bounty.game && !ARCADE_GAMES.has(bounty.game);
      const triggerCreditVolume =
        autoPay && isCreditGame ? await requiredCreditSpend(prizeRaw, seedRaw) : null;

      const updated = await prisma.bounty.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.target !== undefined ? { target: data.target } : {}),
          ...(data.prizeRibbit !== undefined ? { prizeRibbit: prizeRaw } : {}),
          ...(data.seedRibbit !== undefined ? { seedRibbit: seedRaw } : {}),
          ...(data.prizeText !== undefined ? { prizeText: data.prizeText } : {}),
          ...(data.autoRenew !== undefined ? { autoRenew: data.autoRenew } : {}),
          ...(data.autoPay !== undefined ||
          data.prizeRibbit !== undefined ||
          data.seedRibbit !== undefined
            ? { autoPay, triggerCreditVolume }
            : {}),
          ...(data.extendDays
            ? { endsAt: new Date(bounty.endsAt.getTime() + data.extendDays * 864e5) }
            : {}),
        },
      });
      return ok({
        status: updated.status,
        triggerCreditVolume: updated.triggerCreditVolume,
        endsAt: updated.endsAt,
      });
    }

    if (data.action === "delete") {
      // Deleting is for mistakes and drafts — never for anything that has
      // paid out. Awards/withdrawals are immutable audit records.
      if (bounty.status === "paid" || bounty._count.awards > 0) {
        return err("This bounty has payouts — cancel it instead of deleting", 409);
      }
      await prisma.bounty.delete({ where: { id } });
      return ok({ deleted: true });
    }

    if (bounty.status === "paid") return err("Bounty already paid", 409);

    if (data.action === "close") {
      const claimed = await prisma.bounty.updateMany({
        where: { id, status: "open" },
        data: { status: "closed", endsAt: new Date() },
      });
      if (claimed.count === 0) return err("Bounty is not open", 409);
      return ok({ status: "closed" });
    }

    // cancel — no payout, board archived
    const claimed = await prisma.bounty.updateMany({
      where: { id, status: { in: ["open", "closed"] } },
      data: { status: "cancelled", endsAt: new Date() },
    });
    if (claimed.count === 0) return err("Bounty cannot be cancelled", 409);
    return ok({ status: "cancelled" });
  }
);
