// Retired. Burn-to-play granted chips for burned $OWP. Chips are gone: the
// tables wager $OWP from the app balance, and a burn credits nothing. This
// route answers 410 and consumes nothing.
import { err, handler } from "@/lib/api";

export const POST = handler(async () =>
  err("Burn-to-play is retired. Deposit $OWP to play — it credits your balance in full.", 410)
);
