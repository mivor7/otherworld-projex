import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") ?? "default";
  const pos = searchParams.get("pos");
  const spots = searchParams.get("spots") ?? "260";
  const goal = searchParams.get("goal") ?? "1,000";
  const pool = searchParams.get("pool") ?? "";
  const game = searchParams.get("game") ?? "Arcade";
  const payout = searchParams.get("payout") ?? "";
  const score = searchParams.get("score") ?? "";

  let kicker = "DECENTRALIZED BOUNTY ARCADE · SOLANA";
  let headline = "Token holders become bounty hunters.";
  let highlight = pool ? `${pool} $OWP LIVE BOUNTIES` : "$OWP · PROVABLY FAIR";
  let sub =
    "Deposit $OWP, wager at provably-fair tables, climb replay-verified arcade boards, and split live bounty pots.";

  if (kind === "waitlist") {
    kicker = "EARLY-HOLDER AIRDROP WAITLIST · SOLANA";
    headline = pos ? `Waitlist Spot #${pos} Locked` : "Claim Your $OWP Airdrop Spot";
    highlight = `${spots} / ${goal} SPOTS CLAIMED`;
    sub =
      "Hold 250,000 $OWP in your wallet to lock a numbered place in the first 1,000 holders. Refer hunters to climb the board.";
  } else if (kind === "win") {
    kicker = `VERIFIED TABLE WIN · ${game.toUpperCase()}`;
    headline = payout ? `Won +${payout} $OWP` : `Winning Round on ${game}`;
    highlight = "PROVABLY FAIR · 4% HOUSE EDGE";
    sub =
      "Every wager feeds the live table bounty pot. Verify every deal and roll on-chain at otherworld.fun.";
  } else if (kind === "score") {
    kicker = `REPLAY-VERIFIED ARCADE RUN · ${game.toUpperCase()}`;
    headline = score ? `Scored ${score} pts on ${game}` : `${game} Leaderboard Run`;
    highlight = pool ? `${pool} $OWP BOUNTY POOL` : "60 HZ DETERMINISTIC REPLAY";
    sub =
      "Free to play. Every run is replayed on the server before it ranks for weekly $OWP bounty pools.";
  } else if (kind === "blink") {
    kicker = "OTHER WORLD PROJEX · SOLANA BLINK";
    headline = "Buy $OWP & Enter the Bounty Arcade";
    highlight = `${spots} / ${goal} AIRDROP SPOTS · ${pool ? `${pool} $OWP LIVE` : "4% EDGE"}`;
    sub =
      "Hold 250,000 $OWP for the early-holder airdrop, wager at provably-fair tables, and hunt automated $OWP bounty pots.";
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #05090b 0%, #091512 55%, #060b0e 100%)",
          color: "#ecf5f0",
          fontFamily: "sans-serif",
          border: "2px solid rgba(94, 234, 148, 0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              fontSize: "20px",
              letterSpacing: "3px",
              color: "#6ee7a0",
              fontWeight: 700,
            }}
          >
            <span>◈</span>
            <span>{kicker}</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 18px",
              borderRadius: "999px",
              background: "rgba(110, 231, 160, 0.12)",
              border: "1px solid rgba(110, 231, 160, 0.35)",
              color: "#facc15",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "1.5px",
            }}
          >
            {highlight}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "22px",
            maxWidth: "980px",
          }}
        >
          <div
            style={{
              fontSize: "68px",
              fontWeight: 800,
              lineHeight: 1.08,
              color: "#f4fbf7",
              letterSpacing: "-1.5px",
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: "28px",
              lineHeight: 1.45,
              color: "#9ab3a6",
              maxWidth: "900px",
            }}
          >
            {sub}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            paddingTop: "28px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            fontSize: "22px",
            color: "#8aa396",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#6ee7a0", fontWeight: 700 }}>OTHER WORLD PROJEX</span>
            <span>·</span>
            <span>otherworld.fun</span>
          </div>
          <div style={{ display: "flex", gap: "24px", color: "#d1fae5", fontWeight: 600 }}>
            <span>Arcade</span>
            <span>·</span>
            <span>Bounties</span>
            <span>·</span>
            <span>Auctions</span>
            <span>·</span>
            <span>Airdrop</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
