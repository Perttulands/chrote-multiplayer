/**
 * Terminal Shape for tldraw Canvas
 *
 * Custom shape that renders an xterm.js terminal with:
 * - Fixed 80x24 character size
 * - WebSocket streaming from tmux session
 * - Lock state visualization (border color, badge)
 * - Keyboard input when locked by current user
 *
 * CMP-003: Terminal Shape Implementation
 */

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  TLBaseShape,
} from 'tldraw'
import { useEffect, useRef, useCallback, memo, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// ============================================================================
// Types
// ============================================================================

export type TerminalShape = TLBaseShape<
  'terminal',
  {
    sessionId: string
    lockedBy: string | null
    lockedByName: string | null
    w: number
    h: number
  }
>

// Terminal dimensions (80 cols x 24 rows at 14px font)
const TERMINAL_COLS = 80
const TERMINAL_ROWS = 24
const CHAR_WIDTH = 8.4 // Approximate for JetBrains Mono at 14px
const CHAR_HEIGHT = 14 * 1.2 // fontSize * lineHeight
const PADDING = 12

export const TERMINAL_WIDTH = Math.ceil(TERMINAL_COLS * CHAR_WIDTH) + PADDING * 2
export const TERMINAL_HEIGHT = Math.ceil(TERMINAL_ROWS * CHAR_HEIGHT) + PADDING * 2 + 32 // +32 for header

// ============================================================================
// Terminal Theme
// ============================================================================

const TERMINAL_THEME = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
  cursorAccent: '#0a0a0a',
  selectionBackground: 'rgba(99, 102, 241, 0.3)',
  black: '#1a1a1a',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#8b5cf6',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#525252',
  brightRed: '#f87171',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#a78bfa',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
}

// ============================================================================
// Terminal Component (renders inside shape)
// ============================================================================

interface TerminalContentProps {
  sessionId: string
  lockedBy: string | null
  lockedByName: string | null
  currentUserId: string | null
  onClaim: () => void
  onRelease: () => void
}

const TerminalContent = memo(function TerminalContent({
  sessionId,
  lockedBy: initialLockedBy,
  lockedByName: initialLockedByName,
  currentUserId,
  onClaim,
  onRelease,
}: TerminalContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Track lock state locally (updated from WebSocket)
  const [lockedBy, setLockedBy] = useState<string | null>(initialLockedBy)
  const [lockedByName, setLockedByName] = useState<string | null>(initialLockedByName)

  // Sync with prop changes from parent
  useEffect(() => {
    setLockedBy(initialLockedBy)
    setLockedByName(initialLockedByName)
  }, [initialLockedBy, initialLockedByName])

  const isLockedByMe = lockedBy === currentUserId
  const isLocked = lockedBy !== null
  const canEdit = isLockedByMe

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      theme: TERMINAL_THEME,
      fontFamily: '"JetBrains Mono", "Menlo", "Monaco", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cols: TERMINAL_COLS,
      rows: TERMINAL_ROWS,
      cursorBlink: canEdit,
      cursorStyle: 'block',
      scrollback: 1000,
      allowProposedApi: true,
      disableStdin: !canEdit,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return () => {
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  // Update stdin disabled state when lock changes
  useEffect(() => {
    if (terminalRef.current) {
      // xterm doesn't have a direct setter, but we can control via options
      terminalRef.current.options.disableStdin = !canEdit
      terminalRef.current.options.cursorBlink = canEdit
    }
  }, [canEdit])

  // Connect WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      // Subscribe to terminal output
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.sessionId === sessionId) {
          switch (msg.type) {
            case 'output':
              terminalRef.current?.write(msg.data)
              break
            case 'claimed':
              setLockedBy(msg.by.id)
              setLockedByName(msg.by.name)
              break
            case 'released':
              setLockedBy(null)
              setLockedByName(null)
              break
          }
        }
      } catch (e) {
        console.error('WS message parse error:', e)
      }
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', sessionId }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [sessionId])

  // Handle keyboard input
  useEffect(() => {
    if (!terminalRef.current || !canEdit) return

    const disposable = terminalRef.current.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'sendKeys',
          sessionId,
          keys: data,
        }))
      }
    })

    return () => disposable.dispose()
  }, [sessionId, canEdit])

  // Handle click to claim
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isLocked) {
      onClaim()
    } else if (isLockedByMe) {
      // Focus terminal
      terminalRef.current?.focus()
    }
  }, [isLocked, isLockedByMe, onClaim])

  // Lock badge color
  const getBorderColor = () => {
    if (!isLocked) return 'border-zinc-700'
    if (isLockedByMe) return 'border-indigo-500'
    return 'border-amber-500'
  }

  return (
    <div
      className={`terminal-shape rounded-lg overflow-hidden border-2 ${getBorderColor()} bg-zinc-900`}
      style={{ width: TERMINAL_WIDTH, height: TERMINAL_HEIGHT }}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-mono">{sessionId}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLocked ? (
            <>
              <span className={`text-xs ${isLockedByMe ? 'text-indigo-400' : 'text-amber-400'}`}>
                🔒 {isLockedByMe ? 'You' : lockedByName || 'Someone'}
              </span>
              {isLockedByMe && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRelease()
                  }}
                  className="text-xs px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                >
                  Release
                </button>
              )}
            </>
          ) : (
            <span className="text-xs text-green-400">🔓 Available</span>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="terminal-content"
        style={{
          width: TERMINAL_WIDTH - 4,
          height: TERMINAL_HEIGHT - 36,
          padding: PADDING,
        }}
      />

      {/* Overlay when locked by others */}
      {isLocked && !isLockedByMe && (
        <div className="absolute inset-0 top-8 bg-black/20 pointer-events-none" />
      )}
    </div>
  )
})

