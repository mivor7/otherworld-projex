import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids",
};

export async function GET() {
  return NextResponse.json(
    {
      rules: [
        { pathPattern: "/waitlist", apiPath: "/api/actions/hunt" },
        { pathPattern: "/bounties", apiPath: "/api/actions/hunt" },
        { pathPattern: "/api/actions/hunt", apiPath: "/api/actions/hunt" },
      ],
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
