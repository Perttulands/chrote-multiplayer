import { create } from 'zustand'
import type { UserRole } from '@/types'

// API base URL (same origin by default)
const API_BASE = import.meta.env.VITE_API_BASE || ''

export interface ManagedUser {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: UserRole
  createdAt: string
  lastSeenAt?: string
}

interface UsersState {
  users: ManagedUser[]
  isLoading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
  updateUserRole: (userId: string, role: UserRole) => Promise<boolean>
  removeUser: (userId: string) => Promise<boolean>
}

// Mock data for development
const MOCK_USERS: ManagedUser[] = [
  { id: 'user-1', name: 'Perttu Lähteenlahti', email: 'perttu@chrote.cloud', role: 'owner', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'user-2', name: 'Alice Developer', email: 'alice@example.com', role: 'operator', createdAt: '2026-01-15T00:00:00Z' },
  { id: 'user-3', name: 'Bob Viewer', email: 'bob@example.com', role: 'viewer', createdAt: '2026-02-01T00:00:00Z' },
  { id: 'user-4', name: 'Carol Admin', email: 'carol@example.com', role: 'admin', createdAt: '2026-01-20T00:00:00Z' },
]

/** Map API user response to ManagedUser */
function mapApiUser(u: {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role: UserRole
  created_at: string | null
  last_seen_at: string | null
}): ManagedUser {
  return {
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    avatarUrl: u.avatar_url || undefined,
    role: u.role,
    createdAt: u.created_at || new Date().toISOString(),
    lastSeenAt: u.last_seen_at || undefined,
  }
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/users`, {
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Unauthorized: Admin access required')
        }
        throw new Error(`Failed to fetch users: ${response.statusText}`)
      }
      const data = await response.json()
      const users = data.users.map(mapApiUser)
      set({ users, isLoading: false })
    } catch (error) {
      // Fallback to mock data in development
      console.warn('Using mock user data:', error)
      set({
        users: MOCK_USERS,
        isLoading: false,
        error: null,
      })
    }
  },

  updateUserRole: async (userId: string, role: UserRole) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to update user role: ${response.statusText}`)
      }
      set({ isLoading: false })
      // Refresh user list
      get().fetchUsers()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update role'
      set({ isLoading: false, error: message })
      return false
    }
  },

  removeUser: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to remove user: ${response.statusText}`)
      }
      set({ isLoading: false })
      // Refresh user list
      get().fetchUsers()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove user'
      set({ isLoading: false, error: message })
      return false
    }
  },
}))
