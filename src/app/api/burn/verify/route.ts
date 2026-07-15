// Burn-to-play: the user burns $RIBBIT from their own wallet (we never touch
// their keys), then posts the tx signature here. We verify the burn on-chain
// and credit play credits. The unique signature constraint makes replays
// impossible.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyBurnTx } from "@/lib/solana";
import { CONFIG, toRaw } from "@/lib/config";
import { adjustCredits } from "@/lib/credits";

const body = z.object({ signature: z.string().min(64).max(120) });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { signature } = body.parse(await req.json());

  const existing = await prisma.burnEvent.findUnique({ where: { signature } });
  if (existing) return err("This burn was already redeemed", 409);

  const amountRaw = await verifyBurnTx(signature, session.wallet);
  if (amountRaw === null) {
    return err(
      "Could not verify a $RIBBIT burn by your wallet in that transaction",
      422
    );
  }

  const credits = Number(amountRaw / toRaw(CONFIG.ribbitPerCredit));
  if (credits < 1) {
    return err(
      `Burn at least ${CONFIG.ribbitPerCredit} $RIBBIT for 1 credit`,
      422
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.burnEvent.create({
      data: { userId: session.userId, signature, amountRaw, credits },
    });
    const balance = await adjustCredits(tx, session.userId, credits, "burn", signature);
    await tx.treasuryEvent.create({
      data: {
        kind: "deposit",
        amount: amountRaw,
        asset: "RIBBIT_BURNED",
        note: `Burn-to-play: ${credits} credits`,
        ref: signature,
      },
    });
    return balance;
  });

  return ok({ creditsGranted: credits, credits: result });
});
