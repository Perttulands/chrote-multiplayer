---
id: CMP-005
title: Terminal Lock System
type: feature
priority: p1
status: open
---

# Terminal Lock System

Server-authoritative locking for terminal control.

## Tasks

- [ ] Add lock state to backend (who owns which terminal)
- [ ] API: POST /api/terminals/:id/lock - acquire lock
- [ ] API: POST /api/terminals/:id/release - release lock
- [ ] API: GET /api/terminals/locks - current lock state
- [ ] Broadcast lock changes via WebSocket
- [ ] UI: Click terminal = request lock
- [ ] UI: Release button or click-away = release
- [ ] UI: Show lock owner (avatar, color border)

## Acceptance Criteria

- Only one user can lock a terminal at a time
- Lock request fails gracefully if already locked
- All users see lock state in real-time
- No timeout auto-release (golden rule!)

## Notes

- Server is authoritative (not CRDT)
- Lock state synced via WebSocket broadcast, not Yjs
- See PRD for golden rule about sessions
