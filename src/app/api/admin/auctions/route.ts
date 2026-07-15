import { z } from "zod";
import { handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";

const body = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(2000),
  imageUrl: z.string().url().max(500).optional().or(z.literal("")),
  category: z.enum(["collectible", "nft", "merch", "service", "other"]).default("collectible"),
  startBidRibbit: z.number().positive(),
  minIncrementRibbit: z.number().positive(),
  durationHours: z.number().int().min(1).max(14 * 24),
});

export const POST = handler(async (req: Request) => {
  await requireAdmin();
  const data = body.parse(await req.json());
  const auction = await prisma.auction.create({
    data: {
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl || null,
      category: data.category,
      startBidRaw: toRaw(data.startBidRibbit),
      minIncrement: toRaw(data.minIncrementRibbit),
      endsAt: new Date(Date.now() + data.durationHours * 3600 * 1000),
    },
  });
  return ok({ id: auction.id });
});
