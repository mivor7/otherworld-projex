// Public spot price for buying $OWP from the house wallet.
import { handler, ok } from "@/lib/api";
import { pumpQuote } from "@/lib/pump-price";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ok(await pumpQuote()));
