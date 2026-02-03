import { useState, useEffect, useMemo } from 'react'
import { useUsersStore, type ManagedUser } from '@/stores/users'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'

interface UserManagementPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function UserManagementPanel({ isOpen, onClose }: UserManagementPanelProps) {
  const { users, isLoading, error, fetchUsers, updateUserRole, removeUser } = useUsersStore()
  const { user: currentUser } = useAuthStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchUsers()
    }
  }, [isOpen, fetchUsers])

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase()
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    await updateUserRole(userId, newRole)
  }

  const handleRemove = async (userId: string) => {
    await removeUser(userId)
    setRemoveConfirm(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col bg-terminal-surface border border-terminal-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-terminal-border">
          <h2 className="text-lg font-semibold text-gray-100">Manage Users</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-accent-error/10 border border-accent-error/30 text-accent-error text-sm">
              {error}
            </div>
          )}

          {/* Search input */}
          <div className="relative">
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
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-terminal-bg border border-terminal-border text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50"
            />
          </div>

          {/* Users list */}
          <div>
            <h3 className="text-sm font-medium text-gray-100 mb-3">
              Users ({filteredUsers.length})
            </h3>

            {isLoading && users.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                {searchQuery ? 'No users found' : 'No users in workspace'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <UserItem
                    key={user.id}
                    user={user}
                    isCurrentUser={currentUser?.id === user.id}
                    showRemoveConfirm={removeConfirm === user.id}
                    onRoleChange={(role) => handleRoleChange(user.id, role)}
                    onRemoveClick={() => setRemoveConfirm(user.id)}
                    onRemoveCancel={() => setRemoveConfirm(null)}
                    onRemoveConfirm={() => handleRemove(user.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface UserItemProps {
  user: ManagedUser
  isCurrentUser: boolean
  showRemoveConfirm: boolean
  onRoleChange: (role: UserRole) => void
  onRemoveClick: () => void
  onRemoveCancel: () => void
  onRemoveConfirm: () => void
}

function UserItem({
  user,
  isCurrentUser,
  showRemoveConfirm,
  onRoleChange,
  onRemoveClick,
  onRemoveCancel,
  onRemoveConfirm,
}: UserItemProps) {
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)

  const isProtected = isCurrentUser || user.role === 'owner'

  const roleStyles: Record<UserRole, string> = {
    owner: 'bg-accent-warning/20 text-accent-warning',
    admin: 'bg-accent-error/20 text-accent-error',
    operator: 'bg-accent-primary/20 text-accent-primary',
    viewer: 'bg-gray-500/20 text-gray-400',
  }

  return (
    <div
      className={`p-3 rounded-lg bg-terminal-bg border ${
        isCurrentUser ? 'border-accent-primary/50' : 'border-terminal-border'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-accent-primary/20 flex items-center justify-center text-sm font-medium text-accent-primary uppercase">
            {initials}
          </div>
        )}

        {/* User info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100 truncate">
              {user.name}
            </span>
            {isCurrentUser && (
              <span className="text-xs text-accent-primary">(You)</span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate">{user.email}</div>
        </div>

        {/* Role dropdown */}
        <div>
          {isProtected ? (
            <span className={`px-2 py-1 rounded text-xs font-medium ${roleStyles[user.role]}`}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          ) : (
            <select
              value={user.role}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-primary/50 ${roleStyles[user.role]}`}
              style={{ backgroundColor: 'transparent' }}
            >
              <option value="viewer" className="bg-terminal-surface text-gray-100">Viewer</option>
              <option value="operator" className="bg-terminal-surface text-gray-100">Operator</option>
              <option value="admin" className="bg-terminal-surface text-gray-100">Admin</option>
            </select>
          )}
        </div>

        {/* Remove button */}
        <div>
          {showRemoveConfirm ? (
            <div className="flex gap-1">
              <button
                onClick={onRemoveCancel}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onRemoveConfirm}
                className="px-2 py-1 rounded text-xs bg-accent-error hover:bg-accent-error/90 text-white transition-colors"
              >
                Confirm
              </button>
            </div>
          ) : (
            <button
              onClick={onRemoveClick}
              disabled={isProtected}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                isProtected
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-400 hover:text-accent-error hover:bg-terminal-hover'
              }`}
              title={isProtected ? (isCurrentUser ? "You can't remove yourself" : "Owners can't be removed") : 'Remove user'}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
