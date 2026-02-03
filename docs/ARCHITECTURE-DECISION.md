# Architecture Decision: CHROTE Integration

**Status:** DECIDED
**Date:** 2026-02-03
**Decision:** Layered Architecture (CHROTE = terminal backend, multiplayer = collaboration layer)

---

## 1. CURRENT STATE

### CHROTE Server (chrote:8080)

| Capability | Status |
|------------|--------|
| List tmux sessions | ✅ `GET /api/tmux/sessions` |
| WebSocket terminal streaming | ✅ Interactive terminals in UI |
| Send keys via WebSocket | ✅ (part of interactive terminal) |
| Authentication | ❌ None (open access) |

CHROTE is the **terminal backend** - it provides direct, unauthenticated access to tmux sessions via WebSocket. This is intentional: CHROTE is for local/admin use.

### chrote-multiplayer Backend (port 3000)

chrote-multiplayer is the **collaboration layer** that adds multiplayer semantics on top of terminal access:

| Layer | What It Adds |
|-------|--------------|
| **Auth** | OAuth (GitHub/Google), invite-only access |
| **Roles** | viewer → operator → admin → owner |
| **Locks** | Claim/release, one controller per session |
| **Presence** | Who's watching, who's controlling |
| **Canvas** | Yjs CRDTs for layout, annotations, cursors |

---

## 2. ARCHITECTURAL CLARITY

### The Key Insight

**CHROTE and chrote-multiplayer are not competing - they're complementary layers:**

```
┌─────────────────────────────────────────────────────────────┐
│                    chrote-multiplayer                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │  Auth   │ │  Locks  │ │Presence │ │  Canvas (Yjs)   │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│              ┌─────────────────────┐                        │
│              │   CHROTE (8080)     │ ◀── Terminal Backend   │
│              │  • Session list     │                        │
│              │  • WebSocket stream │                        │
│              │  • Key input        │                        │
│              └─────────────────────┘                        │
│                         │                                    │
│                         ▼                                    │
│                    ┌─────────┐                               │
│                    │  tmux   │                               │
│                    └─────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### Shared Session Access

Both UIs show the **same tmux sessions** - this is correct:
- CHROTE dashboard: Direct access (admin/local use)
- chrote-multiplayer: Authenticated + collaborative access

They're different doors to the same room.

---

## 3. WHAT TO USE FROM CHROTE

| Capability | Use CHROTE? | Notes |
|------------|-------------|-------|
| Session listing | ✅ Yes | Fetch from `chrote:8080/api/tmux/sessions` |
| WebSocket streaming | ✅ Yes | Connect to CHROTE's existing WebSocket |
| Key input | ⚠️ Proxy | Route through multiplayer for lock enforcement |

### What chrote-multiplayer builds itself:

| Capability | Why |
|------------|-----|
| Auth/sessions | CHROTE has no auth - multiplayer adds it |
| Lock management | Collaboration primitive - multiplayer's job |
| Presence tracking | Collaboration primitive - multiplayer's job |
| Canvas state (Yjs) | Collaboration primitive - multiplayer's job |

---

## 4. THE KEY INPUT PROBLEM

CHROTE's WebSocket accepts key input directly. But multiplayer needs to enforce locks.

**Solution: Multiplayer proxies key input**

```
Browser → multiplayer WS → [lock check] → CHROTE WS → tmux
                              │
                              └── Reject if not lock holder
