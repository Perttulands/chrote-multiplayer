import { useRef, useEffect, useCallback } from 'react'
import { Terminal, useTerminalRef } from './Terminal'
import type { Session, Participant } from '@/types'

interface TerminalViewProps {
  session: Session | null
}

function ParticipantList({ participants }: { participants: Participant[] }) {
  return (
    <div className="flex items-center gap-2">
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {participants.slice(0, 4).map((p, i) => {
          const initials = p.user.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)

          return (
            <div
              key={p.userId}
              className="relative"
              style={{ zIndex: participants.length - i }}
              title={`${p.user.name} (${p.role})`}
            >
              {p.user.avatarUrl ? (
                <img
                  src={p.user.avatarUrl}
                  alt={p.user.name}
                  className="w-7 h-7 rounded-full object-cover ring-2 ring-terminal-bg"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-terminal-surface flex items-center justify-center text-xs font-medium text-gray-400 uppercase ring-2 ring-terminal-bg">
                  {initials}
                </div>
              )}
              {/* Online indicator */}
              {p.isOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-accent-success rounded-full ring-2 ring-terminal-bg" />
              )}
            </div>
          )
        })}
      </div>

      {/* Overflow count */}
      {participants.length > 4 && (
        <span className="text-xs text-gray-500">
          +{participants.length - 4} more
        </span>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-terminal-surface flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-100 mb-2">
        No session selected
      </h3>
      <p className="text-sm text-gray-500 max-w-sm">
        Select a session from the sidebar to view its terminal, or create a new
        session to get started.
      </p>
    </div>
  )
}

export function TerminalView({ session }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminal = useTerminalRef(containerRef)

  // Handle terminal output (would come from WebSocket)
  const handleTerminalData = useCallback((data: string) => {
    // Send to WebSocket
    console.log('Terminal input:', data)
  }, [])

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      console.log(`Terminal resized: ${cols}x${rows}`)
    },
    []
  )

  // Demo: Write some content on session change
  useEffect(() => {
    if (session) {
      terminal.write(`\x1b[2J\x1b[H`) // Clear screen
      terminal.write(
        `\x1b[1;36m` + // Cyan bold
          `╔════════════════════════════════════════════════════════════╗\r\n` +
          `║                    CHROTE Multiplayer                      ║\r\n` +
          `╚════════════════════════════════════════════════════════════╝\r\n` +
          `\x1b[0m\r\n` +
          `\x1b[33mSession:\x1b[0m ${session.name}\r\n` +
          `\x1b[33mTmux:\x1b[0m    ${session.tmuxSession}\r\n` +
          `\x1b[33mStatus:\x1b[0m  ${session.status}\r\n\r\n` +
          `\x1b[32m$\x1b[0m `
      )
      terminal.focus()
    }
  }, [session, terminal])

  if (!session) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Terminal header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-terminal-border bg-terminal-surface/30">
        <div className="flex items-center gap-3">
          {/* Session name */}
          <h2 className="text-sm font-medium text-gray-100">{session.name}</h2>

          {/* Status badge */}
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              session.status === 'active'
                ? 'bg-accent-success/20 text-accent-success'
                : session.status === 'paused'
                ? 'bg-accent-warning/20 text-accent-warning'
                : 'bg-gray-500/20 text-gray-500'
            }`}
          >
            {session.status}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Participants */}
          <ParticipantList participants={session.participants} />

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
              title="Copy session link"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
            </button>
            <button
              className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
              title="Full screen"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 p-2 bg-terminal-bg">
        <Terminal
          sessionId={session.id}
          onData={handleTerminalData}
          onResize={handleTerminalResize}
        />
      </div>
    </div>
  )
}
