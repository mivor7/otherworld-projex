import { z } from "zod";
import { handler, ok, requireSession } from "@/lib/api";
import { placeBid } from "@/lib/auctions";

const body = z.object({
  // Raw token units as a string to avoid float precision issues.
  amountRaw: z.string().regex(/^[0-9]{1,24}$/),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { id } = await ctx.params;
    const { amountRaw } = body.parse(await req.json());
    const result = await placeBid(session.userId, id, BigInt(amountRaw));
    return ok(result);
  }
);
