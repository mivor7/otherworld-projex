// House controls: read and tune the live house parameters.
//   GET  → every setting with its effective value, env default and override
//   POST {key, value}          → set an override (validated, not clamped —
//                                out-of-range is rejected so the admin knows)
//   POST {key, action:"reset"} → drop the override, back to the env default
// Every change is audited as a TreasuryEvent kind "config" (public ledger —
// house rule changes are material to players, so they're published).
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ARCADE_GAMES, requiredRevenueRibbit } from "@/lib/bounty";
import {
  SETTING_DEFS,
  settingDef,
  parseSettingValue,
  invalidateSettingsCache,
  houseConfig,
  type HouseConfig,
} from "@/lib/settings";

export const GET = handler(async () => {
  await requireAdmin();
  const [rows, effective] = await Promise.all([
    prisma.houseSetting.findMany(),
    houseConfig(),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return ok({
    settings: SETTING_DEFS.map((d) => {
      const row = byKey.get(d.key);
      return {
        key: d.key,
        label: d.label,
        desc: d.desc,
        group: d.group,
        kind: d.kind,
        min: d.min ?? null,
        max: d.max ?? null,
        integer: d.integer ?? false,
        danger: d.danger ?? false,
        envDefault: d.envDefault,
        effective: (effective as Record<string, number | boolean>)[d.key],
        overridden: !!row,
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    }),
  });
});

const body = z.object({
  key: z.string().min(1).max(64),
  action: z.enum(["set", "reset"]).default("set"),
  value: z.union([z.number(), z.boolean()]).optional(),
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const data = body.parse(await req.json());
  const def = settingDef(data.key);
  if (!def) return err("Unknown setting", 404);

  const before = (await houseConfig())[def.key as keyof HouseConfig];

  if (data.action === "reset") {
    await prisma.houseSetting.deleteMany({ where: { key: def.key } });
  } else {
    if (data.value === undefined) return err("Provide a value");
    if (def.kind === "bool" && typeof data.value !== "boolean") {
      return err(`${def.label} is a switch — send true or false`, 422);
    }
    if (def.kind !== "bool" && typeof data.value !== "number") {
      return err(`${def.label} is numeric`, 422);
    }
    const parsed = parseSettingValue(def, String(data.value));
    if (parsed === null) {
      const range =
        def.kind === "bool"
          ? "true/false"
          : `${def.min ?? "-∞"} – ${def.max ?? "∞"}${def.integer ? ", whole numbers" : ""}`;
      return err(`${def.label} must be within ${range}`, 422);
    }
    await prisma.houseSetting.upsert({
      where: { key: def.key },
      create: { key: def.key, value: String(parsed), updatedBy: admin.wallet },
      update: { value: String(parsed), updatedBy: admin.wallet },
    });
  }

  invalidateSettingsCache();
  const after = (await houseConfig())[def.key as keyof HouseConfig];

  // The margin re-prices every open auto-pay credit bounty's required-revenue
  // reference, so the stored marker matches the live gate. (Only the margin
  // affects required revenue now — the credit price and house edge no longer
  // touch bounty funding.)
  let rederived = 0;
  if (def.key === "bountyHouseMargin" && String(before) !== String(after)) {
    const open = await prisma.bounty.findMany({
      where: { status: "open", autoPay: true, game: { not: null } },
      select: { id: true, game: true, prizeRibbit: true, triggerCreditVolume: true },
    });
    for (const b of open) {
      if (!b.game || ARCADE_GAMES.has(b.game)) continue; // weekly, no marker
      const marker = await requiredRevenueRibbit(b.prizeRibbit);
      if (marker !== b.triggerCreditVolume) {
        await prisma.bounty.update({
          where: { id: b.id },
          data: { triggerCreditVolume: marker },
        });
        rederived++;
      }
    }
  }

  // Public audit trail — rule changes are house history, same as payouts.
  if (String(before) !== String(after)) {
    await prisma.treasuryEvent.create({
      data: {
        kind: "config",
        amount: 0n,
        asset: "CONFIG",
        note: `${def.label}: ${before} → ${after} (by ${admin.wallet.slice(0, 8)}${
          data.action === "reset" ? ", reset to default" : ""
        }${rederived > 0 ? `; re-derived ${rederived} bounty trigger${rederived === 1 ? "" : "s"}` : ""})`,
        ref: def.key,
      },
    });
  }

  return ok({
    key: def.key,
    effective: after,
    overridden: data.action !== "reset",
    rederivedTriggers: rederived,
  });
});
