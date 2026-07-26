// The house's standing bounty slate under the auto-pay economy — shared by
// prisma/seed.mjs (fresh installs) and scripts/reset-bounties.mjs (migrating
// a live DB off the old manual presets).
//
// Two tiers, matching how the reward system actually works:
//   · Credit-table POTS (flip / dice / blackjack): the pot opens at a
//     house-declared seed and grows with the pot's share of the realized
//     edge (potShare × edge × (1−burn) × price per credit wagered). It pays
//     everyone pro-rata the moment it reaches the prize, then re-opens.
//     Solvent by construction — the house's cost per fill is the seed alone.
//   · Free arcade episodes (frogris / worm / hopper): smaller prizes, paid
//     weekly at the deadline — free play ranks, spend rules decide
//     eligibility.

const DECIMALS = Number(process.env.RIBBIT_DECIMALS ?? 6);
export const raw = (ribbit) => BigInt(Math.round(ribbit * 10 ** DECIMALS));
const days = (d) => new Date(Date.now() + d * 24 * 3600 * 1000);

// Mirrors src/lib/bounty.ts requiredCreditSpend — keep in sync.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const PER_CREDIT = num(process.env.RIBBIT_PER_CREDIT, 100);
const EDGE = clamp(num(process.env.HOUSE_EDGE, 0.04), 0.005, 0.15);
const BURN = clamp(num(process.env.BUY_BURN_SHARE, 0.05), 0, 0.95);
const POT_SHARE = clamp(num(process.env.BOUNTY_POT_SHARE, 0.5), 0.05, 1);
export const triggerCreditVolume = (prizeRibbit, seedRibbit = 0) => {
  const rate = POT_SHARE * EDGE * (1 - BURN) * PER_CREDIT;
  const funded = Math.max(0, prizeRibbit - seedRibbit);
  if (funded === 0) return 1;
  return Math.max(1, Math.ceil(funded / rate));
};

const creditBounty = ({ title, target, description, game, prize, seed = 0, days: d }) => ({
  title,
  target,
  description,
  game,
  kind: "leaderboard",
  prizeRibbit: raw(prize),
  seedRibbit: raw(seed),
  autoPay: true,
  triggerCreditVolume: triggerCreditVolume(prize, seed),
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
  // ---- Credit-table pots: grow with play, pay pro-rata, re-open ----
  creditBounty({
    title: "High Roller — Pond Dice",
    target: "The Deep End",
    game: "dice",
    prize: 750,
    seed: 250,
    days: 14,
    description:
      "A house-seeded pot over the dice table. It grows with every credit wagered on Pond Dice — the pot's share of the edge — and the moment it reaches 750 $RIBBIT, every eligible hunter is paid automatically, pro-rata by net credits won. Then a fresh pot opens.",
  }),
  creditBounty({
    title: "EP 06 — Blackjack",
    target: "The House Toad",
    game: "blackjack",
    prize: 1_500,
    seed: 500,
    days: 14,
    description:
      "Beat the dealer, bank the credits. The pot grows as blackjack is played; at 1,500 $RIBBIT every eligible winner takes a share sized to their net win — paid automatically, no claims — and the pot re-opens.",
  }),
  creditBounty({
    title: "Double or Nothing — Frog Flip",
    target: "The Two-Face",
    game: "flip",
    prize: 750,
    seed: 250,
    days: 14,
    description:
      "Call the coin. The pot grows as flips stack up on the table; at 750 $RIBBIT all eligible net winners split it pro-rata — automatically, the moment it fills — and a fresh pot opens.",
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
