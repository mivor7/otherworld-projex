// Demo content so a fresh install isn't an empty pond.
// Run: npm run db:seed  (safe to re-run — skips if data exists)
import { PrismaClient } from "@prisma/client";
import { BOUNTY_PRESETS, raw } from "./bounty-presets.mjs";

const prisma = new PrismaClient();
const hours = (h) => new Date(Date.now() + h * 3600 * 1000);

async function main() {
  if ((await prisma.auction.count()) > 0) {
    console.log("Database already has auctions — skipping seed.");
    return;
  }

  await prisma.auction.createMany({
    data: [
      {
        title: "Vault Door — archive print 1/1",
        description:
          "Signed 1/1 archive print of the Otherworld vault door, sealed in a museum glass case. The winner receives the physical print plus its on-chain certificate.",
        category: "collectible",
        imageUrl: "/art/lot-vault-print.jpg",
        startBidRaw: raw(25_000),
        minIncrement: raw(1_000),
        endsAt: hours(72),
      },
      {
        title: "Card Shark — gold badge medallion",
        description:
          "The Card Shark seal, struck for the house's card tables. Grants the permanent 'Card Shark' badge on all leaderboards.",
        category: "nft",
        imageUrl: "/art/lot-card-shark.jpg",
        startBidRaw: raw(15_000),
        minIncrement: raw(500),
        endsAt: hours(48),
      },
      {
        title: "Founders' sketch — concept sheet No. 3",
        description:
          "Original concept sketch from the Other World production archive. Shipped framed, worldwide, by the team.",
        category: "collectible",
        imageUrl: "/art/lot-sketch.jpg",
        startBidRaw: raw(8_000),
        minIncrement: raw(500),
        endsAt: hours(36),
      },
      {
        title: "Otherworld wallpaper suite — early access",
        description:
          "The full 4K/mobile wallpaper suite from the house artist, delivered before public release, plus your name in the credits.",
        category: "other",
        imageUrl: "/art/lot-wallpapers.jpg",
        startBidRaw: raw(3_000),
        minIncrement: raw(250),
        endsAt: hours(24),
      },
    ],
  });

  // The standing bounty slate — auto-pay economy (credit tables unlock with
  // play; free arcade pays weekly at a lower tier). Defined once in
  // bounty-presets.mjs, shared with scripts/reset-bounties.mjs.
  await prisma.bounty.createMany({ data: BOUNTY_PRESETS });

  console.log(
    `Seeded 4 auctions and ${BOUNTY_PRESETS.length} auto-pay bounties. Welcome to the Other World. 🐸`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
