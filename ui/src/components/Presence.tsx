/**
 * Presence Components
 *
 * Live cursors and user presence indicators for collaboration.
 */

import { memo } from 'react'
import type { AwarenessUser } from '@/hooks/useYjsCollaboration'

/** Props for a single cursor */
interface CursorProps {
  user: AwarenessUser
}

/**
 * Single user cursor with name tag
 */
export const Cursor = memo(function Cursor({ user }: CursorProps) {
  if (!user.cursor) return null

  const { x, y } = user.cursor

  return (
    <div
      className="pointer-events-none absolute z-50 transition-transform duration-75"
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      {/* Cursor arrow */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
        }}
      >
        <path
          d="M5.5 3.5L18.5 12L12.5 13.5L9.5 20.5L5.5 3.5Z"
          fill={user.color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* Name tag */}
      <div
        className="absolute left-4 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white shadow-md"
        style={{ backgroundColor: user.color }}
      >
        {user.name}
      </div>
    </div>
  )
})

/** Props for cursors container */
interface LiveCursorsProps {
  users: AwarenessUser[]
}

/**
 * Container for all live cursors
 */
export const LiveCursors = memo(function LiveCursors({ users }: LiveCursorsProps) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {users.map((user) => (
        <Cursor key={user.id} user={user} />
      ))}
    </div>
  )
})

/** Props for presence list */
interface PresenceListProps {
  users: AwarenessUser[]
  currentUserId: string
}

/**
 * Sidebar list of online users
 */
export const PresenceList = memo(function PresenceList({
  users,
  currentUserId: _currentUserId,
}: PresenceListProps) {
  // Filter out stale users (inactive for > 5 minutes)
  const activeUsers = users.filter(
    (u) => Date.now() - u.lastActive < 5 * 60 * 1000
  )

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase text-gray-400">
        Online ({activeUsers.length + 1})
      </h3>
      <ul className="space-y-1">
        {/* Current user (always first) */}
        <li className="flex items-center gap-2 rounded px-2 py-1 bg-terminal-hover">
          <span
            className="h-2 w-2 rounded-full ring-2 ring-green-500/30"
            style={{ backgroundColor: '#4ADE80' }}
          />
          <span className="text-sm text-terminal-text">You</span>
        </li>

        {/* Other users */}
        {activeUsers.map((user) => (
          <li
            key={user.id}
            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-terminal-hover"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: user.color }}
            />
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-5 w-5 rounded-full"
              />
            ) : null}
            <span className="text-sm text-terminal-text truncate">
              {user.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
})

/** Connection status indicator */
interface ConnectionStatusProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'synced'
}

export const ConnectionStatus = memo(function ConnectionStatus({
  status,
}: ConnectionStatusProps) {
  const statusConfig = {
    disconnected: {
      color: 'bg-red-500',
      text: 'Disconnected',
    },
    connecting: {
      color: 'bg-yellow-500 animate-pulse',
      text: 'Connecting...',
    },
    connected: {
      color: 'bg-green-500',
      text: 'Connected',
    },
    synced: {
      color: 'bg-green-500',
      text: 'Synced',
    },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className={`h-2 w-2 rounded-full ${config.color}`} />
      <span>{config.text}</span>
    </div>
  )
})

export default {
  Cursor,
  LiveCursors,
  PresenceList,
  ConnectionStatus,
}
