// Invite-code management for the invite-only launch.
//   GET  → all codes, newest first, with usage.
//   POST {action:"create", count?, maxUses?, note?} → mint codes (OWP-XXXX-XXXX)
//   POST {action:"disable"|"enable", id}            → kill / revive a code
// The gate itself is the "inviteRequired" switch in House controls.
import { z } from "zod";
import { err, handler, ok, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Unambiguous alphabet — no 0/O/1/I/L, so codes survive being read aloud.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function mintCode(): string {
  const buf = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]);
  return `OWP-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export const GET = handler(async () => {
  await requireAdmin();
  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(codes);
});

const postBody = z.object({
  action: z.enum(["create", "disable", "enable"]),
  id: z.string().optional(),
  count: z.number().int().min(1).max(50).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
  note: z.string().max(120).optional(),
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const data = postBody.parse(await req.json());

  if (data.action === "create") {
    const count = data.count ?? 1;
    const created = [];
    for (let i = 0; i < count; i++) {
      // Retry on the (astronomically unlikely) code collision.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          created.push(
            await prisma.inviteCode.create({
              data: {
                code: mintCode(),
                maxUses: data.maxUses ?? 1,
                note: data.note ?? null,
                createdBy: admin.wallet,
              },
            })
          );
          break;
        } catch {
          if (attempt === 2) throw new Error("code mint collision");
        }
      }
    }
    return ok({ created });
  }

  if (!data.id) return err("Provide the code id");
  const updated = await prisma.inviteCode.update({
    where: { id: data.id },
    data: { disabled: data.action === "disable" },
  });
  return ok({ id: updated.id, disabled: updated.disabled });
});
