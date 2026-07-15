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

export async function verifySignInAndCreateSession(
  wallet: string,
  signatureB58: string
): Promise<{ userId: string; wallet: string } | null> {
  const jar = await cookies();
  const nonceJwt = jar.get(NONCE_COOKIE)?.value;
  if (!nonceJwt) return null;

  let nonce: string;
  try {
    const { payload } = await jwtVerify(nonceJwt, secretKey());
    if (payload.wallet !== wallet) return null;
    nonce = String(payload.nonce);
  } catch {
    return null;
  }

  const message = new TextEncoder().encode(buildSignInMessage(wallet, nonce));
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      message,
      bs58.decode(signatureB58),
      bs58.decode(wallet)
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const user = await prisma.user.upsert({
    where: { wallet },
    create: { wallet },
    update: {},
  });
  if (user.isBanned) return null;

  const session = await new SignJWT({ uid: user.id, wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secretKey());
  jar.delete(NONCE_COOKIE);
  jar.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600,
    path: "/",
  });
  return { userId: user.id, wallet };
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
