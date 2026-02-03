import { clsx } from 'clsx'
import type { Session, PresenceStatus } from '@/types'
import { useSessionStore } from '@/stores/session'

interface SessionListProps {
  sessions: Session[]
}

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={clsx('presence-dot', {
        online: status === 'online',
        idle: status === 'idle',
        offline: status === 'offline',
      })}
    />
  )
}

function SessionCard({ session, isActive, onClick }: {
  session: Session
  isActive: boolean
  onClick: () => void
}) {
  const onlineCount = session.participants.filter((p) => p.isOnline).length

  return (
    <button
      className={clsx('session-card w-full text-left', { active: isActive })}
      onClick={onClick}
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

        {/* Participant count */}
        <div className="flex items-center gap-1.5">
          <PresenceDot status={onlineCount > 0 ? 'online' : 'offline'} />
          <span className="text-xs text-gray-500">{onlineCount}</span>
        </div>
      </div>
    </button>
  )
}

export function SessionList({ sessions }: SessionListProps) {
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
        />
      ))}
    </div>
  )
}
