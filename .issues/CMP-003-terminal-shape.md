# CMP-003: Terminal Shape for tldraw Canvas

## Summary
Create custom tldraw shape that renders xterm.js terminal with WebSocket streaming and lock state.

## Requirements

### Shape Properties
- `sessionId: string` - tmux session to connect to
- `lockedBy: string | null` - user ID who has control (null = available)
- Fixed size: 80 columns x 24 rows (standard terminal)

### Visual States
- **Unlocked**: Neutral border, "Available" badge
- **Locked by me**: Accent border, full keyboard input
- **Locked by other**: Muted style, locked badge with avatar

### Behavior
- Click shape to claim (if unlocked)
- Keyboard input only when you have lock
- Release button or click-away to release
- Real-time terminal output via WebSocket

### Integration Points
- WebSocket: `subscribe`, `unsubscribe`, `sendKeys` messages
- Lock: `claim`, `release` messages
- Output: Handle `output` messages to xterm

## Technical Design

```tsx
// Shape definition
interface TerminalShapeProps {
  w: number          // Fixed width
  h: number          // Fixed height
  sessionId: string
  lockedBy: string | null
}

// Shape extends BaseBoxShapeUtil
class TerminalShapeUtil extends BaseBoxShapeUtil<TerminalShape> {
  // Fixed size - no resize
  canResize = () => false

  // Render xterm + lock overlay
  component(shape) { ... }

  // Handle lock on pointer down
  onDoubleClick(shape) { ... }
}
```

## Acceptance Criteria
- [x] Terminal renders at 80x24 fixed size
- [x] WebSocket connects and streams output
- [x] Click claims lock (if available)
- [x] Keyboard input works when locked
- [x] Lock badge shows owner
- [x] Release works via button/click-away

## Status: COMPLETE ✅
Implemented in commits:
- 7694d60: TerminalShape.tsx with xterm.js integration
- 6eae540: Canvas.tsx with ConnectedTerminalShapeUtil wiring

## Dependencies
- CMP-001: tldraw canvas setup
- CMP-002: Yjs sync layer
