// Retired. Chips used to be bought with a split burn + treasury payment.
// The house now runs on one balance: deposit $OWP, play, withdraw. This route
// used to credit the old chip column, which nothing spends any more, so
// honoring a payment here would take a player's tokens and give back nothing.
// It answers 410 and consumes nothing.
import { err, handler } from "@/lib/api";

export const POST = handler(async () =>
  err("Chip sales are retired. Deposit $OWP to play — it credits your balance in full.", 410)
);
