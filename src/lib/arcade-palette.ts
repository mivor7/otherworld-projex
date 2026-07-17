// Canvas 2D can't read the CSS @theme tokens, so the House palette is
// mirrored here for the arcade episodes — the same quiet-lime family and
// muted accents as globals.css, matte rather than neon. Keep in sync with
// --color-neon oklch(0.78 0.11 150) and friends.
export const ARCADE = {
  bg: "oklch(0.145 0.01 165)",
  grid: "oklch(1 0 0 / 0.035)",
  lime: "oklch(0.78 0.11 150)",
  limeSoft: "oklch(0.85 0.09 150)",
  limeFaint: "oklch(0.78 0.11 150 / 0.5)",
  ink: "oklch(0.15 0.01 165)",
};

// Frogris pieces (I O T S Z J L) — distinct hues, one House lightness band.
export const PIECE_COLORS = [
  "oklch(0.78 0.11 150)", // I lime
  "oklch(0.8 0.1 85)", // O gold
  "oklch(0.74 0.07 290)", // T portal violet
  "oklch(0.74 0.09 175)", // S teal
  "oklch(0.68 0.11 25)", // Z coral
  "oklch(0.72 0.08 245)", // J slate blue
  "oklch(0.75 0.09 55)", // L clay
];

// Hopper traffic — same band, nothing screams.
export const CAR_COLORS = [
  "oklch(0.68 0.07 290)",
  "oklch(0.66 0.07 245)",
  "oklch(0.7 0.08 55)",
  "oklch(0.62 0.12 25)",
];
