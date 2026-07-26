// Live house controls. Every key here can be overridden from the admin panel
// at runtime (stored in HouseSetting); the env value in CONFIG is only the
// default. Server code reads the EFFECTIVE value via houseConfig() — never
// CONFIG directly — for anything listed in SETTING_DEFS.
//
// Values are validated against each key's bounds on write (the API rejects
// out-of-range instead of silently clamping) and re-clamped on read as a
// belt-and-braces guard against hand-edited rows.
import { CONFIG } from "./config";
import { prisma } from "./db";

export type SettingDef = {
  key: string;
  label: string;
  desc: string;
  group: "Economy" | "Limits" | "Eligibility" | "Switches";
  kind: "number" | "share" | "bool";
  min?: number;
  max?: number;
  integer?: boolean;
  /** Big red switch — the admin UI asks for confirmation. */
  danger?: boolean;
  envDefault: number | boolean;
};

export const SETTING_DEFS: readonly SettingDef[] = [
  // ---- Economy ----
  {
    key: "buyBurnShare",
    label: "Burn share of credit buys",
    desc: "Fraction of every credit purchase that is burned; the rest goes to the treasury. 0.5 = half burned, half to the house. Both legs must exist on-chain, so 0.05–0.95.",
    group: "Economy",
    kind: "share",
    min: 0.05,
    max: 0.95,
    envDefault: CONFIG.buyBurnShare,
  },
  {
    key: "ribbitPerCredit",
    label: "$RIBBIT per credit",
    desc: "Price of one play credit in whole $RIBBIT.",
    group: "Economy",
    kind: "number",
    min: 1,
    max: 1_000_000,
    integer: true,
    envDefault: CONFIG.ribbitPerCredit,
  },
  {
    key: "houseEdge",
    label: "House edge",
    desc: "Flat edge applied to table payout multipliers (0.04 = 4%). Game fairness only — it does NOT affect bounty triggers.",
    group: "Economy",
    kind: "share",
    min: 0.005,
    max: 0.15,
    envDefault: CONFIG.houseEdge,
  },
  {
    key: "bountyPotShare",
    label: "Bounty pot share",
    desc: "Share of the realized house edge that fills bounty pots. 0.5 = the pot gets half of every credit the edge collects, the house keeps the other half. Higher = pots fill faster, house keeps less.",
    group: "Economy",
    kind: "share",
    min: 0.05,
    max: 1,
    envDefault: CONFIG.bountyPotShare,
  },
  // ---- Limits ----
  {
    key: "minWager",
    label: "Minimum wager",
    desc: "Smallest wager the tables accept, in credits.",
    group: "Limits",
    kind: "number",
    min: 1,
    max: 10_000,
    integer: true,
    envDefault: CONFIG.minWager,
  },
  {
    key: "maxWager",
    label: "Maximum wager",
    desc: "Largest wager the tables accept, in credits.",
    group: "Limits",
    kind: "number",
    min: 1,
    max: 1_000_000,
    integer: true,
    envDefault: CONFIG.maxWager,
  },
  {
    key: "arcadeDailySubmissions",
    label: "Arcade scores per day",
    desc: "Max ranked arcade score submissions per wallet per game per UTC day.",
    group: "Limits",
    kind: "number",
    min: 1,
    max: 1_000,
    integer: true,
    envDefault: CONFIG.arcadeDailySubmissions,
  },
  // ---- Eligibility ----
  {
    key: "rankedMinBurnedRibbit",
    label: "Lifetime spend to rank",
    desc: "Whole $RIBBIT (burned or bought) a wallet needs lifetime before prize boards rank it. Mission rule: only spenders earn — so the panel can't set this below 1 (env can, for dev).",
    group: "Eligibility",
    kind: "number",
    min: 1,
    max: 100_000_000,
    integer: true,
    envDefault: CONFIG.rankedMinBurnedRibbit,
  },
  {
    key: "rankedMinWindowBurnedRibbit",
    label: "In-window spend to rank",
    desc: "Whole $RIBBIT spent inside the board/bounty window. Repeat abusers must re-spend every window. 0 disables.",
    group: "Eligibility",
    kind: "number",
    min: 0,
    max: 100_000_000,
    integer: true,
    envDefault: CONFIG.rankedMinWindowBurnedRibbit,
  },
  {
    key: "rankedMinTableVolume",
    label: "Table volume to rank",
    desc: "Credits a wallet must wager in-window before table boards rank its net win.",
    group: "Eligibility",
    kind: "number",
    min: 0,
    max: 1_000_000,
    integer: true,
    envDefault: CONFIG.rankedMinTableVolume,
  },
  // ---- Switches ----
  {
    key: "inviteRequired",
    label: "Invite-only sign-ups",
    desc: "New wallets need a valid invite code to create an account. Existing players sign in unaffected. Mint codes in the Invite codes panel.",
    group: "Switches",
    kind: "bool",
    danger: true,
    envDefault: CONFIG.inviteRequired,
  },
  {
    key: "bountyAutoPay",
    label: "Bounty auto-pay",
    desc: "Master switch for automatic bounty settlement. Off = pools keep filling but nothing pays until re-enabled or awarded by hand.",
    group: "Switches",
    kind: "bool",
    danger: true,
    envDefault: CONFIG.bountyAutoPayEnabled,
  },
  {
    key: "gamesPaused",
    label: "Pause the tables & arcade",
    desc: "Blocks NEW rounds and arcade runs (open blackjack hands can still finish; in-flight arcade runs still submit). Emergency brake.",
    group: "Switches",
    kind: "bool",
    danger: true,
    envDefault: false,
  },
  {
    key: "creditSalesPaused",
    label: "Pause credit sales",
    desc: "Refuses new burn/buy credit verifications. Players keep existing credits.",
    group: "Switches",
    kind: "bool",
    danger: true,
    envDefault: false,
  },
  {
    key: "payoutsPaused",
    label: "Pause the payout worker",
    desc: "The off-server payout worker stops claiming queued withdrawals/prizes until re-enabled. The queue keeps accepting requests.",
    group: "Switches",
    kind: "bool",
    danger: true,
    envDefault: false,
  },
] as const;

