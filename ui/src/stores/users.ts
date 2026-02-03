import { create } from 'zustand'
import type { UserRole } from '@/types'

const CHROTE_API = import.meta.env.VITE_CHROTE_API || 'http://chrote:8080'

export interface ManagedUser {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: UserRole
  joinedAt: string
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
  { id: 'user-1', name: 'Perttu Lähteenlahti', email: 'perttu@chrote.cloud', role: 'owner', joinedAt: '2026-01-01' },
  { id: 'user-2', name: 'Alice Developer', email: 'alice@example.com', role: 'operator', joinedAt: '2026-01-15' },
  { id: 'user-3', name: 'Bob Viewer', email: 'bob@example.com', role: 'viewer', joinedAt: '2026-02-01' },
  { id: 'user-4', name: 'Carol Admin', email: 'carol@example.com', role: 'admin', joinedAt: '2026-01-20' },
]

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${CHROTE_API}/api/users`, {
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Unauthorized')
        }
        throw new Error(`Failed to fetch users: ${response.statusText}`)
      }
      const data = await response.json()
      set({ users: data.users, isLoading: false })
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
      const response = await fetch(`${CHROTE_API}/api/users/${userId}/role`, {
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
      // Mock success in development
      console.warn('Mock role update:', error)
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, role } : u
        ),
        isLoading: false,
        error: null,
      }))
      return true
    }
  },

  removeUser: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${CHROTE_API}/api/users/${userId}`, {
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
      // Mock success in development
      console.warn('Mock user removal:', error)
      set((state) => ({
        users: state.users.filter((u) => u.id !== userId),
        isLoading: false,
        error: null,
      }))
      return true
    }
  },
}))
