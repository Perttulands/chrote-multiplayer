---
id: CMP-001
title: tldraw Canvas Foundation
type: feature
priority: p0
status: open
---

# tldraw Canvas Foundation

Set up tldraw as the infinite canvas foundation.

## Tasks

- [ ] Install tldraw and dependencies
- [ ] Create basic canvas component with pan/zoom
- [ ] Add sidebar layout (sessions list placeholder + canvas area)
- [ ] Configure tldraw for collaboration (Yjs store)
- [ ] Test basic shapes work (rectangles, sticky notes, arrows)
- [ ] Add minimap component

## Acceptance Criteria

- Canvas renders with infinite pan/zoom
- Sidebar + canvas layout works
- Can add/move/delete basic tldraw shapes
- Ready for custom Terminal shape integration

## Notes

- See docs/PRD.md for full architecture
- Use tldraw v2 (@tldraw/tldraw)
- Don't worry about terminal integration yet - that's CMP-003
