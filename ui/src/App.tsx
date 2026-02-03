import { useEffect } from 'react'
import { Header, Sidebar, Canvas } from '@/components'
import { useSessionStore } from '@/stores/session'
import type { Session, User } from '@/types'

// Demo data for development
const DEMO_USER: User = {
  id: 'user-1',
  name: 'Perttu Lähteenlahti',
  email: 'perttu@chrote.cloud',
  avatarUrl: undefined,
}

const DEMO_SESSIONS: Session[] = [
  {
    id: 'session-1',
    name: 'Dev Environment',
    hostId: 'user-1',
    tmuxSession: 'chrote-dev',
    createdAt: new Date(),
    status: 'active',
    participants: [
      {
        userId: 'user-1',
        user: DEMO_USER,
        role: 'host',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
      },
      {
        userId: 'user-2',
        user: {
          id: 'user-2',
          name: 'Demo Viewer',
          email: 'viewer@demo.com',
        },
        role: 'viewer',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
      },
    ],
  },
  {
    id: 'session-2',
    name: 'Production Server',
    hostId: 'user-1',
    tmuxSession: 'chrote-prod',
    createdAt: new Date(),
    status: 'paused',
    participants: [
      {
        userId: 'user-1',
        user: DEMO_USER,
        role: 'host',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
      },
    ],
  },
  {
    id: 'session-3',
    name: 'Pair Programming',
    hostId: 'user-3',
    tmuxSession: 'pair-session',
    createdAt: new Date(),
    status: 'active',
    participants: [
      {
        userId: 'user-3',
        user: {
          id: 'user-3',
          name: 'Alice Dev',
          email: 'alice@dev.com',
        },
        role: 'host',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
      },
      {
        userId: 'user-1',
        user: DEMO_USER,
        role: 'controller',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
      },
      {
        userId: 'user-4',
        user: {
          id: 'user-4',
          name: 'Bob Helper',
          email: 'bob@help.com',
        },
        role: 'viewer',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: false,
      },
    ],
  },
]

function App() {
  const {
    user,
    setUser,
    setSessions,
    setActiveSession,
    setConnected,
  } = useSessionStore()

  // Initialize with demo data
  useEffect(() => {
    setUser(DEMO_USER)
    setSessions(DEMO_SESSIONS)
    setConnected(true)

    // Select first session by default
    if (DEMO_SESSIONS.length > 0) {
      setActiveSession(DEMO_SESSIONS[0].id)
    }
  }, [setUser, setSessions, setConnected, setActiveSession])

  const handleLogout = () => {
    setUser(null)
    setSessions([])
    setActiveSession(null)
    setConnected(false)
  }

  return (
    <div className="h-screen flex flex-col bg-terminal-bg">
      {/* Header */}
      <Header user={user} onLogout={handleLogout} />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Canvas - infinite whiteboard */}
        <main className="flex-1 overflow-hidden relative">
          <Canvas />
        </main>
      </div>
    </div>
  )
}

export default App
