/**
 * Claim Controls Component
 *
 * UI for claiming, releasing, and requesting control of sessions.
 * Shows different controls based on lock state and user role.
 */

import { memo, useState } from 'react'
import { clsx } from 'clsx'
import type { UserRole } from '@/types'
import { useLocksStore } from '@/stores/locks'

interface ClaimControlsProps {
  sessionId: string
  userId: string
  userName: string
  userRole: UserRole
  /** Compact mode for sidebar (smaller buttons) */
  compact?: boolean
  /** Callback when lock state changes */
  onLockChange?: (locked: boolean, byCurrentUser: boolean) => void
}

/** Lock icon SVG */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

/** Unlock icon SVG */
function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  )
}

/** Hand raised icon for request */
function RequestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
    </svg>
  )
}

/** Shield icon for admin override */
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

/**
 * Claim Controls - shows appropriate buttons based on lock state and user role
 */
export const ClaimControls = memo(function ClaimControls({
  sessionId,
  userId,
  userName,
  userRole,
  compact = false,
  onLockChange,
}: ClaimControlsProps) {
  const [requestSent, setRequestSent] = useState(false)

  const {
    getLock,
    canClaim,
    holdsLock,
    claimSession,
    releaseSession,
    requestControl,
    forceRelease,
    loading,
  } = useLocksStore()

  const lock = getLock(sessionId)
  const isLoading = loading.get(sessionId) || false
  const userHoldsLock = holdsLock(sessionId, userId)
  const userCanClaim = canClaim(sessionId, userId, userRole)
  const isViewer = userRole === 'viewer'
  const isAdmin = userRole === 'admin' || userRole === 'owner'

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const success = await claimSession(sessionId, userId, userName)
    if (success) {
      onLockChange?.(true, true)
    }
  }

  const handleRelease = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const success = await releaseSession(sessionId, userId, userRole)
    if (success) {
      onLockChange?.(false, false)
    }
  }

  const handleRequest = (e: React.MouseEvent) => {
    e.stopPropagation()
    requestControl(sessionId, userId, userName)
    setRequestSent(true)
    // Reset after 5 seconds
    setTimeout(() => setRequestSent(false), 5000)
  }

  const handleForceRelease = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const success = await forceRelease(sessionId, userId, userRole)
    if (success) {
      onLockChange?.(false, false)
    }
  }

  // Button size classes
  const btnBase = compact
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5'

  const iconSize = compact ? 'w-3 h-3' : 'w-4 h-4'

  // Viewers can't interact with locks
  if (isViewer) {
    if (!lock) return null
    return (
      <div className={clsx('flex items-center gap-1 text-gray-500', compact ? 'text-xs' : 'text-sm')}>
        <LockIcon className={iconSize} />
        <span className="truncate max-w-20">{lock.lockedBy.name}</span>
      </div>
    )
  }

  // User holds the lock - show release button
  if (userHoldsLock) {
    return (
      <button
        onClick={handleRelease}
        disabled={isLoading}
        className={clsx(
          'flex items-center rounded-md font-medium transition-colors',
          'bg-accent-success/20 text-accent-success hover:bg-accent-success/30',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          btnBase
        )}
        title="Release control"
      >
        <UnlockIcon className={iconSize} />
        {!compact && <span>Release</span>}
      </button>
    )
  }

  // Session is not locked - show claim button
  if (!lock) {
    return (
      <button
        onClick={handleClaim}
        disabled={isLoading || !userCanClaim}
        className={clsx(
          'flex items-center rounded-md font-medium transition-colors',
          'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          btnBase
        )}
        title="Claim control"
      >
        <LockIcon className={iconSize} />
        {!compact && <span>Claim</span>}
      </button>
    )
  }

  // Session is locked by someone else
  return (
    <div className="flex items-center gap-1">
      {/* Lock holder indicator */}
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded-md bg-accent-warning/20 text-accent-warning',
          compact ? 'text-xs' : 'text-sm'
        )}
        title={`Locked by ${lock.lockedBy.name}`}
      >
        <LockIcon className={iconSize} />
        <span className="truncate max-w-16">{lock.lockedBy.name}</span>
      </div>

      {/* Request control button (operators) */}
      {!isAdmin && (
        <button
          onClick={handleRequest}
          disabled={requestSent}
          className={clsx(
            'flex items-center rounded-md font-medium transition-colors',
            requestSent
              ? 'bg-gray-500/20 text-gray-400'
              : 'bg-terminal-surface text-gray-300 hover:bg-terminal-hover',
            btnBase
          )}
          title={requestSent ? 'Request sent' : 'Request control'}
        >
          <RequestIcon className={iconSize} />
          {!compact && <span>{requestSent ? 'Sent' : 'Request'}</span>}
        </button>
      )}

      {/* Force release button (admins only) */}
      {isAdmin && (
        <button
          onClick={handleForceRelease}
          disabled={isLoading}
          className={clsx(
            'flex items-center rounded-md font-medium transition-colors',
            'bg-accent-error/20 text-accent-error hover:bg-accent-error/30',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            btnBase
          )}
          title="Force release (admin)"
        >
          <ShieldIcon className={iconSize} />
          {!compact && <span>Force</span>}
        </button>
      )}
    </div>
  )
})

/**
 * Lock Status Badge - simple indicator for lock state
 */
export const LockStatusBadge = memo(function LockStatusBadge({
  sessionId,
  userId,
  compact = false,
}: {
  sessionId: string
  userId: string
  compact?: boolean
}) {
  const lock = useLocksStore((s) => s.getLock(sessionId))
  const iconSize = compact ? 'w-3 h-3' : 'w-4 h-4'

  if (!lock) {
    return (
      <div className="flex items-center gap-1 text-accent-success" title="Available">
        <UnlockIcon className={iconSize} />
      </div>
    )
  }

  const isOwnLock = lock.lockedBy.id === userId

  return (
    <div
      className={clsx(
        'flex items-center gap-1',
        isOwnLock ? 'text-accent-success' : 'text-accent-warning'
      )}
      title={isOwnLock ? 'You have control' : `Locked by ${lock.lockedBy.name}`}
    >
      <LockIcon className={iconSize} />
      {!compact && (
        <span className={clsx('truncate', compact ? 'max-w-12 text-xs' : 'max-w-20 text-sm')}>
          {isOwnLock ? 'You' : lock.lockedBy.name}
        </span>
      )}
    </div>
  )
})

export default ClaimControls
