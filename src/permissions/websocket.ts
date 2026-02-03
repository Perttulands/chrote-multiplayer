/**
 * WebSocket Permission Checking
 *
 * Permission validation for WebSocket messages.
 * See docs/PERMISSIONS.md for the full specification.
 */

import { hasPermission, type Role, type Permission } from "./index";
import { canSendKeysToSession, canClaimSession, canReleaseClaim } from "./claims";

/**
 * WebSocket message types
 */
export type WSMessageType =
  | "subscribe"
  | "unsubscribe"
  | "sendKeys"
  | "claim"
  | "release"
  | "heartbeat";

/**
 * Permission check result
 */
export interface WSPermissionResult {
  allowed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Basic permission check for message type
 *
 * Checks role-level permission only, not session-specific logic.
 */
export function checkMessagePermission(
  role: Role,
  messageType: WSMessageType
): WSPermissionResult {
  const permissionMap: Partial<Record<WSMessageType, Permission>> = {
    sendKeys: "sendKeys",
    claim: "claim",
    // release, subscribe, unsubscribe, heartbeat require view only
  };

  const requiredPermission = permissionMap[messageType];

  // Default messages only require view permission (i.e., authenticated)
  if (!requiredPermission) {
    return { allowed: true };
  }

  if (!hasPermission(role, requiredPermission)) {
    return {
      allowed: false,
      errorCode: "FORBIDDEN",
      errorMessage: `${requiredPermission} permission required`,
    };
  }

  return { allowed: true };
}

/**
 * Full permission check for sendKeys
 *
 * Checks both role and session claim status.
 */
export async function checkSendKeysPermission(
  userId: string,
  role: Role,
  sessionName: string
): Promise<WSPermissionResult> {
  const result = await canSendKeysToSession(userId, role, sessionName);

  if (!result.allowed) {
    return {
      allowed: false,
      errorCode: "FORBIDDEN",
      errorMessage: result.reason || "Cannot send keys to this session",
    };
  }

  return { allowed: true };
}

/**
 * Full permission check for claim
 *
 * Checks both role and existing claim status.
 */
export async function checkClaimPermission(
  userId: string,
  role: Role,
  sessionName: string
): Promise<WSPermissionResult> {
  const result = await canClaimSession(userId, role, sessionName);

  if (!result.allowed) {
    return {
      allowed: false,
      errorCode: result.reason?.includes("claimed") ? "CLAIM_REQUIRED" : "FORBIDDEN",
      errorMessage: result.reason || "Cannot claim this session",
    };
  }

  return { allowed: true };
}

/**
 * Full permission check for release
 *
 * Checks claim ownership or admin override.
 */
export async function checkReleasePermission(
  userId: string,
  role: Role,
  sessionName: string
): Promise<WSPermissionResult> {
  const result = await canReleaseClaim(userId, role, sessionName);

  if (!result.allowed) {
    return {
      allowed: false,
      errorCode: "FORBIDDEN",
      errorMessage: result.reason || "Cannot release this claim",
    };
  }

  return { allowed: true };
}

/**
 * WebSocket error codes
 */
export const WS_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CLAIM_REQUIRED: "CLAIM_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  INVALID_MESSAGE: "INVALID_MESSAGE",
} as const;
