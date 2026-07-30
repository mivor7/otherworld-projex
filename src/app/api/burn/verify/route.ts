// Burn-to-play (pre-treasury fallback only): the user burns $RIBBIT and posts
// the tx signature; we verify it on-chain and grant credits. Once a treasury
// exists, credits must come through /api/credits/buy instead — the split (part
// burned, part to the house) is what funds the reward economy, and a pure burn
// would let a player get credits while giving the house nothing. So this route
// only grants credits when no treasury is configured.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyBurnTx } from "@/lib/solana";
import { CONFIG, toRaw } from "@/lib/config";
import { adjustCredits } from "@/lib/credits";
import { houseConfig } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({ signature: z.string().min(64).max(120) });

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  // With a treasury live, credits are bought (split burn/house), not pure-
  // burned — enforced here so the UI path can't be bypassed by calling the
  // endpoint directly.
  if (CONFIG.treasuryWallet) {
    return err("Buy chips instead — burning-only is disabled", 400);
  }
  const cfg = await houseConfig();
  if (cfg.creditSalesPaused) {
    return err("Chip sales are paused — back shortly", 423);
  }
  const { signature } = body.parse(await req.json());

  const existing = await prisma.burnEvent.findUnique({ where: { signature } });
  if (existing) return err("This burn was already redeemed", 409);

  // RPC-lookup guard — same generous budget as the buy path so a real
  // payment's retries are never blocked from redeeming.
  rateLimit(`chain-verify:${session.userId}`, 30, 60_000);
  const amountRaw = await verifyBurnTx(signature, session.wallet);
  if (amountRaw === null) {
    return err(
      "Could not verify a $RIBBIT burn by your wallet in that transaction",
      422
    );
  }

  const credits = Number(amountRaw / toRaw(cfg.ribbitPerCredit));
  if (credits < 1) {
    return err(
      `Burn at least ${cfg.ribbitPerCredit} $RIBBIT for 1 credit`,
      422
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // FIRST write: the shared cross-path redemption guard (see schema note).
    await tx.redeemedSignature.create({ data: { signature, kind: "burn" } });
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
