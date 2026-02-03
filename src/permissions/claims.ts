/**
 * Claim Permission Functions
 *
 * Terminal session claiming permissions and validation.
 * See docs/PERMISSIONS.md for the full specification.
 */

import { db, claims } from "../db";
import { and, eq, isNull, gt } from "drizzle-orm";
import { hasMinRole, type Role } from "./index";

export interface ClaimCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ActiveClaim {
  id: string;
  sessionName: string;
  userId: string;
  expiresAt: Date | null;
  claimedAt: Date;
}

/**
 * Find active claim for a session
 */
export async function findActiveClaim(
  sessionName: string
): Promise<ActiveClaim | null> {
  const now = new Date();

  const claim = db
    .select({
      id: claims.id,
      sessionName: claims.session_name,
      userId: claims.user_id,
      expiresAt: claims.expires_at,
      claimedAt: claims.claimed_at,
    })
    .from(claims)
    .where(
      and(
        eq(claims.session_name, sessionName),
        eq(claims.claim_type, "control"),
        isNull(claims.released_at),
        // Not expired (null expires_at means no expiry)
        gt(claims.expires_at, now)
      )
    )
    .get();

  if (!claim) {
    // Also check for claims with no expiry
    const noExpiryResult = db
      .select({
        id: claims.id,
        sessionName: claims.session_name,
        userId: claims.user_id,
        expiresAt: claims.expires_at,
        claimedAt: claims.claimed_at,
      })
      .from(claims)
      .where(
        and(
          eq(claims.session_name, sessionName),
          eq(claims.claim_type, "control"),
          isNull(claims.released_at),
          isNull(claims.expires_at)
        )
      )
      .get();

    if (!noExpiryResult) {
      return null;
    }

    return noExpiryResult;
  }

  return claim;
}

/**
 * Check if user can send keys to a specific session
 *
 * Rules:
 * - Must be operator+ role
 * - If session is unclaimed, any operator+ can send
 * - If session is claimed, only claim owner can send
 */
export async function canSendKeysToSession(
  userId: string,
  userRole: Role,
  sessionName: string
): Promise<ClaimCheckResult> {
  // Must be operator+ to send keys
  if (!hasMinRole(userRole, "operator")) {
    return { allowed: false, reason: "Only operators can send keys" };
  }

  const activeClaim = await findActiveClaim(sessionName);

  if (!activeClaim) {
    // No active claim - any operator+ can send
    return { allowed: true };
  }

  // User holds the claim
  if (activeClaim.userId === userId) {
    return { allowed: true };
  }

  // Session is claimed by someone else
  return {
    allowed: false,
    reason: `Session is claimed by another user${
      activeClaim.expiresAt
        ? ` until ${activeClaim.expiresAt.toISOString()}`
        : ""
    }`,
  };
}

/**
 * Check if user can claim a session
 *
 * Rules:
 * - Must be operator+ role
 * - If session is unclaimed, any operator+ can claim
 * - If session is claimed by someone else, only admin+ can override
 */
export async function canClaimSession(
  userId: string,
  userRole: Role,
  sessionName: string
): Promise<ClaimCheckResult> {
  if (!hasMinRole(userRole, "operator")) {
    return { allowed: false, reason: "Only operators can claim sessions" };
  }

  const existingClaim = await findActiveClaim(sessionName);

  if (!existingClaim) {
    return { allowed: true };
  }

  // Already own the claim
  if (existingClaim.userId === userId) {
    return { allowed: true };
  }

  // Admin+ can override any claim
  if (hasMinRole(userRole, "admin")) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Session is claimed by another user${
      existingClaim.expiresAt
        ? ` until ${existingClaim.expiresAt.toISOString()}`
        : ""
    }`,
  };
}

/**
 * Check if user can release a claim
 *
 * Rules:
 * - Claim owner can always release their own claim
 * - Admin+ can release any claim
 */
export async function canReleaseClaim(
  userId: string,
  userRole: Role,
  sessionName: string
): Promise<ClaimCheckResult> {
  const claim = await findActiveClaim(sessionName);

  if (!claim) {
    return { allowed: false, reason: "No active claim on this session" };
  }

  // Claim owner can release
  if (claim.userId === userId) {
    return { allowed: true };
  }

  // Admin+ can release any claim
  if (hasMinRole(userRole, "admin")) {
    return { allowed: true };
  }

  return { allowed: false, reason: "You do not own this claim" };
}
