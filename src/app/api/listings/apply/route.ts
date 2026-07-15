import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toRaw } from "@/lib/config";

const body = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(2000),
  imageUrl: z.string().url().max(500).optional().or(z.literal("")),
  category: z.enum(["collectible", "nft", "merch", "service", "other"]),
  askRibbit: z.number().positive().max(1_000_000_000),
  contact: z.string().max(120).optional(),
});

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const data = body.parse(await req.json());

  // One pending application at a time keeps spam manageable.
  const pending = await prisma.listingApplication.count({
    where: { userId: session.userId, status: "pending" },
  });
  if (pending >= 3) {
    return err("You already have 3 applications under review", 429);
  }

  const app = await prisma.listingApplication.create({
    data: {
      userId: session.userId,
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl || null,
      category: data.category,
      askRaw: toRaw(data.askRibbit),
      contact: data.contact,
    },
  });
  return ok({ id: app.id, status: app.status });
});

export const GET = handler(async () => {
  const session = await requireSession();
  const apps = await prisma.listingApplication.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok(apps);
});
