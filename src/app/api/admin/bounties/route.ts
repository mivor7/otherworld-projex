import { z } from "zod";
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";

const body = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(2000),
  game: z.enum(["hopper", "flip", "dice"]).optional(),
  kind: z.enum(["leaderboard", "challenge"]).default("leaderboard"),
  prizeRibbit: z.number().positive(),
  prizeText: z.string().max(120).optional(),
  durationDays: z.number().int().min(1).max(90),
});

export const POST = handler(async (req: Request) => {
  await requireAdmin();
  const data = body.parse(await req.json());
  const bounty = await prisma.bounty.create({
    data: {
      title: data.title,
      description: data.description,
      game: data.game,
      kind: data.kind,
      prizeRibbit: toRaw(data.prizeRibbit),
      prizeText: data.prizeText,
      endsAt: new Date(Date.now() + data.durationDays * 24 * 3600 * 1000),
    },
  });
  return ok({ id: bounty.id });
});
