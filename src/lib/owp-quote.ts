// Integer sizing for a house sale of $OWP. Rounds down, in the house's favor.
// A live bonding curve pays from its virtual reserves (one division). A
// graduated coin pays from a ceiled SOL-per-token price.

export type OwpQuoteShape = {
  decimals: number;
  /** Ceil of lamports per 1 whole token. Used when the curve reserves are absent. */
  lamportsPerWhole: string;
  virtualToken: string | null;
  virtualSol: string | null;
};

export function owpRawForQuote(lamports: bigint, quote: OwpQuoteShape): bigint {
  if (lamports <= 0n) return 0n;
  if (quote.virtualToken && quote.virtualSol) {
    const vs = BigInt(quote.virtualSol);
    const vt = BigInt(quote.virtualToken);
    if (vs <= 0n || vt <= 0n) return 0n;
    return (lamports * vt) / vs;
  }
  const per = BigInt(quote.lamportsPerWhole);
  if (per <= 0n) return 0n;
  const scale = 10n ** BigInt(quote.decimals);
  return (lamports * scale) / per;
}
