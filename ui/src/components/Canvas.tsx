/**
 * Canvas Component - tldraw Integration
 *
 * Infinite canvas with terminal shapes, real-time collaboration,
 * and live cursor sharing.
 */

import { Tldraw, track, useEditor, TLComponents, createShapeId, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useMemo, useEffect, useCallback, createContext, useContext, useState, useRef } from 'react'
import { TerminalShapeUtil, TERMINAL_WIDTH, TERMINAL_HEIGHT, type TerminalShape } from '../shapes'
import { useAuthStore } from '../stores/auth'
import { useLocksStore } from '../stores/locks'
import { useYjsCollaboration } from '../hooks/useYjsCollaboration'
import { LiveCursors, ConnectionStatus } from './Presence'

// Drag data type
interface SessionDragData {
  sessionId: string
  sessionName: string
  tmuxSession: string
}

// ============================================================================
// Terminal Context (provides auth + WebSocket to shapes)
// ============================================================================

interface TerminalContextValue {
  currentUserId: string | null
  claimedSessionId: string | null
  claimSession: (sessionId: string) => void
  releaseSession: (sessionId: string) => void
}

const TerminalContext = createContext<TerminalContextValue>({
  currentUserId: null,
  claimedSessionId: null,
  claimSession: () => {},
  releaseSession: () => {},
})

export const useTerminalContext = () => useContext(TerminalContext)

// ============================================================================
// Custom Shape Utils
// ============================================================================

// We need to create an enhanced version that uses the context
// Since tldraw shape utils don't have access to React context,
// we use a global reference that's set by the Canvas component
let terminalContextRef: TerminalContextValue = {
  currentUserId: null,
  claimedSessionId: null,
  claimSession: () => {},
  releaseSession: () => {},
}

class ConnectedTerminalShapeUtil extends TerminalShapeUtil {
  getCurrentUserId(): string | null {
    return terminalContextRef.currentUserId
  }

  claimSession(_shapeId: string, sessionId: string) {
    terminalContextRef.claimSession(sessionId)
  }

  releaseSession(_shapeId: string, sessionId: string) {
    terminalContextRef.releaseSession(sessionId)
  }
}

// Custom shape utils array
const customShapeUtils = [ConnectedTerminalShapeUtil]

// ============================================================================
// Canvas Overlay Components
// ============================================================================

/**
 * Minimap showing overview of canvas
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
        title="Reset zoom to 100%"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </button>
    </div>
  )
})

function CanvasOverlay() {
  return (
    <>
      <ZoomControls />
      <Minimap />
    </>
  )
}

// Custom tldraw components
const components: TLComponents = {
  InFrontOfTheCanvas: CanvasOverlay,
}

// ============================================================================
// Canvas Component
// ============================================================================

export interface CanvasProps {
  className?: string
}

/**
 * Main Canvas component with tldraw and terminal shapes.
 */
