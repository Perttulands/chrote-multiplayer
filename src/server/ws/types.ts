/**
 * WebSocket Protocol Types
 *
 * Message formats for client-server communication.
 */

import type { TmuxSession } from "../tmux/types";
import type { Role } from "../../db/schema";

// ============================================================================
// Client -> Server Messages
// ============================================================================

export interface SubscribeMessage {
  type: "subscribe";
  sessionId: string;
  pane?: string;
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  sessionId: string;
  pane?: string;
}

export interface SendKeysMessage {
  type: "sendKeys";
  sessionId: string;
  keys: string;
  pane?: string;
}

export interface HeartbeatMessage {
  type: "heartbeat";
}

export interface ClaimMessage {
  type: "claim";
  sessionId: string;
}

export interface ReleaseMessage {
  type: "release";
  sessionId: string;
}

export interface ListSessionsMessage {
  type: "listSessions";
}

export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | SendKeysMessage
  | HeartbeatMessage
  | ClaimMessage
  | ReleaseMessage
  | ListSessionsMessage;

// ============================================================================
// Server -> Client Messages
// ============================================================================

export interface OutputMessage {
  type: "output";
  sessionId: string;
  pane: string;
  data: string;
  timestamp: string;
}

export interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  status: "viewing" | "controlling";
}

export interface PresenceMessage {
  type: "presence";
  sessionId: string;
  users: PresenceUser[];
}

export interface ClaimedMessage {
  type: "claimed";
  sessionId: string;
  by: {
    id: string;
    name: string;
  };
}

export interface ReleasedMessage {
  type: "released";
  sessionId: string;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
  requestId?: string;
}

export interface SessionsMessage {
  type: "sessions";
  sessions: TmuxSession[];
}

export interface SessionCreatedMessage {
  type: "sessionCreated";
  session: TmuxSession;
}

export interface SessionDestroyedMessage {
  type: "sessionDestroyed";
  sessionId: string;
}

export interface ConnectedMessage {
  type: "connected";
  userId: string;
  role: Role;
}

export type ServerMessage =
  | OutputMessage
  | PresenceMessage
  | ClaimedMessage
  | ReleasedMessage
  | ErrorMessage
  | SessionsMessage
  | SessionCreatedMessage
  | SessionDestroyedMessage
  | ConnectedMessage;

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  // Authentication errors
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID: "AUTH_INVALID",
  AUTH_EXPIRED: "AUTH_EXPIRED",

  // Permission errors
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NOT_OPERATOR: "NOT_OPERATOR",

  // Session errors
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_CLAIMED: "SESSION_CLAIMED",
  NOT_CLAIMED: "NOT_CLAIMED",

  // Protocol errors
  INVALID_MESSAGE: "INVALID_MESSAGE",
  UNKNOWN_TYPE: "UNKNOWN_TYPE",

  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  TMUX_ERROR: "TMUX_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// Internal Types
// ============================================================================

/** Connected client state */
export interface ClientState {
  /** Client ID (connection-specific) */
  id: string;
  /** User ID from session cookie */
  userId: string;
  /** User's display name */
  userName: string;
  /** User's role */
  role: Role;
  /** Sessions this client is subscribed to */
  subscriptions: Set<string>;
  /** Last heartbeat timestamp */
  lastHeartbeat: Date;
  /** WebSocket instance */
  // ws: WebSocket stored separately to avoid circular refs
}

/** Session claim state */
export interface ClaimState {
  /** Session being claimed */
  sessionId: string;
  /** User who has control */
  userId: string;
  userName: string;
}
