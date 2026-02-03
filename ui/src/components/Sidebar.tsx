import { useEffect } from 'react'
import { SessionList } from './SessionList'
import { useSessionStore } from '@/stores/session'
import { useSessionAwareness } from '@/hooks/useSessionAwareness'

export function Sidebar() {
  const { sessions, user, activeSessionId } = useSessionStore()

  // Real-time session awareness for presence indicators
  const {
    sessionAwareness,
    setCurrentSessionId,
    isConnected: awarenessConnected,
  } = useSessionAwareness({
    user: user
      ? { id: user.id, name: user.name, avatar: user.avatarUrl }
      : { id: 'anonymous', name: 'Anonymous' },
  })

  // Update awareness when active session changes
  useEffect(() => {
    if (awarenessConnected) {
      setCurrentSessionId(activeSessionId)
    }
  }, [activeSessionId, awarenessConnected, setCurrentSessionId])

  return (
    <aside className="w-64 h-full flex flex-col border-r border-terminal-border bg-terminal-surface/30 relative z-10">
      {/* Header */}
      <div className="p-4 border-b border-terminal-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100">Sessions</h2>
          <button
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
            title="Create session"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search sessions..."
            className="w-full px-3 py-2 pl-9 rounded-lg bg-terminal-bg border border-terminal-border text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <SessionList sessions={sessions} sessionAwareness={sessionAwareness} />
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-terminal-border">
        <button className="w-full px-3 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Session
        </button>
      </div>
    </aside>
  )
}
