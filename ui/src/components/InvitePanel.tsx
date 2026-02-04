import { useState, useEffect } from 'react'
import { useInviteStore } from '@/stores/invite'
import type { InviteRole, Invite } from '@/types'

interface InvitePanelProps {
  isOpen: boolean
  onClose: () => void
}

export function InvitePanel({ isOpen, onClose }: InvitePanelProps) {
  const {
    invites,
    isLoading,
    error,
    lastCreated,
    fetchInvites,
    createInvite,
    revokeInvite,
    clearLastCreated,
  } = useInviteStore()

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Form state
  const [role, setRole] = useState<InviteRole>('viewer')
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchInvites()
    }
  }, [isOpen, fetchInvites])

  const handleCreate = async () => {
    const result = await createInvite({
      role,
      note: note || undefined,
      max_uses: maxUses ? parseInt(maxUses, 10) : undefined,
      expires_in_days: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
    })
    if (result) {
      setShowCreateForm(false)
      setRole('viewer')
      setNote('')
      setMaxUses('')
      setExpiresInDays('')
    }
  }

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRevoke = async (id: string) => {
    await revokeInvite(id)
    setRevokeConfirm(null)
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
          <h2 className="text-lg font-semibold text-gray-100">Invite Management</h2>
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

          {/* Last created invite token (show once) */}
          {lastCreated && (
            <div className="p-4 rounded-lg bg-accent-success/10 border border-accent-success/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-accent-success mb-1">Invite created!</p>
                  <p className="text-xs text-gray-400 mb-2">
                    Copy this link now - it won't be shown again.
                  </p>
                  <code className="block p-2 bg-terminal-bg rounded text-xs text-gray-300 break-all">
                    {lastCreated.url}
                  </code>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleCopyLink(lastCreated.url)}
                    className="px-3 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-medium transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={clearLastCreated}
                    className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover text-xs transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create form */}
          {showCreateForm ? (
            <div className="p-4 rounded-lg bg-terminal-bg border border-terminal-border space-y-4">
              <h3 className="text-sm font-medium text-gray-100">Create New Invite</h3>

              {/* Role selection */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Role</label>
                <div className="flex gap-2">
                  {(['viewer', 'operator', 'admin'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        role === r
                          ? 'bg-accent-primary text-white'
                          : 'bg-terminal-surface border border-terminal-border text-gray-400 hover:text-gray-100 hover:border-terminal-hover'
                      }`}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., For John's team"
                  maxLength={200}
                  className="w-full px-3 py-2 rounded-lg bg-terminal-surface border border-terminal-border text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50"
                />
              </div>

              {/* Max uses */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Max uses (optional)</label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  min={1}
                  className="w-full px-3 py-2 rounded-lg bg-terminal-surface border border-terminal-border text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50"
                />
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Expires in days (optional)</label>
                <input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="Never"
                  min={1}
                  max={365}
                  className="w-full px-3 py-2 rounded-lg bg-terminal-surface border border-terminal-border text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent-primary/50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-3 py-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-terminal-hover text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {isLoading ? 'Creating...' : 'Create Invite'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full px-3 py-2.5 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Invite
            </button>
          )}

          {/* Invites list */}
          <div>
            <h3 className="text-sm font-medium text-gray-100 mb-3">
              Existing Invites ({invites.length})
            </h3>

            {isLoading && invites.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
            ) : invites.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No invites yet. Create one above.
              </div>
            ) : (
              <div className="space-y-2">
                {invites.map((invite) => (
                  <InviteItem
                    key={invite.id}
                    invite={invite}
                    showRevokeConfirm={revokeConfirm === invite.id}
                    onRevokeClick={() => setRevokeConfirm(invite.id)}
                    onRevokeCancel={() => setRevokeConfirm(null)}
                    onRevokeConfirm={() => handleRevoke(invite.id)}
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

interface InviteItemProps {
  invite: Invite
  showRevokeConfirm: boolean
  onRevokeClick: () => void
  onRevokeCancel: () => void
  onRevokeConfirm: () => void
}

function InviteItem({
  invite,
  showRevokeConfirm,
  onRevokeClick,
  onRevokeCancel,
  onRevokeConfirm,
}: InviteItemProps) {
  const statusLabel = invite.is_active ? 'Active' : invite.revoked ? 'Revoked' : 'Expired'
  const statusColor = invite.is_active
    ? 'bg-accent-success/20 text-accent-success'
    : 'bg-gray-500/20 text-gray-400'

  const usageText = invite.max_uses
    ? `${invite.uses}/${invite.max_uses} uses`
    : `${invite.uses} uses`

  const expiresText = invite.expires_at
    ? `Expires ${new Date(invite.expires_at).toLocaleDateString()}`
    : 'No expiration'

  return (
    <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Role badge and status */}
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-primary/20 text-accent-primary capitalize">
              {invite.role}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          </div>

          {/* Note */}
          {invite.note && (
            <p className="text-sm text-gray-300 mb-1">{invite.note}</p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
            <span>{usageText}</span>
            <span>{expiresText}</span>
            {invite.creator_name && <span>by {invite.creator_name}</span>}
          </div>
        </div>

        {/* Actions */}
        {invite.is_active && (
          <div>
            {showRevokeConfirm ? (
              <div className="flex gap-1">
                <button
                  onClick={onRevokeCancel}
                  className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-100 hover:bg-terminal-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onRevokeConfirm}
                  className="px-2 py-1 rounded text-xs bg-accent-error hover:bg-accent-error/90 text-white transition-colors"
                >
                  Confirm
                </button>
              </div>
            ) : (
              <button
                onClick={onRevokeClick}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:text-accent-error hover:bg-terminal-hover transition-colors"
              >
                Revoke
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
