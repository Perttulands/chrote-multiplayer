/**
 * Role Change Validation
 *
 * Validates role promotions, demotions, and user removals.
 * See docs/PERMISSIONS.md for the full specification.
 */

import { hasMinRole, type Role } from "./index";

export interface RoleChangeResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if actor can change target's role
 *
 * Rules:
 * - Only admin+ can change roles
 * - Cannot modify owner
 * - Cannot set to owner (use transfer instead)
 * - Admin can promote: viewer -> operator -> admin
 * - Admin can demote: operator -> viewer
 * - Admin cannot demote other admins
 */
export function canChangeRole(
  actorRole: Role,
  targetCurrentRole: Role,
  targetNewRole: Role
): RoleChangeResult {
  // Only admin+ can change roles
  if (!hasMinRole(actorRole, "admin")) {
    return { allowed: false, reason: "Only admins can change user roles" };
  }

  // Cannot modify owner
  if (targetCurrentRole === "owner") {
    return { allowed: false, reason: "Cannot modify owner role" };
  }

  // Cannot set to owner (only transfer works)
  if (targetNewRole === "owner") {
    return { allowed: false, reason: "Use ownership transfer instead" };
  }

  // No change
  if (targetCurrentRole === targetNewRole) {
    return { allowed: true };
  }

  // Owner can do anything (except above restrictions)
  if (actorRole === "owner") {
    return { allowed: true };
  }

  // Admin restrictions
  if (actorRole === "admin") {
    // Cannot demote other admins
    if (targetCurrentRole === "admin") {
      return { allowed: false, reason: "Admins cannot modify other admins" };
    }
    // Can promote/demote between viewer, operator, admin
    return { allowed: true };
  }

  return { allowed: false, reason: "Insufficient permissions" };
}

/**
 * Check if actor can remove target from workspace
 *
 * Rules:
 * - Only admin+ can remove users
 * - Cannot remove owner
 * - Admin cannot remove other admins
 */
export function canRemoveUser(
  actorRole: Role,
  targetRole: Role
): RoleChangeResult {
  if (!hasMinRole(actorRole, "admin")) {
    return { allowed: false, reason: "Only admins can remove users" };
  }

  if (targetRole === "owner") {
    return { allowed: false, reason: "Cannot remove workspace owner" };
  }

  if (actorRole === "admin" && targetRole === "admin") {
    return { allowed: false, reason: "Admins cannot remove other admins" };
  }

  return { allowed: true };
}

/**
 * Check if actor can transfer ownership to target
 *
 * Rules:
 * - Only owner can transfer ownership
 * - Target must be admin
 */
export function canTransferOwnershipTo(
  actorRole: Role,
  targetRole: Role
): RoleChangeResult {
  if (actorRole !== "owner") {
    return { allowed: false, reason: "Only owner can transfer ownership" };
  }

  if (targetRole !== "admin") {
    return {
      allowed: false,
      reason: "Can only transfer ownership to an admin",
    };
  }

  return { allowed: true };
}
