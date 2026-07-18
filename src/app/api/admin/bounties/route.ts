import { z } from "zod";
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";
import { ARCADE_GAMES, computeTriggerCreditVolume } from "@/lib/bounty";

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
});

export const POST = handler(async (req: Request) => {
  await requireAdmin();
  const data = body.parse(await req.json());
  const prizeRaw = toRaw(data.prizeRibbit);
  // Credit-game auto-bounties get their spend threshold derived from the
  // prize (server-authoritative) so the play that unlocks it always earns
  // the house more than it pays. Free games are time-based (weekly).
  const isCreditGame = !!data.game && !ARCADE_GAMES.has(data.game);
  const triggerCreditVolume =
    data.autoPay && isCreditGame ? computeTriggerCreditVolume(prizeRaw) : null;

  const bounty = await prisma.bounty.create({
    data: {
      title: data.title,
      description: data.description,
      target: data.target,
      game: data.game,
      kind: data.kind,
      prizeRibbit: prizeRaw,
      prizeText: data.prizeText,
      autoPay: data.autoPay,
      triggerCreditVolume,
      endsAt: new Date(Date.now() + data.durationDays * 24 * 3600 * 1000),
    },
  });
  return ok({ id: bounty.id, triggerCreditVolume });
});
