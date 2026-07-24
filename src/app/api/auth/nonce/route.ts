import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { buildSignInMessage, issueNonce } from "@/lib/session";

const body = z.object({ wallet: z.string().min(32).max(44) });

export const POST = handler(async (req: Request) => {
  // The only unauthenticated POSTs are the sign-in pair — throttle per IP so a
  // naive flood can't burn CPU/invocations for free. Generous cap: a real user
  // signs in once. (Per-instance mitigation; a WAF rule is the hard backstop.)
  // x-real-ip is set by the platform (not client-forgeable); the leftmost
  // x-forwarded-for token can be prepended by the client, which would hand an
  // attacker a fresh limiter key per request.
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "?";
  rateLimit(`nonce:${ip}`, 30, 60_000);
  const { wallet } = body.parse(await req.json());
  const nonce = await issueNonce(wallet);
  return ok({ message: buildSignInMessage(wallet, nonce) });
});
