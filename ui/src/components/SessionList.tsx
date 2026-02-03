import { clsx } from 'clsx'
import type { Session } from '@/types'
import type { AwarenessUser } from '@/hooks/useYjsCollaboration'
import { useSessionStore } from '@/stores/session'
import { PresenceAvatarStack } from './PresenceAvatarStack'

/** Session awareness state tracking who's watching each session */
export interface SessionAwareness {
  sessionId: string
  users: AwarenessUser[]
  lockedBy?: string | null
  lockedByName?: string | null
}

interface SessionListProps {
  sessions: Session[]
  /** Real-time awareness data per session */
  sessionAwareness?: Map<string, SessionAwareness>
}

function SessionCard({
  session,
  isActive,
  onClick,
  awareness,
}: {
  session: Session
  isActive: boolean
  onClick: () => void
  awareness?: SessionAwareness
}) {

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>) => {
    // Set drag data with session info
    e.dataTransfer.setData('application/json', JSON.stringify({
      sessionId: session.id,
      sessionName: session.name,
      tmuxSession: session.tmuxSession,
    }))
    e.dataTransfer.effectAllowed = 'copy'

    // Create custom drag image
    const dragImage = document.createElement('div')
    dragImage.className = 'fixed pointer-events-none px-3 py-2 bg-terminal-surface border border-accent-primary rounded-lg text-sm text-gray-100 shadow-lg'
    dragImage.textContent = session.name
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)

    // Clean up drag image after drag starts
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }

  return (
    <button
      className={clsx('session-card w-full text-left cursor-grab active:cursor-grabbing', { active: isActive })}
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Session icon */}
        <div className="w-8 h-8 rounded-lg bg-terminal-surface flex items-center justify-center text-gray-400">
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
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        {/* Session info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-100 truncate">
            {session.name}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {session.tmuxSession}
          </div>
        </div>

        {/* Presence avatars */}
        <PresenceAvatarStack
          participants={session.participants}
          awarenessUsers={awareness?.users}
          lockedBy={awareness?.lockedBy}
          lockedByName={awareness?.lockedByName}
          maxVisible={4}
          size="sm"
        />
      </div>
    </button>
  )
}

export function SessionList({ sessions, sessionAwareness }: SessionListProps) {
  const { activeSessionId, setActiveSession } = useSessionStore()

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <p>No active sessions</p>
        <p className="mt-1 text-xs">Create or join a session to get started</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onClick={() => setActiveSession(session.id)}
          awareness={sessionAwareness?.get(session.id)}
        />
      ))}
    </div>
  )
}
