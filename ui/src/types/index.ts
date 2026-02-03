/**
 * CHROTE Multiplayer - Shared Types
 */

/** User roles with hierarchy: owner > admin > operator > viewer */
export type UserRole = 'owner' | 'admin' | 'operator' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role?: UserRole
}

/** Lock state for a session */
export interface SessionLock {
  sessionId: string
  lockedBy: {
    id: string
    name: string
  }
}

/** Control request from an operator */
export interface ControlRequest {
  sessionId: string
  requesterId: string
  requesterName: string
  timestamp: number
}

export interface Session {
  id: string
  name: string
  hostId: string
  tmuxSession: string
  createdAt: Date
  participants: Participant[]
  status: 'active' | 'paused' | 'ended'
}

export interface Participant {
  userId: string
  user: User
  role: 'host' | 'viewer' | 'controller'
  joinedAt: Date
  lastSeen: Date
  isOnline: boolean
  cursorPosition?: CursorPosition
}

export interface CursorPosition {
  x: number
  y: number
}

export type PresenceStatus = 'online' | 'idle' | 'offline'

export interface TerminalOutput {
  sessionId: string
  data: string
  timestamp: number
}

// WebSocket message types
export type WSMessageType =
  | 'terminal:output'
  | 'terminal:input'
  | 'terminal:resize'
  | 'presence:update'
  | 'session:join'
  | 'session:leave'
  | 'claim:request'
  | 'claim:grant'
  | 'claim:revoke'

export interface WSMessage<T = unknown> {
  type: WSMessageType
  payload: T
  timestamp: number
}

// Invite types
export type InviteRole = 'viewer' | 'operator' | 'admin'

export interface Invite {
  id: string
  role: InviteRole
  note?: string
  uses: number
  max_uses: number | null
  revoked: boolean
  created_at: string
  expires_at: string | null
  created_by: string
  creator_name?: string
  creator_email?: string
  is_active: boolean
}

export interface CreateInviteRequest {
  role: InviteRole
  note?: string
  max_uses?: number
  expires_in_days?: number
}

export interface CreateInviteResponse {
  id: string
  token: string
  url: string
  role: InviteRole
  note?: string
  max_uses?: number
  expires_at?: string
}
