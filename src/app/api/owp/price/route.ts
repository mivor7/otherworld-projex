// Public spot price for buying $OWP from the house wallet.
import { handler, ok } from "@/lib/api";
import { owpQuote } from "@/lib/owp-price";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ok(await owpQuote()));
