// Pond Dice limits shared by the server and the table UI. No server imports
// here — the browser bundles this file.

export const DICE_MIN_TARGET = 2;
export const DICE_MAX_TARGET = 98;

// A win has to pay at least this multiple of the stake to be offered.
const MIN_WIN_MULTIPLIER = 1.01;

/** Payout multiplier for a roll-under target: (100 ÷ target) × (1 − edge). */
export function diceMultiplier(target: number, edge: number): number {
  return (100 / target) * (1 - edge);
}

/**
 * Highest roll-under target the table offers at this house edge.
 *
 * The edge comes off the multiplier, so past a certain win chance a "win"
 * pays back the stake or less: at a 4% edge, target 96 pays 1.00× and 98 pays
 * 0.98×. Those are bets a player cannot profit on, so they are not offered.
 */
export function maxDiceTarget(edge: number): number {
  for (let target = DICE_MAX_TARGET; target > DICE_MIN_TARGET; target--) {
    if (diceMultiplier(target, edge) >= MIN_WIN_MULTIPLIER) return target;
  }
  return DICE_MIN_TARGET;
}
