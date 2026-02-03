/**
 * CHROTE Multiplayer - Shared Types
 */

export interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
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
