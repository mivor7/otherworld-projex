// The house's standing bounty slate under the auto-pay economy — shared by
// prisma/seed.mjs (fresh installs) and scripts/reset-bounties.mjs (migrating
// a live DB off the old manual presets).
//
// Two tiers, matching how the reward system actually works:
//   · Credit tables (flip / dice / blackjack): fixed prize, unlocks the moment
//     cumulative credits wagered on that game reach a trigger derived from the
//     prize (house nets positive by construction). Paid pro-rata to every
//     eligible winner, automatically.
//   · Free arcade episodes (frogris / worm / hopper): significantly lower
//     prizes, paid weekly at the deadline — free play ranks, spend rules
//     decide eligibility.

const DECIMALS = Number(process.env.RIBBIT_DECIMALS ?? 6);
export const raw = (ribbit) => BigInt(Math.round(ribbit * 10 ** DECIMALS));
const days = (d) => new Date(Date.now() + d * 24 * 3600 * 1000);

// Mirrors src/lib/bounty.ts computeTriggerCreditVolume — keep in sync.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const PER_CREDIT = num(process.env.RIBBIT_PER_CREDIT, 100);
const EDGE = clamp(num(process.env.HOUSE_EDGE, 0.04), 0.005, 0.15);
const MARGIN = (() => {
  const n = Number(process.env.BOUNTY_HOUSE_MARGIN);
  return Number.isFinite(n) && n >= 0 ? n : 0.5;
})();
export const triggerCreditVolume = (prizeRibbit) =>
  Math.max(1, Math.ceil(((prizeRibbit / PER_CREDIT) * (1 + MARGIN)) / EDGE));

const creditBounty = ({ title, target, description, game, prize, days: d }) => ({
  title,
  target,
  description,
  game,
  kind: "leaderboard",
  prizeRibbit: raw(prize),
  autoPay: true,
  triggerCreditVolume: triggerCreditVolume(prize),
  endsAt: days(d),
});

const freeBounty = ({ title, target, description, game, prize }) => ({
  title,
  target,
  description,
  game,
  kind: "leaderboard",
  prizeRibbit: raw(prize),
  autoPay: true,
  triggerCreditVolume: null,
  endsAt: days(7),
});

export const BOUNTY_PRESETS = [
  // ---- Credit tables: prize unlocks with play, pays everyone pro-rata ----
  creditBounty({
    title: "High Roller — Pond Dice",
    target: "The Deep End",
    game: "dice",
    prize: 10_000,
    days: 30,
    description:
      "A fixed 10,000 $RIBBIT pool over the dice table. It unlocks the moment enough credits have been wagered on Pond Dice — watch the meter fill — then every eligible hunter is paid automatically, pro-rata by net credits won.",
  }),
  creditBounty({
    title: "EP 06 — Blackjack",
    target: "The House Toad",
    game: "blackjack",
    prize: 5_000,
    days: 30,
    description:
      "Beat the dealer, bank the credits. The 5,000 $RIBBIT pool unlocks when the table's credit-spend meter fills, and every eligible winner takes a share sized to their net win — paid out automatically, no claims.",
  }),
  creditBounty({
    title: "Double or Nothing — Frog Flip",
    target: "The Two-Face",
    game: "flip",
    prize: 4_000,
    days: 30,
    description:
      "Call the coin. The 4,000 $RIBBIT pool unlocks as flips stack up on the table; when the meter fills, all eligible net winners split it pro-rata — automatically, the moment it triggers.",
  }),

  // ---- Free arcade: weekly, deliberately smaller than the tables ----
  freeBounty({
    title: "EP 02 — Frogris",
    target: "The Stack-Smuggler",
    game: "frogris",
    prize: 1_000,
    description:
      "Stack the falling frogs, clear the lines, don't top out. Free to play — the 1,000 $RIBBIT pool pays weekly, split pro-rata by best score among eligible hunters.",
  }),
  freeBounty({
    title: "EP 04 — Worm Frog",
    target: "The Tail-Bite Serpent",
    game: "worm",
    prize: 1_000,
    description:
      "Slither, grow, and don't bite your own tail. Free to play — the 1,000 $RIBBIT pool pays weekly, split pro-rata by best score among eligible hunters.",
  }),
  freeBounty({
    title: "EP 05 — Hopper",
    target: "The Highway Bandit",
    game: "hopper",
    prize: 1_250,
    description:
      "Hop the lanes, dodge the traffic, ride the logs home. Free to play — the 1,250 $RIBBIT pool pays weekly, split pro-rata by best score among eligible hunters.",
  }),
];
