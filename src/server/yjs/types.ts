/**
 * Yjs Collaboration Types
 *
 * Types for real-time collaboration state.
 */

import type { Role } from "../../db/schema";

/** User awareness state (presence) */
export interface AwarenessUser {
  /** User ID */
  id: string;
  /** Display name */
  name: string;
  /** Avatar URL */
  avatar?: string;
  /** User's role */
  role: Role;
  /** Cursor position on canvas */
  cursor?: {
    x: number;
    y: number;
  };
  /** Currently selected shape IDs */
  selection?: string[];
  /** Color assigned to this user */
  color: string;
  /** Last activity timestamp */
  lastActive: number;
}

/** Document metadata stored in Yjs */
export interface DocumentMeta {
  /** Document ID (room name) */
  id: string;
  /** Created timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
  /** Version number */
  version: number;
}

/** Connection context passed to Hocuspocus hooks */
export interface ConnectionContext {
  userId: string;
  userName: string;
  role: Role;
  sessionToken: string;
}

/** Colors for user presence */
export const USER_COLORS = [
  "#FF6B6B", // Red
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#96CEB4", // Green
  "#FFEAA7", // Yellow
  "#DDA0DD", // Plum
  "#98D8C8", // Mint
  "#F7DC6F", // Gold
  "#BB8FCE", // Purple
  "#85C1E9", // Sky
] as const;

/**
 * Get a consistent color for a user based on their ID
 */
export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}
