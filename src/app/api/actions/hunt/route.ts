import { NextRequest, NextResponse } from "next/server";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { CONFIG, fromRaw } from "@/lib/config";
import { connection } from "@/lib/solana";

export const dynamic = "force-dynamic";

const ACTION_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": "2.2",
  "X-Blockchain-Ids": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ACTION_HEADERS });
}

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const [waitlistCount, openPrizeAgg, openCount] = await Promise.all([
    prisma.waitlistEntry.count().catch(() => 0),
    prisma.bounty
      .aggregate({ where: { status: "open" }, _sum: { prizeRibbit: true } })
      .catch(() => ({ _sum: { prizeRibbit: 0n } })),
    prisma.bounty.count({ where: { status: "open" } }).catch(() => 0),
  ]);

  const openPrize = Math.round(fromRaw(openPrizeAgg._sum.prizeRibbit ?? 0n));
  const iconUrl = new URL("/api/og", origin);
  iconUrl.searchParams.set("kind", "blink");
  iconUrl.searchParams.set("spots", String(waitlistCount));
  iconUrl.searchParams.set("goal", "1,000");
  if (openPrize > 0) {
    iconUrl.searchParams.set("pool", openPrize.toLocaleString("en-US"));
  }

  return NextResponse.json(
    {
      type: "action",
      icon: iconUrl.toString(),
      title: "Other World Projex ($OWP) — Bounty Arcade & Airdrop",
      description:
        `${waitlistCount}/1,000 early-holder Airdrop spots claimed (hold ${CONFIG.waitlistMinHoldRibbit.toLocaleString("en-US")} $OWP). ` +
        (openCount > 0
          ? `${openCount} live bounties totaling ${openPrize.toLocaleString("en-US")} $OWP on the board now. `
          : "Provably-fair tables (4% house edge) & replay-verified free arcade. ") +
        "Buy $OWP directly from the house treasury wallet or visit otherworldprojex.xyz to play.",
      label: "Buy $OWP",
      links: {
        actions: [
          {
            type: "transaction",
            label: "Buy 0.1 SOL of $OWP",
            href: `${origin}/api/actions/hunt?sol=0.1`,
          },
          {
            type: "transaction",
            label: "Buy 0.5 SOL of $OWP",
            href: `${origin}/api/actions/hunt?sol=0.5`,
          },
          {
            type: "transaction",
            label: "Buy 1 SOL of $OWP",
            href: `${origin}/api/actions/hunt?sol=1`,
          },
          {
            type: "transaction",
            label: "Buy Custom SOL",
            href: `${origin}/api/actions/hunt?sol={sol}`,
            parameters: [
              {
                name: "sol",
                label: "SOL amount (0.01 - 50)",
                required: true,
              },
            ],
          },
        ],
      },
    },
    { headers: ACTION_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!CONFIG.treasuryWallet) {
      return NextResponse.json(
        { message: "House treasury wallet is not configured." },
        { status: 503, headers: ACTION_HEADERS }
      );
    }
    const { searchParams } = new URL(req.url);
    const solParam = Number(searchParams.get("sol") ?? "0.1");
    if (!Number.isFinite(solParam) || solParam < 0.01 || solParam > 50) {
      return NextResponse.json(
        { message: "Enter a SOL amount between 0.01 and 50 SOL." },
        { status: 400, headers: ACTION_HEADERS }
      );
    }

    const body = (await req.json().catch(() => null)) as { account?: string } | null;
    if (!body?.account) {
      return NextResponse.json(
        { message: "Missing buyer wallet account." },
        { status: 400, headers: ACTION_HEADERS }
      );
    }

    let buyer: PublicKey;
    let treasury: PublicKey;
    try {
      buyer = new PublicKey(body.account);
      treasury = new PublicKey(CONFIG.treasuryWallet);
    } catch {
      return NextResponse.json(
        { message: "Invalid Solana wallet address." },
        { status: 400, headers: ACTION_HEADERS }
      );
    }

    const lamports = Math.round(solParam * LAMPORTS_PER_SOL);
    const conn = connection();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

    const tx = new Transaction({
      feePayer: buyer,
      blockhash,
      lastValidBlockHeight,
    }).add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: treasury,
        lamports,
      })
    );

    const serialized = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");

    return NextResponse.json(
      {
        type: "transaction",
        transaction: serialized,
        message: `Pay ${solParam} SOL to the Other World Projex house wallet, then redeem your tx signature on otherworldprojex.xyz/#buy to receive $OWP.`,
      },
      { headers: ACTION_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { message: "Could not build transaction right now — visit otherworldprojex.xyz/#buy." },
      { status: 500, headers: ACTION_HEADERS }
    );
  }
}
