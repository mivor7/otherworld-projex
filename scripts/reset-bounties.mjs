// One-shot migration off the old manual bounty presets onto the auto-pay
// slate (prisma/bounty-presets.mjs). Dry-run by default; pass --apply to
// execute. Safe rules:
//   · only deletes OPEN/CLOSED bounties with autoPay=false and ZERO awards
//     (the old hand-written presets — paid history is never touched)
//   · skips creating any preset whose title is already open (idempotent)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
// Dynamic import so the presets see the .env values (static imports hoist).
const { BOUNTY_PRESETS } = await import("../prisma/bounty-presets.mjs");

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const stale = await prisma.bounty.findMany({
  where: { autoPay: false, status: { in: ["open", "closed"] } },
  include: { _count: { select: { awards: true } } },
});
const deletable = stale.filter((b) => b._count.awards === 0);
const kept = stale.filter((b) => b._count.awards > 0);

console.log(`old-model bounties to delete: ${deletable.length}`);
for (const b of deletable) console.log(`  − ${b.title} (${b.game ?? "—"}, ${b.status})`);
if (kept.length) {
  console.log(`kept (have awards — close them by hand if needed): ${kept.length}`);
  for (const b of kept) console.log(`  · ${b.title}`);
}

const deletableIds = new Set(deletable.map((b) => b.id));
const openTitles = new Set(
  (await prisma.bounty.findMany({ where: { status: "open" }, select: { id: true, title: true } }))
    .filter((b) => !deletableIds.has(b.id)) // titles that will survive the delete
    .map((b) => b.title)
);
const toCreate = BOUNTY_PRESETS.filter((p) => !openTitles.has(p.title));
console.log(`new auto-pay bounties to create: ${toCreate.length}`);
for (const p of toCreate) {
  const trg = p.triggerCreditVolume
    ? `trigger ${p.triggerCreditVolume.toLocaleString()} credits`
    : "weekly";
  console.log(`  + ${p.title} (${p.game}, ${Number(p.prizeRibbit / 10n ** 6n).toLocaleString()} $RIBBIT, ${trg})`);
}

if (!apply) {
  console.log("\ndry run — re-run with --apply to execute.");
} else {
  await prisma.bounty.deleteMany({ where: { id: { in: deletable.map((b) => b.id) } } });
  await prisma.bounty.createMany({ data: toCreate });
  console.log("\napplied.");
}
await prisma.$disconnect();