export type HouseConfig = {
  buyBurnShare: number;
  ribbitPerCredit: number;
  houseEdge: number;
  bountyPotShare: number;
  minWager: number;
  maxWager: number;
  arcadeDailySubmissions: number;
  rankedMinBurnedRibbit: number;
  rankedMinWindowBurnedRibbit: number;
  rankedMinTableVolume: number;
  inviteRequired: boolean;
  bountyAutoPay: boolean;
  gamesPaused: boolean;
  creditSalesPaused: boolean;
  payoutsPaused: boolean;
};

const DEFS_BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]));

export function settingDef(key: string): SettingDef | undefined {
  return DEFS_BY_KEY.get(key);
}

/** Parse + bound one stored string against its def; null = invalid. */
export function parseSettingValue(
  def: SettingDef,
  raw: string
): number | boolean | null {
  if (def.kind === "bool") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (def.integer && !Number.isInteger(n)) return null;
  if (def.min !== undefined && n < def.min) return null;
  if (def.max !== undefined && n > def.max) return null;
  return n;
}

// Per-instance cache. Serverless means several instances may hold slightly
// stale values for up to TTL — acceptable for tuning knobs; writes invalidate
// the instance that served the admin request immediately.
let cache: { at: number; rows: Map<string, string> } | null = null;
const TTL_MS = 10_000;

export function invalidateSettingsCache(): void {
  cache = null;
}

async function overrides(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await prisma.houseSetting.findMany();
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.rows;
}

/** The effective, admin-tunable house configuration. */
export async function houseConfig(): Promise<HouseConfig> {
  const rows = await overrides();
  const out: Record<string, number | boolean> = {};
  for (const def of SETTING_DEFS) {
    const raw = rows.get(def.key);
    const parsed = raw !== undefined ? parseSettingValue(def, raw) : null;
    let value = parsed ?? def.envDefault;
    // The env default can sit outside the panel's [min,max] (its clamp differs
    // from ours). Re-clamp numeric values to the def range so a wide env can't
    // produce a degenerate config (e.g. buyBurnShare=1 → divide-by-zero in the
    // bounty trigger). Overrides are already range-validated on write.
    if (def.kind !== "bool" && typeof value === "number") {
      if (def.min !== undefined) value = Math.max(def.min, value);
      if (def.max !== undefined) value = Math.min(def.max, value);
    }
    out[def.key] = value;
  }
  return out as HouseConfig;
}
