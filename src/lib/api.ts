import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { getSession, isAdminWallet, type Session } from "./session";
import { jsonSafe, prisma } from "./db";
import { InsufficientCredits } from "./credits";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(jsonSafe(data), { status: init ?? 200 });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError("Sign in with your wallet first", 401);
  // Bans bite immediately — not just at the next sign-in. Session JWTs
  // outlive a ban, so re-check the flag on every authenticated request.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isBanned: true },
  });
  if (!user || user.isBanned) throw new ApiError("This wallet is suspended", 403);
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isAdminWallet(session.wallet)) throw new ApiError("Admin only", 403);
  return session;
}

/** Wrap a route handler with uniform error handling. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return err(e.message, e.status);
      if (e instanceof InsufficientCredits) return err("Insufficient credits", 400);
      if (e instanceof ZodError)
        return err(e.issues.map((i) => i.message).join("; "), 422);
      // Unique-constraint race (two truly-concurrent submits of the same tx
      // signature): the DB guard holds — no double credit — so answer with a
      // friendly conflict instead of a generic 500.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // Keep conflicts visible in logs — a future unique constraint hit by a
        // real logic bug must not vanish into a polite 409.
        console.warn("unique-constraint conflict (409):", e.meta?.target ?? "");
        return err("Already processed — this was submitted before", 409);
      }
      console.error(e);
      return err("Internal error", 500);
    }
  };
}
