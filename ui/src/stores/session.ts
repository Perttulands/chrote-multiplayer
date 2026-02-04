import { create } from 'zustand'
import type { Session, User } from '@/types'

// Backend API response type (from /api/terminal/sessions)
interface TmuxSession {
  name: string
  windows: number
  attached: number
  created: string
  id: string
  currentWindow?: string
  width?: number
  height?: number
}

// Backend API base URL (relative to same origin)
const API_BASE = import.meta.env.VITE_API_URL || ''

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

  // Fetch sessions from backend API (which proxies to CHROTE)
  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/terminal/sessions`, {
        credentials: 'include', // Include auth cookies
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.statusText}`)
      }
      const data: { sessions: TmuxSession[] } = await response.json()

      // Transform TmuxSession to our Session type
      const sessions: Session[] = data.sessions.map((ts) => ({
        id: ts.name, // Use tmux session name as ID
        name: ts.name,
        hostId: 'system', // System-managed sessions
        tmuxSession: ts.name,
        createdAt: ts.created ? new Date(ts.created) : new Date(),
        status: ts.attached > 0 ? 'active' : 'paused',
        participants: [], // Participants tracked via Yjs awareness
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