// ============================================================================
// Shape Util (tldraw integration)
// ============================================================================

export class TerminalShapeUtil extends BaseBoxShapeUtil<TerminalShape> {
  static override type = 'terminal' as const

  // Default shape properties
  getDefaultProps(): TerminalShape['props'] {
    return {
      sessionId: '',
      lockedBy: null,
      lockedByName: null,
      w: TERMINAL_WIDTH,
      h: TERMINAL_HEIGHT,
    }
  }

  // Fixed size - no resize handles
  override canResize = () => false
  override isAspectRatioLocked = () => true

  // Render the terminal
  component(shape: TerminalShape) {
    // Get current user from context (you'll need to provide this)
    const currentUserId = this.getCurrentUserId()

    const handleClaim = () => {
      this.claimSession(shape.id, shape.props.sessionId)
    }

    const handleRelease = () => {
      this.releaseSession(shape.id, shape.props.sessionId)
    }

    return (
      <HTMLContainer>
        <TerminalContent
          sessionId={shape.props.sessionId}
          lockedBy={shape.props.lockedBy}
          lockedByName={shape.props.lockedByName}
          currentUserId={currentUserId}
          onClaim={handleClaim}
          onRelease={handleRelease}
        />
      </HTMLContainer>
    )
  }

  // Simple indicator for when zoomed out
  indicator(shape: TerminalShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        ry={8}
      />
    )
  }

  // Handle resize (fixed size, returns unchanged)
  override onResize = () => {
    // Keep fixed size
    return {
      props: {
        w: TERMINAL_WIDTH,
        h: TERMINAL_HEIGHT,
      },
    }
  }

  // Override to handle double-click for claiming
  override onDoubleClick = (shape: TerminalShape) => {
    if (!shape.props.lockedBy) {
      this.claimSession(shape.id, shape.props.sessionId)
    }
    return
  }

  // Helpers (to be implemented with actual WebSocket/store connection)
  protected getCurrentUserId(): string | null {
    // TODO: Get from auth store
    return null
  }

  protected claimSession(_shapeId: string, sessionId: string) {
    // TODO: Send claim message via WebSocket
    // Then update shape props via editor.updateShape
    console.log('Claiming session:', sessionId)
  }

  protected releaseSession(_shapeId: string, sessionId: string) {
    // TODO: Send release message via WebSocket
    // Then update shape props via editor.updateShape
    console.log('Releasing session:', sessionId)
  }
}
