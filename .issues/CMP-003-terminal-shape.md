---
id: CMP-003
title: Custom Terminal Shape
type: feature
priority: p0
status: open
---

# Custom Terminal Shape

Create tldraw custom shape that renders xterm.js terminal.

## Tasks

- [ ] Create TerminalShape class extending tldraw BaseBoxShapeUtil
- [ ] Embed xterm.js inside shape (fixed 80x24)
- [ ] Connect to existing WebSocket terminal stream
- [ ] Add lock state to shape props (lockedBy: userId | null)
- [ ] Render lock indicator (border color, avatar badge)
- [ ] Handle focus: locked by me = can type, otherwise read-only
- [ ] Style terminal to look good on canvas

## Acceptance Criteria

- Can add Terminal shape to canvas
- Terminal shows live tmux output
- Lock state visible (who owns it)
- Can type when locked by self
- Can't type when locked by others or unlocked

## Technical Notes

```tsx
// Shape props
{
  sessionId: string,      // tmux session name
  lockedBy: string | null // user id or null
}
```

- Use existing WebSocket at /ws/terminal/:sessionId
- Fixed size = no resize handling needed
- See docs/PRD.md for full spec

## Dependencies

- CMP-001 (canvas foundation)
- Existing terminal WebSocket code