```

chrote-multiplayer's WebSocket server:
1. Authenticates the user
2. Checks if user holds the session lock
3. If yes: forwards keys to CHROTE WebSocket (or sends directly to tmux)
4. If no: rejects with "claim required" error

This keeps CHROTE simple (no auth) while multiplayer enforces collaboration rules.

---

## 5. SUGGESTED CHROTE API EXPANSIONS

To make the layered architecture cleaner, these CHROTE additions would help:

### Priority 1: WebSocket Session Targeting

**Current:** Single WebSocket connection to a specific terminal
**Needed:** Way for multiplayer to connect to any session programmatically

```
ws://chrote:8080/api/tmux/sessions/:name/stream
```

This lets multiplayer's backend connect to CHROTE on behalf of authenticated users.

### Priority 2: REST Endpoint for Scrollback

```
GET /api/tmux/sessions/:name/capture?lines=1000
```

Returns recent terminal output. Useful for:
- Initial load when user opens a session
- Reconnection after disconnect

### Priority 3: Session Creation/Destruction

```
POST /api/tmux/sessions          { name: "..." }
DELETE /api/tmux/sessions/:name
```

Currently both systems can create sessions. Having one API prevents naming conflicts.

### Not Needed in CHROTE

| Capability | Why Not |
|------------|---------|
| Authentication | Multiplayer handles this |
| Lock management | Collaboration logic stays in multiplayer |
| Presence | Collaboration logic stays in multiplayer |

---

## 6. IMPLEMENTATION PLAN

### Phase 1: Use CHROTE for Session Listing (Now)

Replace `TmuxBridge.listSessions()` calls with fetch to CHROTE:

```typescript
// src/server/tmux/chrote-client.ts
export async function listSessions(): Promise<TmuxSession[]> {
  const res = await fetch('http://chrote:8080/api/tmux/sessions');
  const data = await res.json();
  return data.sessions;
}
```

**Keep** `TmuxBridge` for operations CHROTE doesn't expose yet:
- `capturePane()` - direct tmux capture-pane
- `sendKeys()` - direct tmux send-keys (with lock check in multiplayer)

### Phase 2: WebSocket Passthrough (When CHROTE adds it)

Once CHROTE exposes per-session WebSocket streams:

```typescript
// multiplayer client connects to multiplayer backend
// multiplayer backend connects to CHROTE on their behalf
// Lock checks happen at multiplayer layer

client ──WS──▶ multiplayer ──WS──▶ chrote:8080 ──▶ tmux
                   │
                   └── auth + lock enforcement
```

### Phase 3: Full Proxy Mode (Optional)

If CHROTE adds capture/sendKeys REST endpoints, multiplayer can become a pure collaboration layer that proxies all terminal ops:

```typescript
// All tmux operations via CHROTE
const chrote = new ChroteClient('http://chrote:8080');

// In terminal routes, after auth + lock check:
await chrote.sendKeys(sessionName, keys);
const output = await chrote.capture(sessionName);
```

---

## 7. DECISION SUMMARY

| Question | Answer |
|----------|--------|
| Who owns tmux? | **CHROTE** (terminal backend) |
| Who owns collaboration? | **chrote-multiplayer** (auth, locks, presence, canvas) |
| Session consistency? | ✅ Both show same sessions (same tmux) |
| Key input flow? | Browser → multiplayer (lock check) → tmux |

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      MULTIPLAYER                            │
│   ┌──────┐  ┌───────┐  ┌──────────┐  ┌────────────────┐   │
│   │ Auth │  │ Locks │  │ Presence │  │ Canvas (Yjs)   │   │
│   └──────┘  └───────┘  └──────────┘  └────────────────┘   │
│                                                             │
│   Uses CHROTE for:        Builds itself:                   │
│   • Session listing       • User authentication            │
│   • Terminal streaming    • Lock-on-interact               │
│   • (future) scrollback   • Who's-watching-what            │
│                           • Canvas positions/annotations   │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  CHROTE (:8080)  │
                    │  Terminal API    │
                    └──────────────────┘
                              │
                              ▼
                         ┌─────────┐
                         │  tmux   │
                         └─────────┘
```

### Files to Modify

1. **Remove duplication:** Replace `TmuxBridge.listSessions()` with CHROTE API call
2. **Keep for now:** `TmuxBridge.sendKeys()` and `capturePane()` (until CHROTE exposes these)
3. **Add:** `src/server/chrote/client.ts` - CHROTE API client

### Environment Config

```env
CHROTE_API_URL=http://chrote:8080
CHROTE_WS_URL=ws://chrote:8080
```
