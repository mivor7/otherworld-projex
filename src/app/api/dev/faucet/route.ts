// Local development only: grants demo credits so the games can be exercised
// without burning real tokens. Disabled unless DEV_FAUCET=true.
import { err, handler, ok, requireSession } from "@/lib/api";
import { prisma } from "@/lib/db";
import { adjustCredits } from "@/lib/credits";
import { CONFIG } from "@/lib/config";

export const POST = handler(async () => {
  if (!CONFIG.devFaucet || process.env.NODE_ENV === "production") {
    return err("Faucet disabled", 403);
  }
  const session = await requireSession();
  const credits = await prisma.$transaction((tx) =>
    adjustCredits(tx, session.userId, 100, "admin", "dev-faucet")
  );
  return ok({ credits });
});
