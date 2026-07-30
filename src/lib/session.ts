// Sign-In With Solana, stateless and serverless-safe.
//
// 1. POST /api/auth/nonce   -> server issues a message to sign and stores the
//    nonce in a short-lived signed cookie (no DB round-trip, works on Vercel).
// 2. POST /api/auth/verify  -> client sends the ed25519 signature; we check it
//    against the wallet pubkey and the nonce cookie, then set a session JWT.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "./db";
import { CONFIG, requireSessionSecret } from "./config";
import { houseConfig } from "./settings";

const SESSION_COOKIE = "owp_session";
const NONCE_COOKIE = "owp_nonce";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireSessionSecret());
}

export function buildSignInMessage(wallet: string, nonce: string): string {
  return [
    `${CONFIG.appName} — sign in`,
    ``,
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    ``,
    `This signature only proves wallet ownership.`,
    `It does not authorize any transaction.`,
  ].join("\n");
}

export async function issueNonce(wallet: string): Promise<string> {
  const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)));
  const jwt = await new SignJWT({ wallet, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secretKey());
  const jar = await cookies();
  jar.set(NONCE_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
  });
  return nonce;
}

export type SignInResult =
  | { ok: true; userId: string; wallet: string }
  | {
      ok: false;
      reason: "bad-signature" | "banned" | "invite-required" | "invite-invalid";
    };


/**
 * Verify wallet ownership (nonce cookie + ed25519 signature over the standard
 * sign-in message) WITHOUT touching accounts, invites or sessions. For flows
 * open to wallets that don't have an app account yet — e.g. joining the
 * airdrop waitlist while the invite gate is up.
 */
export async function verifyWalletSignature(
  wallet: string,
  signatureB58: string
): Promise<boolean> {
  const jar = await cookies();
  const nonceJwt = jar.get(NONCE_COOKIE)?.value;
  if (!nonceJwt) return false;
  let nonce: string;
  try {
    const { payload } = await jwtVerify(nonceJwt, secretKey());
    if (payload.wallet !== wallet) return false;
    nonce = String(payload.nonce);
  } catch {
    return false;
  }
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(buildSignInMessage(wallet, nonce)),
      bs58.decode(signatureB58),
      bs58.decode(wallet)
    );
  } catch {
    return false;
  }
}

export async function verifySignInAndCreateSession(
  wallet: string,
  signatureB58: string,
  inviteCode?: string
): Promise<SignInResult> {
  // Ownership proof is shared with the sessionless flows — one implementation,
  // no drift.
  if (!(await verifyWalletSignature(wallet, signatureB58))) {
    return { ok: false, reason: "bad-signature" };
  }

  // Invite-only gate: only the CREATION of a new account needs a code —
  // existing players (and the admins) sign in unaffected, and flipping the
  // switch off later opens the doors without a deploy.
  let user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) {
    if ((await houseConfig()).inviteRequired) {
      const code = (inviteCode ?? "").trim().toUpperCase();
      if (!code) return { ok: false, reason: "invite-required" };
      try {
        // Consume + create in ONE transaction: the uses<maxUses guard lives
        // INSIDE the UPDATE (same column-to-column pattern as the escrow
        // guards) so the last seat can't be double-claimed — and if the user
        // create fails for ANY reason, the rollback un-burns the seat.
        user = await prisma.$transaction(async (tx) => {
          const claimed = await tx.$executeRaw`
            UPDATE "InviteCode" SET "uses" = "uses" + 1
            WHERE "code" = ${code} AND "disabled" = false AND "uses" < "maxUses"
          `;
          if (claimed === 0) return null;
          return tx.user.create({ data: { wallet, invitedVia: code } });
        });
      } catch {
        // The same new wallet raced itself: the loser's create hit the unique
        // constraint, its transaction rolled back (seat returned), and the row
        // now exists from the winner.
        user = await prisma.user.findUnique({ where: { wallet } });
        if (!user) return { ok: false, reason: "invite-invalid" };
      }
      if (!user) return { ok: false, reason: "invite-invalid" };
    } else {
      try {
        user = await prisma.user.create({ data: { wallet } });
      } catch {
        // First sign-in raced itself (two tabs / double click): the loser's
        // create hits the unique wallet constraint — the row now exists.
        user = await prisma.user.findUnique({ where: { wallet } });
        if (!user) return { ok: false, reason: "bad-signature" };
      }
    }
  }
  if (user.isBanned) return { ok: false, reason: "banned" };

  const session = await new SignJWT({ uid: user.id, wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secretKey());
  const jar = await cookies();
  jar.delete(NONCE_COOKIE);
  jar.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600,
    path: "/",
  });
  return { ok: true, userId: user.id, wallet };
}

export type Session = { userId: string; wallet: string };

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { userId: String(payload.uid), wallet: String(payload.wallet) };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export function isAdminWallet(wallet: string): boolean {
  return CONFIG.adminWallets.includes(wallet);
}
