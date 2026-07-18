import { z } from "zod";
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";

const body = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(2000),
  target: z.string().max(80).optional(),
  game: z.enum(["hopper", "frogris", "worm", "flip", "dice", "blackjack"]).optional(),
  kind: z.enum(["leaderboard", "challenge"]).default("leaderboard"),
  prizeRibbit: z.number().positive(),
  prizeText: z.string().max(120).optional(),
  durationDays: z.number().int().min(1).max(90),
  autoPay: z.boolean().default(false),
  // Credit-spend threshold that triggers auto-payout (credit games only).
  triggerCreditVolume: z.number().int().positive().max(1_000_000_000).optional(),
});

export const POST = handler(async (req: Request) => {
  await requireAdmin();
  const data = body.parse(await req.json());
  const bounty = await prisma.bounty.create({
    data: {
      title: data.title,
      description: data.description,
      target: data.target,
      game: data.game,
      kind: data.kind,
      prizeRibbit: toRaw(data.prizeRibbit),
      prizeText: data.prizeText,
      autoPay: data.autoPay,
      // Threshold only applies to credit-game auto-bounties; free games are
      // time-based (weekly) and ignore it.
      triggerCreditVolume:
        data.autoPay && data.game && !["hopper", "frogris", "worm"].includes(data.game)
          ? (data.triggerCreditVolume ?? null)
          : null,
      endsAt: new Date(Date.now() + data.durationDays * 24 * 3600 * 1000),
    },
  });
  return ok({ id: bounty.id });
});
