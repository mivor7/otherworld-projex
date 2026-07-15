import { z } from "zod";
import { err, handler, ok } from "@/lib/api";
import { verifySignInAndCreateSession, isAdminWallet } from "@/lib/session";
import { getBalances } from "@/lib/credits";

const body = z.object({
  wallet: z.string().min(32).max(44),
  signature: z.string().min(1),
});

export const POST = handler(async (req: Request) => {
  const { wallet, signature } = body.parse(await req.json());
  const session = await verifySignInAndCreateSession(wallet, signature);
  if (!session) return err("Signature verification failed", 401);
  const balances = await getBalances(session.userId);
  return ok({ wallet: session.wallet, isAdmin: isAdminWallet(wallet), ...balances });
});
