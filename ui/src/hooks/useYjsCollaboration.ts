/**
 * Yjs Collaboration Hook
 *
 * Manages connection to Hocuspocus server for real-time collaboration.
 * Provides document, awareness, and connection state.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

/** User awareness state */
export interface AwarenessUser {
  id: string
  name: string
  avatar?: string
  color: string
  cursor?: { x: number; y: number }
  selection?: string[]
  lastActive: number
}

/** Connection state */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'synced'

/** Hook options */
export interface UseYjsCollaborationOptions {
  /** Document/room name */
  documentName: string
  /** Hocuspocus server URL (default: ws://localhost:3001) */
  serverUrl?: string
  /** Current user info */
  user: {
    id: string
    name: string
    avatar?: string
    color?: string
  }
  /** Called when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void
  /** Called when awareness (other users) changes */
  onAwarenessChange?: (users: AwarenessUser[]) => void
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
 * Hook for Yjs collaboration with Hocuspocus
 */
export function useYjsCollaboration(options: UseYjsCollaborationOptions) {
  const {
    documentName,
    serverUrl = 'ws://localhost:3001',
    user,
    onStatusChange,
    onAwarenessChange,
  } = options

  const [doc] = useState(() => new Y.Doc())
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [otherUsers, setOtherUsers] = useState<AwarenessUser[]>([])
  const providerRef = useRef<HocuspocusProvider | null>(null)

  // Update cursor position in awareness
  const updateCursor = useCallback((x: number, y: number) => {
    const provider = providerRef.current
    if (!provider) return

    provider.setAwarenessField('cursor', { x, y })
    provider.setAwarenessField('lastActive', Date.now())
  }, [])

  // Update selection in awareness
  const updateSelection = useCallback((selection: string[]) => {
    const provider = providerRef.current
    if (!provider) return

    provider.setAwarenessField('selection', selection)
    provider.setAwarenessField('lastActive', Date.now())
  }, [])

  // Clear cursor (e.g., when mouse leaves canvas)
  const clearCursor = useCallback(() => {
    const provider = providerRef.current
    if (!provider) return

    provider.setAwarenessField('cursor', null)
  }, [])

  // Connect to Hocuspocus
  useEffect(() => {
    const userColor = user.color || getUserColor(user.id)

    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: documentName,
      document: doc,
      // Pass session token for auth (will be read from cookie on server)
      token: '', // Empty - auth via cookie

      onConnect: () => {
        console.log('[Yjs] Connected to', documentName)
        setStatus('connected')
        onStatusChange?.('connected')
      },

      onSynced: () => {
        console.log('[Yjs] Synced', documentName)
        setStatus('synced')
        onStatusChange?.('synced')
      },

      onDisconnect: () => {
        console.log('[Yjs] Disconnected from', documentName)
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

        const users: AwarenessUser[] = []
        awareness.getStates().forEach((state, clientId) => {
          // Skip self
          if (clientId === awareness.clientID) return

          if (state.id) {
            users.push({
              id: state.id as string,
              name: state.name as string || 'Anonymous',
              avatar: state.avatar as string | undefined,
              color: state.color as string || getUserColor(state.id as string),
              cursor: state.cursor as { x: number; y: number } | undefined,
              selection: state.selection as string[] | undefined,
              lastActive: state.lastActive as number || Date.now(),
            })
          }
        })

        setOtherUsers(users)
        onAwarenessChange?.(users)
      },
    })

    // Set initial awareness state
    provider.setAwarenessField('id', user.id)
    provider.setAwarenessField('name', user.name)
    provider.setAwarenessField('avatar', user.avatar)
    provider.setAwarenessField('color', userColor)
    provider.setAwarenessField('lastActive', Date.now())

    providerRef.current = provider
    setStatus('connecting')
    onStatusChange?.('connecting')

    return () => {
      provider.destroy()
      providerRef.current = null
    }
  }, [documentName, serverUrl, user.id, user.name, user.avatar, user.color, doc, onStatusChange, onAwarenessChange])

  return {
    /** Yjs document */
    doc,
    /** Connection status */
    status,
    /** Other connected users */
    otherUsers,
    /** Update cursor position */
    updateCursor,
    /** Update selection */
    updateSelection,
    /** Clear cursor */
    clearCursor,
    /** Get a Yjs Map from the document */
    getMap: <T>(name: string) => doc.getMap<T>(name),
    /** Get a Yjs Array from the document */
    getArray: <T>(name: string) => doc.getArray<T>(name),
    /** Check if connected */
    isConnected: status === 'connected' || status === 'synced',
    /** Check if synced */
    isSynced: status === 'synced',
  }
}

export default useYjsCollaboration
