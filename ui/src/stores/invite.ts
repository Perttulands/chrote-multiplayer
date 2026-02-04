import { create } from 'zustand'
import type { Invite, CreateInviteRequest, CreateInviteResponse } from '@/types'

// API base URL (same origin by default - invites are on main server, not chrote)
const API_BASE = import.meta.env.VITE_API_BASE || ''

interface InviteState {
  invites: Invite[]
  isLoading: boolean
  error: string | null

  // Last created invite (for showing token once)
  lastCreated: CreateInviteResponse | null
  clearLastCreated: () => void

  // Actions
  fetchInvites: () => Promise<void>
  createInvite: (data: CreateInviteRequest) => Promise<CreateInviteResponse | null>
  revokeInvite: (id: string) => Promise<boolean>
}

export const useInviteStore = create<InviteState>((set, get) => ({
  invites: [],
  isLoading: false,
  error: null,
  lastCreated: null,

  clearLastCreated: () => set({ lastCreated: null }),

  fetchInvites: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/invites`, {
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Unauthorized')
        }
        throw new Error(`Failed to fetch invites: ${response.statusText}`)
      }
      const data = await response.json()
      set({ invites: data.invites, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch invites',
        isLoading: false,
      })
    }
  },

  createInvite: async (data: CreateInviteRequest) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create invite: ${response.statusText}`)
      }
      const result: CreateInviteResponse = await response.json()
      set({ lastCreated: result, isLoading: false })
      // Refresh invite list
      get().fetchInvites()
      return result
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create invite',
        isLoading: false,
      })
      return null
    }
  },

  revokeInvite: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/invites/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to revoke invite: ${response.statusText}`)
      }
      set({ isLoading: false })
      // Refresh invite list
      get().fetchInvites()
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to revoke invite',
        isLoading: false,
      })
      return false
    }
  },
}))
