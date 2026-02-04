/**
 * Session Awareness Hook
 *
 * Tracks which users are watching which sessions in real-time.
 * Provides awareness data grouped by session for presence indicators.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type { AwarenessUser } from './useYjsCollaboration'
import type { SessionAwareness } from '@/components/SessionList'

/** User's current session watching state */
interface SessionWatchState {
  sessionId: string | null
  lockedSessionId?: string | null
}

// Yjs/Hocuspocus server URL from env or default
const YJS_SERVER_URL = import.meta.env.VITE_YJS_URL || 'ws://localhost:4001'

/** Hook options */
interface UseSessionAwarenessOptions {
  /** Hocuspocus server URL */
  serverUrl?: string
  /** Current user info */
  user: {
    id: string
    name: string
    avatar?: string
    color?: string
  }
  /** Called when connection status changes */
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'synced') => void
}

/** Default user colors */
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
]

/** Get consistent color for user ID */
function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

/**
 * Hook for tracking session-level awareness across all sessions
 */
export function useSessionAwareness(options: UseSessionAwarenessOptions) {
  const {
    serverUrl = YJS_SERVER_URL,
    user,
    onStatusChange,
  } = options

  const [doc] = useState(() => new Y.Doc())
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'synced'>('disconnected')
  const [sessionAwareness, setSessionAwareness] = useState<Map<string, SessionAwareness>>(new Map())
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)

  /** Set which session the current user is watching */
  const setCurrentSessionId = useCallback((sessionId: string | null) => {
    const provider = providerRef.current
    if (!provider) return

    setCurrentSessionIdState(sessionId)
    provider.setAwarenessField('watching', {
      sessionId,
      lockedSessionId: null,
    } as SessionWatchState)
    provider.setAwarenessField('lastActive', Date.now())
  }, [])

  /** Mark a session as locked by current user */
  const lockSession = useCallback((sessionId: string) => {
    const provider = providerRef.current
    if (!provider) return

    provider.setAwarenessField('watching', {
      sessionId: currentSessionId,
      lockedSessionId: sessionId,
    } as SessionWatchState)
    provider.setAwarenessField('lastActive', Date.now())
  }, [currentSessionId])

  /** Release lock on a session */
  const unlockSession = useCallback(() => {
    const provider = providerRef.current
    if (!provider) return

    provider.setAwarenessField('watching', {
      sessionId: currentSessionId,
      lockedSessionId: null,
    } as SessionWatchState)
    provider.setAwarenessField('lastActive', Date.now())
  }, [currentSessionId])

  // Connect to Hocuspocus for session awareness
  useEffect(() => {
    const userColor = user.color || getUserColor(user.id)

    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: 'session-awareness', // Global room for session tracking
      document: doc,
      token: '', // Auth via cookie

      onConnect: () => {
        setStatus('connected')
        onStatusChange?.('connected')
      },

      onSynced: () => {
        setStatus('synced')
        onStatusChange?.('synced')
      },

      onDisconnect: () => {
        setStatus('disconnected')
        onStatusChange?.('disconnected')
      },

      onClose: () => {
        setStatus('disconnected')
        onStatusChange?.('disconnected')
      },

      onAwarenessChange: () => {
        const awareness = provider.awareness
        if (!awareness) return

        // Group users by session they're watching
        const sessionMap = new Map<string, SessionAwareness>()

        awareness.getStates().forEach((state, clientId) => {
          // Skip self
          if (clientId === awareness.clientID) return

          const watchState = state.watching as SessionWatchState | undefined
          if (!state.id || !watchState?.sessionId) return

          const sessionId = watchState.sessionId
          const awarenessUser: AwarenessUser = {
            id: state.id as string,
            name: state.name as string || 'Anonymous',
            avatar: state.avatar as string | undefined,
            color: state.color as string || getUserColor(state.id as string),
            cursor: state.cursor as { x: number; y: number } | undefined,
            selection: state.selection as string[] | undefined,
            lastActive: state.lastActive as number || Date.now(),
          }

          // Get or create session awareness entry
          let sessionEntry = sessionMap.get(sessionId)
          if (!sessionEntry) {
            sessionEntry = {
              sessionId,
              users: [],
              lockedBy: null,
              lockedByName: null,
            }
            sessionMap.set(sessionId, sessionEntry)
          }

          // Add user to session
          sessionEntry.users.push(awarenessUser)

          // Check if this user has locked the session
          if (watchState.lockedSessionId === sessionId) {
            sessionEntry.lockedBy = awarenessUser.id
            sessionEntry.lockedByName = awarenessUser.name
          }
        })

        setSessionAwareness(sessionMap)
      },
    })

    // Set initial awareness state
    provider.setAwarenessField('id', user.id)
    provider.setAwarenessField('name', user.name)
    provider.setAwarenessField('avatar', user.avatar)
    provider.setAwarenessField('color', userColor)
    provider.setAwarenessField('lastActive', Date.now())
    provider.setAwarenessField('watching', {
      sessionId: null,
      lockedSessionId: null,
    } as SessionWatchState)

    providerRef.current = provider
    setStatus('connecting')
    onStatusChange?.('connecting')

    return () => {
      provider.destroy()
      providerRef.current = null
    }
  }, [serverUrl, user.id, user.name, user.avatar, user.color, doc, onStatusChange])

  return {
    /** Connection status */
    status,
    /** Session awareness data keyed by session ID */
    sessionAwareness,
    /** Currently watched session ID */
    currentSessionId,
    /** Set which session the user is watching */
    setCurrentSessionId,
    /** Lock a session */
    lockSession,
    /** Release lock on current session */
    unlockSession,
    /** Check if connected */
    isConnected: status === 'connected' || status === 'synced',
    /** Check if synced */
    isSynced: status === 'synced',
  }
}

export default useSessionAwareness
