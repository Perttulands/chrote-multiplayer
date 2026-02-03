/**
 * Permission Middleware
 *
 * Role-based access control middleware for Hono routes.
 * See docs/PERMISSIONS.md for the full specification.
 */

import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./auth";
import {
  hasPermission,
  getRequiredRole,
  type Permission,
  type Role,
} from "../permissions";

/**
 * Permission error response format
 */
interface PermissionError {
  error: "UNAUTHORIZED" | "FORBIDDEN";
  message: string;
  required?: Role;
  current?: Role;
  action?: string;
}

/**
 * Require authentication middleware
 *
 * Returns 401 if user is not authenticated.
 */
export const requireAuth = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const user = c.var.user;

  if (!user) {
    const error: PermissionError = {
      error: "UNAUTHORIZED",
      message: "Authentication required",
    };
    return c.json(error, 401);
  }

  return next();
});

/**
 * Require specific permission middleware factory
 *
 * Returns 403 if user doesn't have the required permission.
 *
 * @param permission - The permission to require
 *
 * @example
 * ```typescript
 * app.post('/api/invites', requirePermission('createInvite'), createInvite);
 * ```
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<{
    Variables: AuthVariables;
  }>(async (c, next) => {
    const user = c.var.user;

    if (!user) {
      const error: PermissionError = {
        error: "UNAUTHORIZED",
        message: "Authentication required",
      };
      return c.json(error, 401);
    }

    if (!hasPermission(user.role, permission)) {
      const error: PermissionError = {
        error: "FORBIDDEN",
        message: `Permission denied: ${permission} requires ${getRequiredRole(permission)} role`,
        required: getRequiredRole(permission),
        current: user.role,
        action: permission,
      };
      return c.json(error, 403);
    }

    return next();
  });
}

/**
 * Require minimum role middleware factory
 *
 * Returns 403 if user's role is below the required level.
 *
 * @param role - The minimum role required
 *
 * @example
 * ```typescript
 * app.delete('/api/workspace', requireRole('owner'), deleteWorkspace);
 * ```
 */
export function requireRole(role: Role) {
  const permissionMap: Record<Role, Permission> = {
    viewer: "view",
    operator: "sendKeys",
    admin: "manageUsers",
    owner: "deleteWorkspace",
  };

  return requirePermission(permissionMap[role]);
}

/**
 * Shorthand middleware for common role requirements
 */
export const requireViewer = requirePermission("view");
export const requireOperator = requirePermission("sendKeys");
export const requireAdmin = requirePermission("manageUsers");
export const requireOwner = requirePermission("deleteWorkspace");
