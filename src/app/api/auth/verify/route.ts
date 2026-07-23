import { z } from "zod";
import { err, handler, ok } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { verifySignInAndCreateSession, isAdminWallet } from "@/lib/session";
import { getBalances } from "@/lib/credits";

const body = z.object({
  wallet: z.string().min(32).max(44),
  signature: z.string().min(1),
});

export const POST = handler(async (req: Request) => {
  // Unauthenticated + does real crypto work (ed25519 verify + upsert) —
  // throttle per IP like the nonce endpoint. A real user signs in once.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  rateLimit(`verify:${ip}`, 20, 60_000);
  const { wallet, signature } = body.parse(await req.json());
  const session = await verifySignInAndCreateSession(wallet, signature);
  if (!session) return err("Signature verification failed", 401);
  const balances = await getBalances(session.userId);
  return ok({ wallet: session.wallet, isAdmin: isAdminWallet(wallet), ...balances });
});
