// Buy $OWP from the house wallet. The user pays SOL to that wallet; this
// route prices the payment at the live Raydium spot and queues a payout.
// The web server never holds the key — the payout worker sends the tokens.
import { z } from "zod";
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CONFIG } from "@/lib/config";
import { owpRawForQuote } from "@/lib/owp-quote";
import { owpQuote } from "@/lib/owp-price";
import { rateLimit } from "@/lib/ratelimit";
import { verifySolPayment } from "@/lib/solana";

const body = z.object({ signature: z.string().min(64).max(120) });

function maxBuyWhole(): number {
  const whole = Number(process.env.MAX_BUY_OWP ?? 1_000_000_000);
  return Number.isFinite(whole) && whole > 0 ? Math.round(whole) : 1_000_000_000;
}

export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  const { signature } = body.parse(await req.json());
  rateLimit(`chain-verify:${session.userId}`, 30, 60_000);

  if (!CONFIG.treasuryWallet) return err("The house wallet is not set.", 503);

  const used = await prisma.redeemedSignature.findUnique({ where: { signature } });
  if (used) return err("Already processed — this was submitted before", 409);

  const payment = await verifySolPayment(signature, session.wallet);
  if (payment.status === "pending" || payment.status === "no-payment") {
    return err("Could not verify a SOL payment to the house wallet in that transaction", 422);
  }
  if (payment.status === "too-small") return err("Minimum buy is 0.01 SOL.", 422);
  if (payment.status === "too-large") return err("Maximum buy is 50 SOL.", 422);

  const quote = await owpQuote({ fresh: true });
  if (!quote.available) {
    return err("Could not verify the Raydium price yet. Try again in a moment.", 503);
  }
  if (quote.houseOwp === null) {
    return err("Could not verify the house $OWP balance yet. Try again in a moment.", 503);
  }

  const owpRaw = owpRawForQuote(payment.lamports, quote);
  if (owpRaw <= 0n) {
    return err("That payment is too small to buy any $OWP at the current price.", 422);
  }
  const limit = maxBuyWhole();
  if (owpRaw > BigInt(limit) * 10n ** BigInt(quote.decimals)) {
    return err(`That buy is above the house limit of ${limit.toLocaleString()} $OWP.`, 422);
  }
  const houseRaw = BigInt(Math.floor(quote.houseOwp * 10 ** quote.decimals));
  if (houseRaw < owpRaw) {
    return err("The house wallet does not hold enough $OWP to fill this buy yet.", 409);
  }

  // Price and inventory checks happen BEFORE the signature is consumed, so a
  // failed quote leaves the SOL payment redeemable on a later try.
  const purchase = await prisma.$transaction(async (tx) => {
    await tx.redeemedSignature.create({ data: { signature, kind: "owp-buy" } });
    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: session.userId,
        amountRaw: owpRaw,
        destination: session.wallet,
        kind: "buy",
      },
    });
    const row = await tx.owpPurchase.create({
      data: {
        userId: session.userId,
        paySignature: signature,
        solLamports: payment.lamports,
        owpRaw,
        withdrawalId: withdrawal.id,
      },
    });
    await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { ref: row.id },
    });
    await tx.treasuryEvent.create({
      data: {
        kind: "deposit",
        amount: payment.lamports,
        asset: "SOL",
        note: `SOL for $OWP from ${session.wallet.slice(0, 4)}…`,
        ref: signature,
      },
    });
    return row;
  });

  return ok({
    solLamports: purchase.solLamports,
    owpRaw: purchase.owpRaw,
    withdrawalId: purchase.withdrawalId,
  });
});
