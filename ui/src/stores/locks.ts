/**
 * Locks Store
 *
 * Manages session lock state for claim controls.
 * Integrates with backend API for lock/release operations.
 */

import { create } from 'zustand'
import type { SessionLock, ControlRequest, UserRole } from '@/types'

// API base URL
const API_BASE = import.meta.env.VITE_API_BASE || ''

/** Role hierarchy for permission checks */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
}

interface LocksState {
  /** Current locks by session ID */
  locks: Map<string, SessionLock>

  /** Pending control requests */
  controlRequests: Map<string, ControlRequest[]>

  /** Loading state per session */
  loading: Map<string, boolean>

  /** Error state per session */
  errors: Map<string, string>

  /** Fetch all current locks from server */
  fetchLocks: () => Promise<void>

  /** Claim/lock a session */
  claimSession: (sessionId: string, userId: string, userName: string) => Promise<boolean>

  /** Release a session lock */
  releaseSession: (sessionId: string, userId: string, userRole: UserRole) => Promise<boolean>

  /** Request control from current holder */
  requestControl: (sessionId: string, requesterId: string, requesterName: string) => void

  /** Force release (admin only) */
  forceRelease: (sessionId: string, adminId: string, adminRole: UserRole) => Promise<boolean>

  /** Check if user can claim a session */
  canClaim: (sessionId: string, userId: string, userRole: UserRole) => boolean

  /** Check if user holds a lock */
  holdsLock: (sessionId: string, userId: string) => boolean

  /** Get lock for a session */
  getLock: (sessionId: string) => SessionLock | undefined

  /** Update lock state (from WebSocket) */
  setLock: (sessionId: string, lock: SessionLock | null) => void

  /** Clear all locks */
  clearLocks: () => void
}

export const useLocksStore = create<LocksState>((set, get) => ({
  locks: new Map(),
  controlRequests: new Map(),
  loading: new Map(),
  errors: new Map(),

  fetchLocks: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/terminal/locks`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch locks')
      }

      const data = await response.json()
      const locks = new Map<string, SessionLock>()

      // Convert array to map
      if (data.locks) {
        for (const [sessionId, lock] of Object.entries(data.locks)) {
          if (lock) {
            locks.set(sessionId, {
              sessionId,
              lockedBy: lock as { id: string; name: string },
            })
          }
        }
      }

      set({ locks })
    } catch (error) {
      console.error('[Locks] Failed to fetch locks:', error)
    }
  },

  claimSession: async (sessionId, userId, userName) => {
    const { locks, loading } = get()

    // Prevent double-clicks
    if (loading.get(sessionId)) return false

    set({ loading: new Map(loading).set(sessionId, true) })

    try {
      const response = await fetch(`${API_BASE}/api/terminal/sessions/${sessionId}/lock`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        const errors = new Map(get().errors)
        errors.set(sessionId, data.error || 'Failed to claim session')
        set({ errors })
        return false
      }

      // Update lock state
      const newLocks = new Map(get().locks)
      newLocks.set(sessionId, {
        sessionId,
        lockedBy: { id: userId, name: userName },
      })

      set({ locks: newLocks })
      return true
    } catch (error) {
      console.error('[Locks] Failed to claim session:', error)
      const errors = new Map(get().errors)
      errors.set(sessionId, 'Network error')
      set({ errors })
      return false
    } finally {
      const newLoading = new Map(get().loading)
      newLoading.delete(sessionId)
      set({ loading: newLoading })
    }
  },

  releaseSession: async (sessionId, userId, userRole) => {
    const { locks, loading } = get()
    const lock = locks.get(sessionId)

    // Can't release what's not locked
    if (!lock) return false

    // Only holder or admin+ can release
    if (lock.lockedBy.id !== userId && ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.admin) {
      return false
    }

    // Prevent double-clicks
    if (loading.get(sessionId)) return false

    set({ loading: new Map(loading).set(sessionId, true) })

    try {
      const response = await fetch(`${API_BASE}/api/terminal/sessions/${sessionId}/release`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        const errors = new Map(get().errors)
        errors.set(sessionId, data.error || 'Failed to release session')
        set({ errors })
        return false
      }

      // Update lock state
      const newLocks = new Map(get().locks)
      newLocks.delete(sessionId)

      set({ locks: newLocks })
      return true
    } catch (error) {
      console.error('[Locks] Failed to release session:', error)
      const errors = new Map(get().errors)
      errors.set(sessionId, 'Network error')
      set({ errors })
      return false
    } finally {
      const newLoading = new Map(get().loading)
      newLoading.delete(sessionId)
      set({ loading: newLoading })
    }
  },

  requestControl: (sessionId, requesterId, requesterName) => {
    const { controlRequests } = get()
    const requests = controlRequests.get(sessionId) || []

    // Don't add duplicate requests
    if (requests.some(r => r.requesterId === requesterId)) {
      return
    }

    const newRequests = new Map(controlRequests)
    newRequests.set(sessionId, [
      ...requests,
      {
        sessionId,
        requesterId,
        requesterName,
        timestamp: Date.now(),
      },
    ])

    set({ controlRequests: newRequests })

    // TODO: Send notification to lock holder via WebSocket
    console.log(`[Locks] Control requested for ${sessionId} by ${requesterName}`)
  },

  forceRelease: async (sessionId, adminId, adminRole) => {
    // Only admin+ can force release
    if (ROLE_HIERARCHY[adminRole] < ROLE_HIERARCHY.admin) {
      console.error('[Locks] Admin role required for force release')
      return false
    }

    return get().releaseSession(sessionId, adminId, adminRole)
  },

  canClaim: (sessionId, userId, userRole) => {
    const lock = get().locks.get(sessionId)

    // Not locked - anyone with operator+ can claim
    if (!lock) {
      return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY.operator
    }

    // Already holds lock
    if (lock.lockedBy.id === userId) {
      return false
    }

    // Locked by someone else - only admin+ can override
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY.admin
  },

  holdsLock: (sessionId, userId) => {
    const lock = get().locks.get(sessionId)
    return lock?.lockedBy.id === userId
  },

  getLock: (sessionId) => {
    return get().locks.get(sessionId)
  },

  setLock: (sessionId, lock) => {
    const newLocks = new Map(get().locks)
    if (lock) {
      newLocks.set(sessionId, lock)
    } else {
      newLocks.delete(sessionId)
    }
    set({ locks: newLocks })
  },

  clearLocks: () => {
    set({
      locks: new Map(),
      controlRequests: new Map(),
      loading: new Map(),
      errors: new Map(),
    })
  },
}))

export default useLocksStore
