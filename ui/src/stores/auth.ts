/**
 * Auth Store
 *
 * Manages authentication state, OAuth login, and session validation.
 */

import { create } from 'zustand'
import type { User, UserRole } from '@/types'

// API base URL (same origin by default)
const API_BASE = import.meta.env.VITE_API_BASE || ''

/** Auth user from /api/auth/me */
export interface AuthUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: UserRole
}

/** OAuth provider availability */
export interface AuthProviders {
  github: boolean
  google: boolean
}

interface AuthState {
  /** Current authenticated user */
  user: AuthUser | null

  /** Loading state for auth operations */
  isLoading: boolean

  /** Whether initial auth check is complete */
  isInitialized: boolean

  /** Auth error message */
  error: string | null

  /** Available OAuth providers */
  providers: AuthProviders

  /** Check current session via /api/auth/me */
  checkAuth: () => Promise<AuthUser | null>

  /** Fetch available OAuth providers */
  fetchProviders: () => Promise<void>

  /** Logout via /api/auth/logout */
  logout: () => Promise<void>

  /** Clear error */
  clearError: () => void

  /** Get user as UI User type */
  getUIUser: () => User | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  providers: { github: false, google: false },

  checkAuth: async () => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to check auth status')
      }

      const data = await response.json()

      if (data.user) {
        set({ user: data.user, isLoading: false, isInitialized: true })
        return data.user
      } else {
        set({ user: null, isLoading: false, isInitialized: true })
        return null
      }
    } catch (error) {
      console.error('[Auth] Failed to check auth:', error)
      set({
        user: null,
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Auth check failed',
      })
      return null
    }
  },

  fetchProviders: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/status`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch auth providers')
      }

      const data = await response.json()
      set({ providers: data.providers || { github: false, google: false } })
    } catch (error) {
      console.error('[Auth] Failed to fetch providers:', error)
      // Default to showing both buttons if we can't check
      set({ providers: { github: true, google: true } })
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Logout failed')
      }

      set({ user: null, isLoading: false })
    } catch (error) {
      console.error('[Auth] Logout failed:', error)
      // Clear user anyway on logout failure
      set({
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      })
    }
  },

  clearError: () => set({ error: null }),

  getUIUser: () => {
    const { user } = get()
    if (!user) return null

    return {
      id: user.id,
      email: user.email,
      name: user.name || user.email,
      avatarUrl: user.avatar_url || undefined,
      role: user.role,
    }
  },
}))

/** Get OAuth login URL */
export function getOAuthLoginUrl(provider: 'github' | 'google', inviteToken?: string): string {
  const base = `${API_BASE}/api/auth/${provider}`
  if (inviteToken) {
    return `${base}?invite=${encodeURIComponent(inviteToken)}`
  }
  return base
}

/** Parse error from URL query params */
export function getAuthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')

  if (!error) return null

  const errorMessages: Record<string, string> = {
    invalid_state: 'Authentication failed. Please try again.',
    no_email: 'Could not retrieve your email address.',
    email_not_verified: 'Your email is not verified.',
    invite_required: 'An invite is required to sign up.',
    invalid_invite: 'Invalid or expired invite link.',
    invite_expired: 'This invite has expired.',
    invite_exhausted: 'This invite has reached its usage limit.',
    oauth_failed: 'OAuth authentication failed. Please try again.',
    user_creation_failed: 'Failed to create user account.',
  }

  return errorMessages[error] || `Authentication error: ${error}`
}

/** Clear error from URL */
export function clearAuthErrorFromUrl(): void {
  const url = new URL(window.location.href)
  if (url.searchParams.has('error')) {
    url.searchParams.delete('error')
    window.history.replaceState({}, '', url.toString())
  }
}
