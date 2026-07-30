// Import (or re-import) the airdrop waitlist from a snapshot CSV.
//
//   node scripts/import-waitlist.mjs /path/to/waitlist-snapshot-NN.csv
//
// Idempotent by email (lowercased): re-running with a newer snapshot updates
// position / wallet / referrals in place — a member's earned place is always
// whatever the newest snapshot says. Prints COUNTS ONLY, never the data:
// these are real people's emails and wallets. The CSV itself must never be
// committed to any repo.
//
// Expected header: position,displayName,email,wallet,joinedAt,referrals,referredBy
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const require_ = (await import("node:module")).createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = require_("@prisma/client");
const prisma = new PrismaClient();

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/import-waitlist.mjs <snapshot.csv>");
  process.exit(1);
}

// Minimal RFC-4180 CSV parser — display names may contain commas/quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(file, "utf8"));
const header = rows[0].map((h) => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
for (const col of ["position", "email", "joinedAt"]) {
  if (!(col in idx)) {
    console.error(`CSV is missing required column "${col}" — header: ${header.join(",")}`);
    process.exit(1);
  }
}

let created = 0;
let updated = 0;
let skipped = 0;
for (const r of rows.slice(1)) {
  const email = (r[idx.email] ?? "").trim().toLowerCase();
  const position = Number(r[idx.position]);
  const joinedAt = new Date((r[idx.joinedAt] ?? "").trim());
  if (!email || !Number.isFinite(position) || Number.isNaN(joinedAt.getTime())) {
    skipped++;
    continue;
  }
  const data = {
    position,
    displayName: (r[idx.displayName] ?? "").trim() || email.split("@")[0],
    wallet: (r[idx.wallet] ?? "").trim() || null,
    joinedAt,
    referrals: Number(r[idx.referrals]) || 0,
    referredBy: (r[idx.referredBy] ?? "").trim() || null,
    importedAt: new Date(),
  };
  const existing = await prisma.waitlistEntry.findUnique({ where: { email } });
  if (existing) {
    await prisma.waitlistEntry.update({ where: { email }, data });
    updated++;
  } else {
    await prisma.waitlistEntry.create({ data: { email, ...data } });
    created++;
  }
}

const total = await prisma.waitlistEntry.count();
const withWallet = await prisma.waitlistEntry.count({ where: { wallet: { not: null } } });
const agg = await prisma.waitlistEntry.aggregate({ _min: { position: true }, _max: { position: true } });
console.log(`created ${created} · updated ${updated} · skipped ${skipped}`);
console.log(
  `waitlist now: ${total} members (${withWallet} with wallets) · positions ${agg._min.position}–${agg._max.position} · ${1000 - total} seats to the guaranteed airdrop`
);
await prisma.$disconnect();
