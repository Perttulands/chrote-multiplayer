import { useState } from 'react'
import type { User } from '@/types'
import { useSessionStore } from '@/stores/session'
import { InvitePanel } from './InvitePanel'
import { UserManagementPanel } from './UserManagementPanel'

interface HeaderProps {
  user: User | null
  onLogout: () => void
}

function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)

  return (
    <div className="flex items-center gap-3">
      {/* User info */}
      <div className="text-right hidden sm:block">
        <div className="text-sm font-medium text-gray-100">{user.name}</div>
        <div className="text-xs text-gray-500">{user.email}</div>
      </div>

      {/* Avatar */}
      <div className="relative">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-terminal-border"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-accent-primary/20 flex items-center justify-center text-sm font-medium text-accent-primary uppercase ring-2 ring-terminal-border">
            {initials}
          </div>
        )}
        {/* Online indicator */}
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-accent-success rounded-full ring-2 ring-terminal-bg" />
      </div>

      {/* Logout button */}
      <button
        onClick={onLogout}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
        title="Logout"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
      </button>
    </div>
  )
}

export function Header({ user, onLogout }: HeaderProps) {
  const { isConnected } = useSessionStore()
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [showUserPanel, setShowUserPanel] = useState(false)

  return (
    <>
      {/* Modals rendered outside header stacking context for proper z-index */}
      <InvitePanel isOpen={showInvitePanel} onClose={() => setShowInvitePanel(false)} />
      <UserManagementPanel isOpen={showUserPanel} onClose={() => setShowUserPanel(false)} />

      <header className="h-14 px-4 flex items-center justify-between border-b border-terminal-border bg-terminal-surface/50 backdrop-blur-sm relative z-20">
        {/* Logo and connection status */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
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
          <span className="font-semibold text-gray-100">CHROTE</span>
        </div>

        {/* Connection indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-terminal-bg text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-accent-success' : 'bg-gray-500'
            }`}
          />
          <span className={isConnected ? 'text-accent-success' : 'text-gray-500'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* User section */}
      <div className="flex items-center gap-2">
        {/* Manage Users button */}
        {user && (
          <button
            onClick={() => setShowUserPanel(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
            title="Manage Users"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </button>
        )}

        {/* Invite button (admin only - shown when user exists) */}
        {user && (
          <button
            onClick={() => setShowInvitePanel(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
            title="Manage Invites"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </button>
        )}

        {user ? (
          <UserMenu user={user} onLogout={onLogout} />
        ) : (
          <button className="px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium transition-colors">
            Sign In
          </button>
        )}
      </div>
    </header>
    </>
  )
}
