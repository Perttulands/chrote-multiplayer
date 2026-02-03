---
id: CMP-002
title: Yjs Real-time Sync
type: feature
priority: p0
status: open
---

# Yjs Real-time Sync

Set up Yjs + Hocuspocus for real-time collaboration.

## Tasks

- [ ] Install yjs, @hocuspocus/server, @hocuspocus/provider
- [ ] Create Hocuspocus server (can be same Hono server or separate)
- [ ] Connect tldraw to Yjs store
- [ ] Implement presence/awareness (cursors, user colors)
- [ ] Test multi-user sync (open 2 browser tabs)
- [ ] Handle reconnection gracefully

## Acceptance Criteria

- Two browser tabs see each other's cursors
- Shapes sync in real-time between users
- User presence shows (who's online)
- Reconnection works without data loss

## Notes

- tldraw has built-in Yjs support via @tldraw/yjs
- Hocuspocus handles WebSocket + persistence
- See docs/PRD.md for architecture
