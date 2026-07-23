import { z } from "zod";
import { err, handler, ok } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { verifySignInAndCreateSession, isAdminWallet } from "@/lib/session";
import { getBalances } from "@/lib/credits";

const body = z.object({
  wallet: z.string().min(32).max(44),
  signature: z.string().min(1),
  inviteCode: z.string().max(64).optional(),
});

// Client matches on these exact strings to decide whether to show the
// invite-code input — keep them stable.
const REASON_MSG: Record<string, { msg: string; status: number }> = {
  "bad-signature": { msg: "Signature verification failed", status: 401 },
  banned: { msg: "This wallet is suspended", status: 403 },
  "invite-required": {
    msg: "Invite required — enter an invite code to join",
    status: 403,
  },
  "invite-invalid": {
    msg: "Invite code invalid — it may be used up or disabled",
    status: 403,
  },
};

export const POST = handler(async (req: Request) => {
  // Unauthenticated + does real crypto work (ed25519 verify + upsert) —
  // throttle per IP like the nonce endpoint. A real user signs in once.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  rateLimit(`verify:${ip}`, 20, 60_000);
  const { wallet, signature, inviteCode } = body.parse(await req.json());
  const result = await verifySignInAndCreateSession(wallet, signature, inviteCode);
  if (!result.ok) {
    const m = REASON_MSG[result.reason] ?? REASON_MSG["bad-signature"];
    return err(m.msg, m.status);
  }
  const balances = await getBalances(result.userId);
  return ok({ wallet: result.wallet, isAdmin: isAdminWallet(wallet), ...balances });
});
