import { create } from 'zustand'
import type { Session, User } from '@/types'

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

  // Active session
  activeSessionId: string | null
  setActiveSession: (sessionId: string | null) => void
  getActiveSession: () => Session | undefined

  // Connection state
  isConnected: boolean
  setConnected: (connected: boolean) => void
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
}))
