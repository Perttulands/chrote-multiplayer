import { create } from 'zustand'
import type { Session, User } from '@/types'

// CHROTE API response type
interface ChroteSession {
  name: string
  created: string
  attached: boolean
  windows: number
}

// CHROTE API base URL
const CHROTE_API = import.meta.env.VITE_CHROTE_API || 'http://chrote:8080'

interface SessionState {
  // Current user
  user: User | null
  setUser: (user: User | null) => void

  // Sessions
  sessions: Session[]
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  removeSession: (sessionId: string) => void
  updateSession: (sessionId: string, updates: Partial<Session>) => void
  fetchSessions: () => Promise<void>

  // Active session
  activeSessionId: string | null
  setActiveSession: (sessionId: string | null) => void
  getActiveSession: () => Session | undefined

  // Connection state
  isConnected: boolean
  setConnected: (connected: boolean) => void
  isLoading: boolean
  error: string | null
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Current user
  user: null,
  setUser: (user) => set({ user }),

  // Sessions
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),
  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    })),
  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    })),

  // Active session
  activeSessionId: null,
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find((s) => s.id === activeSessionId)
  },

  // Connection state
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
  isLoading: false,
  error: null,

  // Fetch sessions from CHROTE API
  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${CHROTE_API}/api/tmux/sessions`)
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.statusText}`)
      }
      const chroteSessions: ChroteSession[] = await response.json()

      // Transform CHROTE sessions to our Session type
      const sessions: Session[] = chroteSessions.map((cs) => ({
        id: cs.name, // Use tmux session name as ID
        name: cs.name,
        hostId: 'system', // System-managed sessions
        tmuxSession: cs.name,
        createdAt: new Date(cs.created),
        status: cs.attached ? 'active' : 'paused',
        participants: [], // No participants tracked yet
      }))

      set({ sessions, isLoading: false, isConnected: true })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch sessions',
        isLoading: false,
        isConnected: false,
      })
    }
  },
}))
