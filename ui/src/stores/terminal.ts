import { create } from 'zustand'

interface TerminalState {
  // Terminal data per session
  buffers: Map<string, string[]>

  // Add output to a session's buffer
  appendOutput: (sessionId: string, data: string) => void

  // Clear a session's buffer
  clearBuffer: (sessionId: string) => void

  // Get buffer for a session
  getBuffer: (sessionId: string) => string[]

  // Scroll positions per session (for independent scrolling)
  scrollPositions: Map<string, number>
  setScrollPosition: (sessionId: string, position: number) => void
  getScrollPosition: (sessionId: string) => number
}

const MAX_BUFFER_LINES = 10000

export const useTerminalStore = create<TerminalState>((set, get) => ({
  buffers: new Map(),

  appendOutput: (sessionId, data) => {
    set((state) => {
      const newBuffers = new Map(state.buffers)
      const buffer = newBuffers.get(sessionId) || []
      const lines = data.split('\n')
      const newBuffer = [...buffer, ...lines].slice(-MAX_BUFFER_LINES)
      newBuffers.set(sessionId, newBuffer)
      return { buffers: newBuffers }
    })
  },

  clearBuffer: (sessionId) => {
    set((state) => {
      const newBuffers = new Map(state.buffers)
      newBuffers.set(sessionId, [])
      return { buffers: newBuffers }
    })
  },

  getBuffer: (sessionId) => {
    return get().buffers.get(sessionId) || []
  },

  scrollPositions: new Map(),

  setScrollPosition: (sessionId, position) => {
    set((state) => {
      const newPositions = new Map(state.scrollPositions)
      newPositions.set(sessionId, position)
      return { scrollPositions: newPositions }
    })
  },

  getScrollPosition: (sessionId) => {
    return get().scrollPositions.get(sessionId) || 0
  },
}))
