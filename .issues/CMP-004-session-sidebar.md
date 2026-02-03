---
id: CMP-004
title: Session Sidebar + Drag to Board
type: feature
priority: p1
status: open
---

# Session Sidebar + Drag to Board

Sidebar showing CHROTE sessions that can be dragged onto the board.

## Tasks

- [ ] Fetch sessions from CHROTE API (chrote:8080/api/tmux/sessions)
- [ ] Display sessions list in sidebar
- [ ] Implement drag from sidebar to canvas
- [ ] On drop: create TerminalShape at drop position
- [ ] Show session status (attached/detached, window count)
- [ ] Add [+] button to create new session
- [ ] Refresh sessions list periodically or on websocket event

## Acceptance Criteria

- Sidebar shows live sessions from CHROTE
- Can drag session onto board → creates terminal
- Creating new session works
- List stays up to date

## Dependencies

- CMP-001 (canvas)
- CMP-003 (terminal shape)
