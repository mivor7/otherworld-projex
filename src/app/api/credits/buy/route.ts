// Buy-to-play: the user pays $RIBBIT in one signed tx that burns a portion
// (deflation) and transfers the rest to the treasury (real house revenue).
// We verify BOTH legs on-chain, enforce that the house actually received its
// configured share, then grant credits. Unique signature prevents replay.
// This is what funds the reward pools — unlike a pure burn, which is destroyed.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyBuyTx } from "@/lib/solana";
import { CONFIG, toRaw } from "@/lib/config";
import { adjustCredits } from "@/lib/credits";

const body = z.object({ signature: z.string().min(64).max(120) });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  if (!CONFIG.treasuryWallet) return err("Buying credits isn't available yet", 400);
  const { signature } = body.parse(await req.json());

  const existing = await prisma.creditPurchase.findUnique({ where: { signature } });
  if (existing) return err("This purchase was already credited", 409);

  const legs = await verifyBuyTx(signature, session.wallet);
  if (!legs) {
    return err(
      "Could not verify a $RIBBIT burn + treasury payment by your wallet in that transaction",
      422
    );
  }
  const { burnedRaw, houseRaw } = legs;
  const ribbitRaw = burnedRaw + houseRaw;

  // The house must actually receive at least its configured share — a player
  // can't buy credits while routing everything to the burn (or nothing to the
  // treasury). Small rounding tolerance.
  const minHouse =
    (ribbitRaw * BigInt(Math.round((1 - CONFIG.buyBurnShare) * 1000))) / 1000n;
  if (houseRaw + houseRaw / 100n < minHouse) {
    return err("Treasury share is below the required split", 422);
  }

  const credits = Number(ribbitRaw / toRaw(CONFIG.ribbitPerCredit));
  if (credits < 1) {
    return err(`Buy at least ${CONFIG.ribbitPerCredit} $RIBBIT for 1 credit`, 422);
  }

  const balance = await prisma.$transaction(async (tx) => {
    await tx.creditPurchase.create({
      data: {
        userId: session.userId,
        signature,
        ribbitRaw,
        burnedRaw,
        houseRaw,
        credits,
      },
    });
    const bal = await adjustCredits(tx, session.userId, credits, "buy", signature);
    // Real revenue into the treasury — the fund that backs reward pools.
    await tx.treasuryEvent.create({
      data: {
        kind: "house_take",
        amount: houseRaw,
        asset: "RIBBIT",
        note: `Credit purchase — house share`,
        ref: signature,
      },
    });
    return bal;
  });

  return ok({ creditsGranted: credits, credits: balance, burnedRaw: burnedRaw.toString(), houseRaw: houseRaw.toString() });
});
