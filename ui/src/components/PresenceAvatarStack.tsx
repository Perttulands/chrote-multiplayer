/**
 * Presence Avatar Stack
 *
 * Shows stacked avatars of users watching a session with:
 * - Up to 4 visible avatars
 * - Overflow count for 5+ users
 * - Lock icon for claimed sessions
 * - Tooltips with full names on hover
 */

import { memo, useState } from 'react'
import type { Participant } from '@/types'
import type { AwarenessUser } from '@/hooks/useYjsCollaboration'

/** User data for avatar display (unified interface) */
interface AvatarUser {
  id: string
  name: string
  avatarUrl?: string
  color?: string
  isOnline?: boolean
}

interface PresenceAvatarStackProps {
  /** Participants from session data */
  participants?: Participant[]
  /** Real-time awareness users (merged with participants) */
  awarenessUsers?: AwarenessUser[]
  /** User ID who has claimed/locked this session */
  lockedBy?: string | null
  /** Name of the user who locked the session */
  lockedByName?: string | null
  /** Maximum visible avatars before overflow (default: 4) */
  maxVisible?: number
  /** Size variant */
  size?: 'sm' | 'md'
}

/** Default user colors for users without a defined color */
const DEFAULT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
]

/** Get consistent color for a user ID */
function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length]
}

/** Get user initials from name */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Individual avatar with tooltip */
const Avatar = memo(function Avatar({
  user,
  size,
  zIndex,
}: {
  user: AvatarUser
  size: 'sm' | 'md'
  zIndex: number
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const initials = getInitials(user.name)
  const color = user.color || getUserColor(user.id)

  const sizeClasses = size === 'sm'
    ? 'w-5 h-5 text-[10px]'
    : 'w-6 h-6 text-xs'

  return (
    <div
      className="relative"
      style={{ zIndex }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.name}
          className={`${sizeClasses} rounded-full object-cover ring-2 ring-terminal-bg`}
        />
      ) : (
        <div
          className={`${sizeClasses} rounded-full flex items-center justify-center font-medium text-white ring-2 ring-terminal-bg`}
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
      )}

      {/* Online indicator */}
      {user.isOnline && (
        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-accent-success rounded-full ring-1 ring-terminal-bg" />
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-terminal-surface border border-terminal-border rounded text-xs text-gray-100 whitespace-nowrap shadow-lg z-50 pointer-events-none">
          {user.name}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-terminal-surface" />
        </div>
      )}
    </div>
  )
})

/** Lock icon component */
const LockIcon = memo(function LockIcon({
  lockedByName,
  size,
}: {
  lockedByName: string
  size: 'sm' | 'md'
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const sizeClasses = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`${sizeClasses} rounded-full bg-accent-warning/20 flex items-center justify-center ring-2 ring-terminal-bg`}
      >
        <svg
          className={`${iconSize} text-accent-warning`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-terminal-surface border border-terminal-border rounded text-xs text-gray-100 whitespace-nowrap shadow-lg z-50 pointer-events-none">
          Claimed by {lockedByName}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-terminal-surface" />
        </div>
      )}
    </div>
  )
})

/** Overflow count badge */
const OverflowBadge = memo(function OverflowBadge({
  count,
  users,
  size,
}: {
  count: number
  users: AvatarUser[]
  size: 'sm' | 'md'
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const sizeClasses = size === 'sm'
    ? 'w-5 h-5 text-[10px]'
    : 'w-6 h-6 text-xs'

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`${sizeClasses} rounded-full bg-terminal-surface flex items-center justify-center font-medium text-gray-400 ring-2 ring-terminal-bg`}
      >
        +{count}
      </div>

      {/* Tooltip with all overflow names */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-terminal-surface border border-terminal-border rounded text-xs text-gray-100 shadow-lg z-50 pointer-events-none">
          <div className="space-y-0.5">
            {users.map((user) => (
              <div key={user.id} className="whitespace-nowrap">
                {user.name}
              </div>
            ))}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-terminal-surface" />
        </div>
      )}
    </div>
  )
})

/**
 * Presence Avatar Stack Component
 */
export const PresenceAvatarStack = memo(function PresenceAvatarStack({
  participants = [],
  awarenessUsers = [],
  lockedBy,
  lockedByName,
  maxVisible = 4,
  size = 'sm',
}: PresenceAvatarStackProps) {
  // Merge participants and awareness users, deduplicating by ID
  const allUsers = new Map<string, AvatarUser>()

  // Add participants first (base data)
  for (const p of participants) {
    allUsers.set(p.userId, {
      id: p.userId,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      isOnline: p.isOnline,
    })
  }

  // Overlay with awareness users (real-time data)
  for (const u of awarenessUsers) {
    const existing = allUsers.get(u.id)
    allUsers.set(u.id, {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatar || existing?.avatarUrl,
      color: u.color,
      isOnline: true, // Awareness users are always online
    })
  }

  const users = Array.from(allUsers.values())
  const onlineUsers = users.filter((u) => u.isOnline)
  const visibleUsers = onlineUsers.slice(0, maxVisible)
  const overflowUsers = onlineUsers.slice(maxVisible)
  const overflowCount = overflowUsers.length

  if (onlineUsers.length === 0 && !lockedBy) {
    return null
  }

  return (
    <div className="flex items-center">
      {/* Lock icon (shown first if session is claimed) */}
      {lockedBy && lockedByName && (
        <div className="mr-1">
          <LockIcon lockedByName={lockedByName} size={size} />
        </div>
      )}

      {/* Stacked avatars */}
      <div className="flex -space-x-1.5">
        {visibleUsers.map((user, i) => (
          <Avatar
            key={user.id}
            user={user}
            size={size}
            zIndex={visibleUsers.length - i}
          />
        ))}

        {/* Overflow badge */}
        {overflowCount > 0 && (
          <OverflowBadge
            count={overflowCount}
            users={overflowUsers}
            size={size}
          />
        )}
      </div>
    </div>
  )
})

export default PresenceAvatarStack
