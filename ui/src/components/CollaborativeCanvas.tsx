/**
 * Collaborative Canvas Component
 *
 * tldraw canvas with Yjs real-time collaboration via Hocuspocus.
 * Syncs shapes, presence, and cursors across all connected clients.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Tldraw,
  track,
  useEditor,
  TLStoreWithStatus,
  createTLStore,
  defaultShapeUtils,
  TLRecord,
} from 'tldraw'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import 'tldraw/tldraw.css'
import { LiveCursors, ConnectionStatus as ConnectionStatusBadge } from './Presence'
import type { AwarenessUser } from '@/hooks/useYjsCollaboration'

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
 * Minimap component
 */
const Minimap = track(() => {
  const editor = useEditor()
  const camera = editor.getCamera()

  return (
    <div className="absolute bottom-4 right-4 w-48 h-32 bg-terminal-surface/80 border border-terminal-border rounded-lg overflow-hidden pointer-events-auto">
      <div className="p-2 text-xs text-gray-400 border-b border-terminal-border">
        Minimap
      </div>
      <div className="relative w-full h-20 bg-terminal-bg/50">
        <div
          className="absolute border-2 border-accent-primary/50 bg-accent-primary/10 rounded"
          style={{
            width: '30%',
            height: '40%',
            left: `${35 + camera.x / 100}%`,
            top: `${30 + camera.y / 100}%`,
          }}
        />
      </div>
    </div>
  )
})

/**
 * Zoom controls
 */
const ZoomControls = track(() => {
  const editor = useEditor()
  const zoom = editor.getZoomLevel()

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-terminal-surface/80 border border-terminal-border rounded-lg px-2 py-1 pointer-events-auto">
      <button
        onClick={() => editor.zoomOut()}
        className="p-1 text-gray-400 hover:text-gray-100 transition-colors"
        title="Zoom out"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <span className="text-xs text-gray-300 min-w-[3rem] text-center">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => editor.zoomIn()}
        className="p-1 text-gray-400 hover:text-gray-100 transition-colors"
        title="Zoom in"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <div className="w-px h-4 bg-terminal-border" />
      <button
        onClick={() => editor.zoomToFit()}
        className="p-1 text-gray-400 hover:text-gray-100 transition-colors"
        title="Fit to content"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
      <button
        onClick={() => editor.resetZoom()}
        className="p-1 text-gray-400 hover:text-gray-100 transition-colors"
        title="Reset zoom"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </button>
    </div>
  )
})

