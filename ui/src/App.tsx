import { useEffect } from 'react'
import { Header, Sidebar, Canvas, LoginPage } from '@/components'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import type { Session } from '@/types'

// Demo sessions for fallback when API is unavailable
const DEMO_SESSIONS: Session[] = [
  {
    id: 'session-1',
    name: 'Dev Environment',
    hostId: 'system',
    tmuxSession: 'chrote-dev',
    createdAt: new Date(),
    status: 'active',
    participants: [],
  },
  {
    id: 'session-2',
    name: 'Production Server',
    hostId: 'system',
    tmuxSession: 'chrote-prod',
    createdAt: new Date(),
    status: 'paused',
    participants: [],
  },
]

function App() {
  const { setSessions, setConnected, fetchSessions } = useSessionStore()
  const { user, isLoading, isInitialized, checkAuth, logout, getUIUser } = useAuthStore()

  // Check authentication on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Fetch sessions when authenticated
  useEffect(() => {
    if (user) {
      fetchSessions().catch(() => {
        // Fallback to demo data if API unavailable
        setSessions(DEMO_SESSIONS)
        setConnected(true)
      })
    }
  }, [user, fetchSessions, setSessions, setConnected])

  // Refresh sessions periodically when authenticated
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      fetchSessions().catch(() => {})
    }, 10000) // Refresh every 10 seconds

    return () => clearInterval(interval)
  }, [user, fetchSessions])

  const handleLogout = async () => {
    await logout()
    setSessions([])
    setConnected(false)
  }

  // Show loading spinner while checking auth
  if (!isInitialized || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-terminal-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />
  }

  // Get user in UI format
  const uiUser = getUIUser()

  return (
    <div className="h-screen flex flex-col bg-terminal-bg">
      {/* Header */}
      <Header user={uiUser} onLogout={handleLogout} />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Canvas - infinite whiteboard */}
        <main className="flex-1 overflow-hidden relative z-0">
          <Canvas />
        </main>
      </div>
    </div>
  )
}

export default App
