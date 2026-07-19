// Player management: look a wallet up, ban/unban it, or adjust its credits.
//   GET  ?wallet=…            → profile with balances + activity counts
//   POST {wallet, action:"ban"|"unban"}
//   POST {wallet, action:"credits", delta, note}  → ledger-logged adjustment
// Bans block sign-in AND bite live sessions (requireSession re-checks).
// Credit adjustments go through the same guarded ledger as everything else —
// a negative delta can never overdraw.
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { adjustCredits, InsufficientCredits } from "@/lib/credits";
import { fromRaw } from "@/lib/config";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const wallet = new URL(req.url).searchParams.get("wallet")?.trim();
  if (!wallet) return err("Provide ?wallet=");
  const user = await prisma.user.findUnique({
    where: { wallet },
    include: {
      _count: {
        select: { burns: true, purchases: true, rounds: true, scores: true, bids: true, withdrawals: true },
      },
    },
  });
  if (!user) return err("No player with that wallet", 404);

  const [burnAgg, buyAgg] = await Promise.all([
    prisma.burnEvent.aggregate({ where: { userId: user.id }, _sum: { amountRaw: true } }),
    prisma.creditPurchase.aggregate({ where: { userId: user.id }, _sum: { ribbitRaw: true } }),
  ]);

  return ok({
    wallet: user.wallet,
    isBanned: user.isBanned,
    credits: user.credits,
    ribbitBalance: user.ribbitBalance.toString(),
    ribbitLocked: user.ribbitLocked.toString(),
    burnedRibbit: Math.round(fromRaw(burnAgg._sum.amountRaw ?? 0n)),
    boughtRibbit: Math.round(fromRaw(buyAgg._sum.ribbitRaw ?? 0n)),
    createdAt: user.createdAt,
    counts: user._count,
  });
});

const postBody = z.object({
  wallet: z.string().min(32).max(44),
  action: z.enum(["ban", "unban", "credits"]),
  delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  note: z.string().max(200).optional(),
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const data = postBody.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { wallet: data.wallet } });
  if (!user) return err("No player with that wallet", 404);

  if (data.action === "ban" || data.action === "unban") {
    if (user.wallet === admin.wallet) return err("You can't ban yourself");
    await prisma.user.update({
      where: { id: user.id },
      data: { isBanned: data.action === "ban" },
    });
    return ok({ isBanned: data.action === "ban" });
  }

  // credits adjustment — comps, support refunds, corrections. Ledger-logged
  // with the admin's wallet + note for the audit trail.
  if (!data.delta) return err("Provide a non-zero delta");
  try {
    const balance = await prisma.$transaction((tx) =>
      adjustCredits(
        tx,
        user.id,
        data.delta!,
        "admin",
        `by ${admin.wallet.slice(0, 8)}: ${data.note ?? "no note"}`
      )
    );
    return ok({ credits: balance });
  } catch (e) {
    if (e instanceof InsufficientCredits) {
      return err("Player doesn't have that many credits to remove", 409);
    }
    throw e;
  }
});
