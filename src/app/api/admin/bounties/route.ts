import { z } from "zod";
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";
import { ARCADE_GAMES, requiredCreditSpend } from "@/lib/bounty";

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

// Full bounty list for the admin manage panel — every status, with award
// counts so the UI knows what's editable/deletable.
export const GET = handler(async () => {
  await requireAdmin();
  const bounties = await prisma.bounty.findMany({
    orderBy: [{ status: "asc" }, { endsAt: "asc" }],
    take: 60,
    include: { _count: { select: { awards: true } } },
  });
  return ok(
    bounties.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      target: b.target,
      game: b.game,
      kind: b.kind,
      prizeRibbit: Number(b.prizeRibbit / 10n ** 6n),
      prizeText: b.prizeText,
      status: b.status,
      autoPay: b.autoPay,
      triggerCreditVolume: b.triggerCreditVolume,
      endsAt: b.endsAt,
      awards: b._count.awards,
    }))
  );
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
    data.autoPay && isCreditGame ? await requiredCreditSpend(prizeRaw) : null;

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
