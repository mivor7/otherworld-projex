// The $OWP mint's token program is whatever owns the mint account.
// A Raydium launch can be classic SPL or Token-2022. Deriving an ATA with
// the wrong program targets an account that does not exist.
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAMS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

let cachedKey = "";
let cachedProgram: PublicKey | null = null;
let missAt = 0;
const MISS_TTL_MS = 30_000;

export function tokenProgramId(owner: PublicKey): PublicKey | null {
  return PROGRAMS.find((p) => p.equals(owner)) ?? null;
}

/** Null when the mint account does not exist, or its owner is not a token program. */
export async function detectTokenProgram(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey | null> {
  const key = mint.toBase58();
  if (cachedProgram && cachedKey === key) return cachedProgram;
  if (cachedKey === key && !cachedProgram && Date.now() - missAt < MISS_TTL_MS) {
    return null;
  }
  const info = await connection.getAccountInfo(mint);
  const program = info ? tokenProgramId(info.owner) : null;
  cachedKey = key;
  cachedProgram = program;
  if (!program) missAt = Date.now();
  return program;
}
