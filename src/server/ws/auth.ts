/**
 * WebSocket Authentication
 *
 * Validates session cookies for WebSocket connections.
 */

import { createHash } from "crypto";
import { db, sessions, users } from "../../db";
import { eq, and, gt } from "drizzle-orm";
import type { Role } from "../../db/schema";

const SESSION_COOKIE_NAME = "chrote_session";

/**
 * Parse cookies from request
 */
function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) return cookies;

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name) {
      cookies.set(name, valueParts.join("="));
    }
  }

  return cookies;
}

/**
 * Hash session token for database lookup
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface WSAuthResult {
  userId: string;
  userName: string;
  role: Role;
}

/**
 * Authenticate WebSocket connection from session cookie
 *
 * @param request - Incoming HTTP upgrade request
 * @returns User info if authenticated, null otherwise
 */
export async function authenticateWSConnection(
  request: Request
): Promise<WSAuthResult | null> {
  const cookies = parseCookies(request);
  const token = cookies.get(SESSION_COOKIE_NAME);

  if (!token) {
    return null;
  }

  const hashedToken = hashToken(token);
  const now = new Date();

  // Find valid session with user
  const result = db
    .select({
      userId: users.id,
      userName: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(and(eq(sessions.id, hashedToken), gt(sessions.expires_at, now)))
    .get();

  if (!result) {
    return null;
  }

  return {
    userId: result.userId,
    userName: result.userName || "Anonymous",
    role: result.role as Role,
  };
}