export interface CollaborativeCanvasProps {
  /** Document/room name for collaboration */
  roomId: string
  /** Hocuspocus server URL */
  serverUrl?: string
  /** Current user info */
  user: {
    id: string
    name: string
    avatar?: string
  }
  className?: string
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'synced'

/**
 * Collaborative tldraw canvas with Yjs sync
 */
export function CollaborativeCanvas({
  roomId,
  serverUrl = 'ws://localhost:3001',
  user,
  className,
}: CollaborativeCanvasProps) {
  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: 'loading',
  })
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [otherUsers, setOtherUsers] = useState<AwarenessUser[]>([])

  // Create Yjs document and Hocuspocus provider
  useEffect(() => {
    const doc = new Y.Doc()
    const userColor = getUserColor(user.id)

    // Create the store
    const store = createTLStore({
      shapeUtils: defaultShapeUtils,
    })

    // Create Hocuspocus provider
    const provider = new HocuspocusProvider({
      url: serverUrl,
      name: roomId,
      document: doc,

      onConnect: () => {
        console.log('[Canvas] Connected to', roomId)
        setConnectionStatus('connected')
      },

      onSynced: () => {
        console.log('[Canvas] Synced with', roomId)
        setConnectionStatus('synced')
        setStoreWithStatus({
          status: 'synced-remote',
          connectionStatus: 'online',
          store,
        })
      },

      onDisconnect: () => {
        console.log('[Canvas] Disconnected from', roomId)
        setConnectionStatus('disconnected')
        setStoreWithStatus({
          status: 'synced-remote',
          connectionStatus: 'offline',
          store,
        })
      },

      onAwarenessChange: () => {
        const awareness = provider.awareness
        if (!awareness) return

        const users: AwarenessUser[] = []
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return
          if (state.id) {
            users.push({
              id: state.id as string,
              name: (state.name as string) || 'Anonymous',
              avatar: state.avatar as string | undefined,
              color: (state.color as string) || getUserColor(state.id as string),
              cursor: state.cursor as { x: number; y: number } | undefined,
              selection: state.selection as string[] | undefined,
              lastActive: (state.lastActive as number) || Date.now(),
            })
          }
        })
        setOtherUsers(users)
      },
    })

    // Set initial awareness
    provider.setAwarenessField('id', user.id)
    provider.setAwarenessField('name', user.name)
    provider.setAwarenessField('avatar', user.avatar)
    provider.setAwarenessField('color', userColor)
    provider.setAwarenessField('lastActive', Date.now())

    setConnectionStatus('connecting')

    // Sync Yjs document with tldraw store
    const yRecords = doc.getMap<TLRecord>('tldraw')

    // Apply Yjs changes to store
    const handleYjsChange = () => {
      const records: TLRecord[] = []
      yRecords.forEach((value) => {
        records.push(value)
      })

      // Merge with store
      store.mergeRemoteChanges(() => {
        const existing = store.allRecords()
        const existingIds = new Set(existing.map((r) => r.id))
        const yjsIds = new Set(records.map((r) => r.id))

        // Add/update records from Yjs
        const toAdd: TLRecord[] = []
        const toUpdate: TLRecord[] = []
        for (const record of records) {
          if (existingIds.has(record.id)) {
            toUpdate.push(record)
          } else {
            toAdd.push(record)
          }
        }

        // Remove records not in Yjs
        const toRemove: TLRecord[] = existing.filter((r) => !yjsIds.has(r.id))

        if (toAdd.length) store.put(toAdd)
        if (toUpdate.length) store.put(toUpdate)
        if (toRemove.length) store.remove(toRemove.map((r) => r.id))
      })
    }

    yRecords.observe(handleYjsChange)

    // Apply store changes to Yjs
    const unsubscribe = store.listen(
      ({ changes }) => {
        doc.transact(() => {
          for (const record of Object.values(changes.added)) {
            yRecords.set(record.id, record)
          }
          for (const [, to] of Object.values(changes.updated)) {
            yRecords.set(to.id, to)
          }
          for (const record of Object.values(changes.removed)) {
            yRecords.delete(record.id)
          }
        })
      },
      { source: 'user', scope: 'document' }
    )

    // Initial sync
    handleYjsChange()

    setStoreWithStatus({
      status: 'synced-remote',
      connectionStatus: 'online',
      store,
    })

    return () => {
      unsubscribe()
      provider.destroy()
      doc.destroy()
    }
  }, [roomId, serverUrl, user.id, user.name, user.avatar])

  // Canvas overlay with controls
  const CanvasOverlay = useMemo(
    () =>
      function Overlay() {
        return (
          <>
            <ZoomControls />
            <Minimap />
            <div className="absolute top-4 right-4 pointer-events-auto">
              <ConnectionStatusBadge status={connectionStatus} />
            </div>
          </>
        )
      },
    [connectionStatus]
  )

  if (storeWithStatus.status === 'loading') {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className || ''}`}>
        <div className="text-gray-400">Loading canvas...</div>
      </div>
    )
  }

  return (
    <div className={`w-full h-full relative ${className || ''}`}>
      <Tldraw
        store={storeWithStatus}
        hideUi={false}
        components={{
          InFrontOfTheCanvas: CanvasOverlay,
        }}
        onMount={(editor) => {
          editor.user.updateUserPreferences({
            colorScheme: 'dark',
          })
          console.log('[Canvas] Collaborative editor mounted')
        }}
      />
      <LiveCursors users={otherUsers} />
    </div>
  )
}

export default CollaborativeCanvas
