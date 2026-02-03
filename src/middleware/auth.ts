/**
 * Authentication Middleware
 *
 * Validates session cookies for HTTP requests.
 */

import { createMiddleware } from "hono/factory";
import { createHash } from "crypto";
import { db, sessions, users } from "../db";
import { eq, and, gt } from "drizzle-orm";
import type { Role } from "../db/schema";

const SESSION_COOKIE_NAME = "chrote_session";

/**
 * Authenticated user context
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/**
 * Variables added to context by auth middleware
 */
export interface AuthVariables {
  user: AuthUser | null;
}

/**
 * Hash session token for database lookup
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parse cookies from request
 */
function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = cookie.trim().split("=");
    if (cookieName === name) {
      return valueParts.join("=");
    }
  }
  return undefined;
}

/**
 * Authentication middleware
 *
 * Adds `c.var.user` to the context:
 * - AuthUser object if authenticated
 * - null if not authenticated
 *
 * Does NOT block requests - use requireAuth or requirePermission for that.
 */
export const authMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const token = getCookie(c.req.raw, SESSION_COOKIE_NAME);

  if (!token) {
    c.set("user", null);
    return next();
  }

  const hashedToken = hashToken(token);
  const now = new Date();

  // Find valid session with user
  const result = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(and(eq(sessions.id, hashedToken), gt(sessions.expires_at, now)))
    .get();

  if (!result) {
    c.set("user", null);
    return next();
  }

  c.set("user", {
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role as Role,
  });

  // Update last active timestamp
  db.update(sessions)
    .set({ last_active_at: now })
    .where(eq(sessions.id, hashedToken))
    .run();

  return next();
});