export function Canvas({ className }: CanvasProps) {
  const { getUIUser } = useAuthStore()
  const user = getUIUser()
  const editorRef = useRef<Editor | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Track the session currently claimed by this user
  const [claimedSessionId, setClaimedSessionId] = useState<string | null>(null)

  // Yjs collaboration for presence/cursors
  const {
    otherUsers,
    updateCursor,
    clearCursor,
    status: yjsStatus,
  } = useYjsCollaboration({
    documentName: 'canvas-presence',
    user: user ? {
      id: user.id,
      name: user.name,
      avatar: user.avatarUrl,
    } : {
      id: 'anonymous',
      name: 'Anonymous',
    },
  })

  // Track mouse movement for cursor sharing
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    updateCursor(e.clientX - rect.left, e.clientY - rect.top)
  }, [updateCursor])

  // Clear cursor when mouse leaves
  const handleMouseLeave = useCallback(() => {
    clearCursor()
  }, [clearCursor])

  // WebSocket reference for claim/release
  const wsRef = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    return { current: ws }
  }, [])

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set false if we're leaving the container (not entering a child)
    if (e.currentTarget === e.target) {
      setIsDragOver(false)
    }
  }, [])

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const editor = editorRef.current
    if (!editor) return

    // Get drag data
    const dataStr = e.dataTransfer.getData('application/json')
    if (!dataStr) return

    let dragData: SessionDragData
    try {
      dragData = JSON.parse(dataStr)
    } catch {
      return
    }

    // Convert screen coordinates to canvas coordinates
    const rect = e.currentTarget.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Use tldraw's coordinate conversion
    const point = editor.screenToPage({ x: screenX, y: screenY })

    // Center the terminal at drop position
    const x = point.x - TERMINAL_WIDTH / 2
    const y = point.y - TERMINAL_HEIGHT / 2

    // Create terminal shape
    addTerminalToCanvas(editor, dragData.tmuxSession, x, y)

    console.log('[Canvas] Created terminal for session:', dragData.sessionName)
  }, [])

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current.close()
    }
  }, [wsRef])

  // Claim session handler
  const claimSession = useCallback((sessionId: string) => {
    if (wsRef.current.readyState === WebSocket.OPEN) {
      // Release any previously claimed session first
      const prevClaimed = claimedSessionId
      if (prevClaimed && prevClaimed !== sessionId) {
        wsRef.current.send(JSON.stringify({ type: 'release', sessionId: prevClaimed }))
      }
      wsRef.current.send(JSON.stringify({ type: 'claim', sessionId }))
      setClaimedSessionId(sessionId)
    }
  }, [wsRef, claimedSessionId])

  // Release session handler
  const releaseSession = useCallback((sessionId: string) => {
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'release', sessionId }))
      if (claimedSessionId === sessionId) {
        setClaimedSessionId(null)
      }
    }
  }, [wsRef, claimedSessionId])

  // Release current claim (for click-away)
  const releaseCurrentClaim = useCallback(() => {
    if (claimedSessionId && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'release', sessionId: claimedSessionId }))
      setClaimedSessionId(null)
    }
  }, [wsRef, claimedSessionId])

  // Update global context reference
  useEffect(() => {
    terminalContextRef = {
      currentUserId: user?.id ?? null,
      claimedSessionId,
      claimSession,
      releaseSession,
    }
  }, [user?.id, claimedSessionId, claimSession, releaseSession])

  // Context value (for components that can use context)
  const contextValue = useMemo<TerminalContextValue>(() => ({
    currentUserId: user?.id ?? null,
    claimedSessionId,
    claimSession,
    releaseSession,
  }), [user?.id, claimedSessionId, claimSession, releaseSession])

  return (
    <TerminalContext.Provider value={contextValue}>
      <div
        ref={canvasRef}
        className={`w-full h-full relative ${className || ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Live cursors from other users */}
        <LiveCursors users={otherUsers} />

        {/* Connection status indicator */}
        <div className="absolute top-4 right-4 z-40 pointer-events-auto">
          <ConnectionStatus status={yjsStatus} />
        </div>

        {/* Drop zone indicator */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 pointer-events-none border-4 border-dashed border-accent-primary/60 bg-accent-primary/5 flex items-center justify-center">
            <div className="px-6 py-3 rounded-xl bg-terminal-surface/90 border border-accent-primary/40 shadow-lg">
              <span className="text-lg text-accent-primary font-medium">Drop to create terminal</span>
            </div>
          </div>
        )}
        <Tldraw
          shapeUtils={customShapeUtils}
          persistenceKey="chrote-canvas"
          hideUi={false}
          components={components}
          onMount={(editor) => {
            // Store editor reference for drop handling
            editorRef.current = editor

            // Set dark theme
            editor.user.updateUserPreferences({
              colorScheme: 'dark',
            })

            // Listen for selection changes to detect click-away and auto-claim
            editor.store.listen(
              (entry) => {
                // Check if this is a selection-related change
                if (entry.source !== 'user') return

                const selectedIds = editor.getSelectedShapeIds()

                // If nothing selected, release current claim
                if (selectedIds.length === 0) {
                  releaseCurrentClaim()
                  return
                }

                // Check selected shapes
                const shapes = selectedIds.map((id) => editor.getShape(id)).filter(Boolean)
                const terminals = shapes.filter((s) => s?.type === 'terminal') as TerminalShape[]

                if (terminals.length === 0) {
                  // Selected something that's not a terminal - release claim
                  releaseCurrentClaim()
                  return
                }

                // Auto-claim the selected terminal if it's not locked
                const selectedTerminal = terminals[0]
                if (selectedTerminal && !selectedTerminal.props.lockedBy) {
                  // Claim this terminal
                  claimSession(selectedTerminal.props.sessionId)
                } else if (
                  selectedTerminal &&
                  selectedTerminal.props.lockedBy !== user?.id &&
                  claimedSessionId
                ) {
                  // Selected a terminal locked by someone else - release our claim
                  releaseCurrentClaim()
                }
              },
              { scope: 'document', source: 'user' }
            )

            // Listen for lock state changes from WebSocket
            const ws = wsRef.current

            ws.onmessage = (event) => {
              try {
                const msg = JSON.parse(event.data)

                if (msg.type === 'claimed' || msg.type === 'released') {
                  // Update locks store so sidebar ClaimControls stay in sync
                  const { setLock } = useLocksStore.getState()
                  if (msg.type === 'claimed') {
                    setLock(msg.sessionId, {
                      sessionId: msg.sessionId,
                      lockedBy: { id: msg.by.id, name: msg.by.name },
                    })
                    // Sync local claimed state if this user claimed it
                    if (msg.by.id === user?.id) {
                      setClaimedSessionId(msg.sessionId)
                    }
                  } else {
                    setLock(msg.sessionId, null)
                    // Clear local claimed state if our claim was released
                    if (msg.sessionId === claimedSessionId) {
                      setClaimedSessionId(null)
                    }
                  }

                  // Find terminal shapes with this sessionId and update lock state
                  const shapes = editor.getCurrentPageShapes()
                  for (const shape of shapes) {
                    if (shape.type === 'terminal') {
                      const terminalShape = shape as TerminalShape
                      if (terminalShape.props.sessionId === msg.sessionId) {
                        editor.updateShape({
                          id: shape.id,
                          type: 'terminal',
                          props: {
                            lockedBy: msg.type === 'claimed' ? msg.by.id : null,
                            lockedByName: msg.type === 'claimed' ? msg.by.name : null,
                          },
                        })
                      }
                    }
                  }
                }
              } catch (e) {
                console.error('WS message parse error:', e)
              }
            }

            console.log('[Canvas] tldraw editor mounted with terminal shapes')
          }}
        />
      </div>
    </TerminalContext.Provider>
  )
}

// ============================================================================
// Helper to create terminal shape
// ============================================================================

/**
 * Creates a terminal shape at the given position.
 * Use this when dragging from sidebar or via toolbar.
 */
export function addTerminalToCanvas(
  editor: Editor,
  sessionId: string,
  x: number = 0,
  y: number = 0
) {
  const id = createShapeId()

  editor.createShape<TerminalShape>({
    id,
    type: 'terminal',
    x,
    y,
    props: {
      sessionId,
      lockedBy: null,
      lockedByName: null,
      w: TERMINAL_WIDTH,
      h: TERMINAL_HEIGHT,
    },
  })

  return id
}
