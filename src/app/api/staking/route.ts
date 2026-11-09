// Staking is not offered. The route stays so an old client gets an explicit
// empty answer, and so a leftover STAKE_POOL_ADDRESS cannot publish a pool.
import { handler, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  return ok({ pool: null, you: null, configured: false });
});
