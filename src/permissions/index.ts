/**
 * Permission System - Core Functions
 *
 * Role-based access control implementation for CHROTE Multiplayer.
 * See docs/PERMISSIONS.md for the full specification.
 */

import { ROLE_HIERARCHY, type Role } from "../db/schema";

export { type Role } from "../db/schema";

/**
 * Permission types that can be checked
 */
export type Permission =
  | "view"
  | "sendKeys"
  | "claim"
  | "createSession"
  | "deleteSession"
  | "createInvite"
  | "manageUsers"
  | "modifySettings"
  | "deleteWorkspace"
  | "transferOwnership";

/**
 * Minimum role required for each permission
 */
const PERMISSION_REQUIREMENTS: Record<Permission, Role> = {
  view: "viewer",
  sendKeys: "operator",
  claim: "operator",
  createSession: "operator",
  deleteSession: "admin",
  createInvite: "admin",
  manageUsers: "admin",
  modifySettings: "admin",
  deleteWorkspace: "owner",
  transferOwnership: "owner",
};

/**
 * Check if a role meets the minimum required level
 */
export function hasMinRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const requiredRole = PERMISSION_REQUIREMENTS[permission];
  return hasMinRole(role, requiredRole);
}

/**
 * Get the minimum role required for a permission
 */
export function getRequiredRole(permission: Permission): Role {
  return PERMISSION_REQUIREMENTS[permission];
}

// === Convenience Functions ===

/**
 * Check if user can send keys to terminal
 */
export function canSendKeys(role: Role): boolean {
  return hasMinRole(role, "operator");
}

/**
 * Check if user can claim sessions
 */
export function canClaim(role: Role): boolean {
  return hasMinRole(role, "operator");
}

/**
 * Check if user can create terminal sessions
 */
export function canCreateSession(role: Role): boolean {
  return hasMinRole(role, "operator");
}

/**
 * Check if user can delete terminal sessions
 */
export function canDeleteSession(role: Role): boolean {
  return hasMinRole(role, "admin");
}

/**
 * Check if user can manage other users (promote, demote, remove)
 */
export function canManageUsers(role: Role): boolean {
  return hasMinRole(role, "admin");
}

/**
 * Check if user can create invite links
 */
export function canCreateInvite(role: Role): boolean {
  return hasMinRole(role, "admin");
}

/**
 * Check if user can modify workspace settings
 */
export function canModifySettings(role: Role): boolean {
  return hasMinRole(role, "admin");
}

/**
 * Check if user can delete the workspace
 */
export function canDeleteWorkspace(role: Role): boolean {
  return role === "owner";
}

/**
 * Check if user can transfer workspace ownership
 */
export function canTransferOwnership(role: Role): boolean {
  return role === "owner";
}

/**
 * Check if user can override another user's claim
 */
export function canOverrideClaim(role: Role): boolean {
  return hasMinRole(role, "admin");
}
