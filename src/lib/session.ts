/**
 * Session Management
 *
 * Handles user sessions with httpOnly cookies.
 * Sessions are stored in SQLite and validated on each request.
 */

import { nanoid } from "nanoid";
import { db, sessions, users, type User, type Session } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { createHash } from "crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// Session configuration
const SESSION_COOKIE_NAME = "chrote_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // Refresh if < 7 days left

// === Session Token Hashing ===
// Store hashed tokens in DB for security
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// === Create Session ===
export async function createSession(
  userId: string,
  ctx: Context
): Promise<string> {
  const token = nanoid(32);
  const hashedToken = hashToken(token);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  // Get request metadata
  const userAgent = ctx.req.header("user-agent") || null;
  const ip =
    ctx.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    ctx.req.header("x-real-ip") ||
    "unknown";

  // Insert session
  db.insert(sessions)
    .values({
      id: hashedToken,
      user_id: userId,
      user_agent: userAgent,
      ip_address: ip,
      expires_at: expiresAt,
      last_active_at: now,
    })
    .run();

  // Set httpOnly cookie
  setCookie(ctx, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  return token;
}

// === Validate Session ===
export async function validateSession(
  ctx: Context
): Promise<{ user: User; session: Session } | null> {
  const token = getCookie(ctx, SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const hashedToken = hashToken(token);
  const now = new Date();

  // Find session with user
  const result = db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(and(eq(sessions.id, hashedToken), gt(sessions.expires_at, now)))
    .get();

  if (!result) {
    // Invalid or expired session - clear cookie
    deleteCookie(ctx, SESSION_COOKIE_NAME);
    return null;
  }

  const { sessions: session, users: user } = result;

  // Refresh session if close to expiry
  const timeRemaining = session.expires_at.getTime() - now.getTime();
  if (timeRemaining < SESSION_REFRESH_THRESHOLD_MS) {
    const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    db.update(sessions)
      .set({
        expires_at: newExpiresAt,
        last_active_at: now,
      })
      .where(eq(sessions.id, hashedToken))
      .run();

    // Refresh cookie
    setCookie(ctx, SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_DURATION_MS / 1000,
    });
  } else {
    // Just update last_active
    db.update(sessions)
      .set({ last_active_at: now })
      .where(eq(sessions.id, hashedToken))
      .run();
  }

  // Update user last_seen
  db.update(users)
    .set({ last_seen_at: now })
    .where(eq(users.id, user.id))
    .run();

  return { user, session };
}

// === Invalidate Session ===
export async function invalidateSession(ctx: Context): Promise<void> {
  const token = getCookie(ctx, SESSION_COOKIE_NAME);
  if (token) {
    const hashedToken = hashToken(token);
    db.delete(sessions).where(eq(sessions.id, hashedToken)).run();
  }

  deleteCookie(ctx, SESSION_COOKIE_NAME);
}

// === Invalidate All User Sessions ===
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  db.delete(sessions).where(eq(sessions.user_id, userId)).run();
}

// === Get Current User (helper) ===
export async function getCurrentUser(ctx: Context): Promise<User | null> {
  const result = await validateSession(ctx);
  return result?.user || null;
}
