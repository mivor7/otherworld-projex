// Demo content so a fresh install isn't an empty pond.
// Run: npm run db:seed  (safe to re-run — skips if data exists)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DECIMALS = Number(process.env.RIBBIT_DECIMALS ?? 6);
const raw = (ribbit) => BigInt(Math.round(ribbit * 10 ** DECIMALS));
const hours = (h) => new Date(Date.now() + h * 3600 * 1000);

async function main() {
  if ((await prisma.auction.count()) > 0) {
    console.log("Database already has auctions — skipping seed.");
    return;
  }

  await prisma.auction.createMany({
    data: [
      {
        title: "Genesis Frog — founders' 1/1",
        description:
          "The first collectible minted for the Other World. The winner receives the 1/1 NFT plus a permanent 'Founder' badge on all leaderboards.",
        category: "nft",
        startBidRaw: raw(25_000),
        minIncrement: raw(1_000),
        endsAt: hours(72),
      },
      {
        title: "OWP embroidered varsity jacket",
        description:
          "Heavyweight varsity jacket with the frog-portal mark embroidered on the back. Shipped worldwide by the team.",
        category: "merch",
        startBidRaw: raw(8_000),
        minIncrement: raw(500),
        endsAt: hours(48),
      },
      {
        title: "Your X banner, designed by the OWP artist",
        description:
          "The artist behind the Other World designs a custom animated banner + avatar set for the winner's X profile.",
        category: "service",
        startBidRaw: raw(3_000),
        minIncrement: raw(250),
        endsAt: hours(24),
      },
    ],
  });

  await prisma.bounty.createMany({
    data: [
      {
        title: "Hopper Weekly — Episode 1",
        description:
          "Top 3 Hopper scores this week split the pool 60/25/15. Every signed-in run counts; only your best score matters.",
        game: "hopper",
        kind: "leaderboard",
        prizeRibbit: raw(15_000),
        endsAt: hours(7 * 24),
      },
      {
        title: "High Roller — Pond Dice",
        description:
          "Biggest net winner on Pond Dice this week takes the bounty. Volume must exceed 200 credits wagered to qualify.",
        game: "dice",
        kind: "leaderboard",
        prizeRibbit: raw(10_000),
        endsAt: hours(7 * 24),
      },
      {
        title: "First 47× hit",
        description:
          "First hunter to win a Pond Dice roll at target 2 (47× payout) claims this one-off challenge bounty. Post your round id in the community channel.",
        game: "dice",
        kind: "challenge",
        prizeRibbit: raw(5_000),
        endsAt: hours(30 * 24),
      },
    ],
  });

  console.log("Seeded 3 auctions and 3 bounties. Welcome to the Other World. 🐸");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
