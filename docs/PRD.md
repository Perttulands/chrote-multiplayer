# CHROTE Multiplayer - Product Requirements Document

## Vision

A collaborative terminal environment where multiple users share a Miro-like canvas of tmux sessions. Everything visible is shared in real-time. Users see each other's cursors, selections, and focus. Sessions lock on interaction but can be released for seamless handoff.

## Core Principles

### 🔒 The Golden Rule
**Sessions are sacred.** They run coding agents that must never be disrupted. Sessions persist until deliberately killed. No auto-timeouts, no cleanup scripts, no "helpful" garbage collection.

### 🎯 Shared-First
Everything that can be shared, is shared. Like Miro, but for terminals:
- Terminal output (real-time streamed)
- Cursor positions (who's looking where)
- Selections and highlights
- Focus state (who has which session)
- Presence (who's online, active, idle)
- Annotations (comments, markers)

### 🔐 Lock-on-Interact
No queue system. Simple exclusive locks:
- Click/focus a session → you own it
- Others see it's locked (your color/avatar)
- Release explicitly → anyone can grab it
- No timeout-based auto-release (golden rule)

## Usage Patterns

1. **Parallel Pair Programming**
   - 2-4 people each running their own session
   - Side-by-side windows on shared canvas
   - See each other's progress in real-time

2. **Handoff Flow**
   - Person A works on session
   - Releases control
   - Person B jumps in immediately
   - Zero friction context switch

3. **Work + Watch**
   - 1-2 operators actively coding
   - Group observes (viewers)
   - Viewers can annotate, point, comment
   - Can't disrupt the session

4. **Mob Programming**
   - One "driver" at a time
   - Rapid handoffs via release
   - Everyone sees everything

## Technical Requirements

### Scale
- **Target**: Up to 20 concurrent users
- **Sessions**: 10-50 active tmux sessions
- **Latency**: <100ms for UI state sync, <200ms for terminal output

### Network
- **Internet-accessible** with authentication
- **OAuth**: GitHub + Google
- **Invite links**: Role-based access grants

### Persistence
- **Sessions**: Never auto-close (golden rule)
- **UI State**: Persisted (canvas layout, annotations)
- **Presence**: Ephemeral (online status)
- **History**: Optional replay of terminal output

### Security
- **4-tier roles**: Owner > Admin > Operator > Viewer
- **Owner**: Full control, can kill sessions, manage users
- **Admin**: Manage users, can't kill owner's sessions  
- **Operator**: Can lock/interact with sessions
- **Viewer**: Read-only, can annotate

## Shared State Model

```
┌─────────────────────────────────────────────────────────────┐
│                     SHARED CANVAS                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Session A    │  │ Session B    │  │ Session C    │      │
│  │ 🔒 @alice    │  │ 🔓 available │  │ 🔒 @bob      │      │
│  │ [terminal]   │  │ [terminal]   │  │ [terminal]   │      │
│  │              │  │    👆 carol  │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  👤 alice (operator) 👤 bob (operator) 👤 carol (viewer)   │
│  ───────────────────────────────────────────────────────── │
│  💬 annotations, comments, markers                         │
└─────────────────────────────────────────────────────────────┘
```

### State Types

| State | Sync Method | Persistence |
|-------|-------------|-------------|
| Terminal output | WebSocket stream | Backend (tmux) |
| Lock state | CRDT or server-auth | Server |
| Cursor positions | CRDT | Ephemeral |
| Canvas layout | CRDT | Persisted |
| Annotations | CRDT | Persisted |
| Presence | WebSocket | Ephemeral |
| User/role data | REST + DB | Persisted |

## User Interface

### Layout: Sidebar + Infinite Board

```
┌──────────┬────────────────────────────────────────────────┐
│ SIDEBAR  │              BOARD (infinite canvas)           │
│          │                                                │
│ Sessions │     Terminals + Annotations + Cursors          │
│ Users    │     Pan / Zoom / Draw                          │
│ Chat?    │                                                │
└──────────┴────────────────────────────────────────────────┘
```

### Sidebar
- **Sessions list**: Live from CHROTE API (`chrote:8080`)
- **Drag to board**: Drag session → creates terminal on board
- **Create new**: [+] spawns new tmux session
- **Users panel**: Who's online, their status/color
- **Collapsible**: Can hide to maximize board space

### Board (Infinite Canvas)
- **Pan**: Click-drag on empty space, or scroll
- **Zoom**: Scroll wheel, pinch, or zoom controls
- **Minimap**: Optional overview in corner
- **Grid snap**: Optional alignment helpers

### Terminals on Board
- **Fixed size**: 80x24 (or preset sizes: S/M/L)
- **No resize**: Simplicity over flexibility
- **Draggable**: Move anywhere on canvas
- **Lock indicator**: Shows who owns it (color + avatar)
- **Stream output**: Real-time from tmux via WebSocket

### Collaboration Tools
- **Live cursors**: See everyone's pointer + name tag
- **Sticky notes**: Post-it style annotations
- **Arrows/lines**: Point at things, connect ideas
- **Freehand draw**: Quick sketches/highlights
- **Text labels**: Add context anywhere
- **Emoji reactions**: Quick feedback (👍 🔥 ❓)

### Session Lifecycle on Board
1. **Drag from sidebar** → Terminal appears at drop point
2. **Click terminal** → Lock acquired, can type
3. **Click away / release button** → Lock released
4. **Drag to trash / press delete** → Remove from board (session persists in CHROTE!)
5. **Right-click → Kill** → Actually terminate session (confirmation required)

## Technical Architecture

### Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Canvas | **tldraw** | Infinite canvas, shapes, pan/zoom, built-in collab |
| Terminals | **xterm.js** | Terminal rendering (fixed 80x24) |
| Real-time sync | **Yjs + Hocuspocus** | CRDT for canvas state, presence, cursors |
| Terminal stream | **WebSocket** | tmux output streaming (existing) |
| Backend API | **Hono** | REST endpoints, auth (existing) |
| Database | **SQLite + Drizzle** | Users, sessions, permissions (existing) |
| Auth | **Arctic/Oslo** | OAuth GitHub/Google (existing) |

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ tldraw  │  │ xterm.js│  │   Yjs   │  │ Presence│        │
│  │ canvas  │  │terminals│  │  store  │  │awareness│        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
└───────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────────────────┐
   │ tldraw  │  │Terminal │  │    Hocuspocus       │
   │  sync   │  │   WS    │  │   (Yjs server)      │
   └─────────┘  └────┬────┘  └─────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   CHROTE    │
              │ tmux bridge │
              │ chrote:8080 │
              └─────────────┘
```

### Sync Strategy

| Data | Sync Method | Conflict Resolution |
|------|-------------|---------------------|
| Canvas shapes (post-its, arrows) | Yjs CRDT | Automatic merge |
| Terminal positions | Yjs CRDT | Automatic merge |
| Cursor positions | Yjs awareness | Last-write-wins |
| Presence | Yjs awareness | Ephemeral |
| Terminal locks | Server-authoritative | Server decides |
| Terminal output | WebSocket broadcast | tmux is source of truth |
| User/role data | REST + SQLite | Server-authoritative |

### Terminal as tldraw Shape

Custom tldraw shape that:
1. Renders xterm.js at fixed dimensions (80x24 chars)
2. Shows lock state (border color, avatar badge)
3. Captures keyboard when focused + locked by current user
4. Passes all other interactions to canvas

```tsx
// Pseudocode
class TerminalShape extends BaseShape {
  static props = {
    sessionId: string,
    lockedBy: string | null,
  }
  
  render() {
    return (
      <div className="terminal-shape">
        <LockBadge user={this.props.lockedBy} />
        <XTerm sessionId={this.props.sessionId} />
      </div>
    )
  }
}
```

## Non-Goals (v1)

- Voice/video chat (use Discord/Meet)
- Code editing features (it's terminal-native)
- Mobile support (desktop-first)
- Offline mode (always connected)
- Session recording/playback (maybe v2)

## Success Metrics

- **Handoff friction**: <2 seconds to release and reacquire
- **Sync latency**: <100ms cursor updates
- **Reliability**: 0 accidental session kills
- **Adoption**: Team uses it daily for pair programming

---

*Last updated: 2026-02-03*
