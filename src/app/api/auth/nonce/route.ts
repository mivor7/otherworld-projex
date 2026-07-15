import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { buildSignInMessage, issueNonce } from "@/lib/session";

const body = z.object({ wallet: z.string().min(32).max(44) });

export const POST = handler(async (req: Request) => {
  const { wallet } = body.parse(await req.json());
  const nonce = await issueNonce(wallet);
  return ok({ message: buildSignInMessage(wallet, nonce) });
});
