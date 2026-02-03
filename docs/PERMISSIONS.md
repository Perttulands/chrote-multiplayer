# Permission System

This document defines the role-based access control (RBAC) system for CHROTE Multiplayer.

## Table of Contents

- [Role Hierarchy](#role-hierarchy)
- [Permission Matrix](#permission-matrix)
- [API Route Protection](#api-route-protection)
- [WebSocket Message Permissions](#websocket-message-permissions)
- [Helper Functions](#helper-functions)
- [Error Handling](#error-handling)
- [Implementation Guide](#implementation-guide)

---

## Role Hierarchy

CHROTE Multiplayer uses a 4-tier role hierarchy:

```
┌─────────────────────────────────────────────────────────────┐
│                         OWNER                                │
│  Full control including workspace deletion and transfer      │
├─────────────────────────────────────────────────────────────┤
│                         ADMIN                                │
│  User management, invites, all operational control           │
├─────────────────────────────────────────────────────────────┤
│                        OPERATOR                              │
│  Send commands, create sessions, claim sessions              │
├─────────────────────────────────────────────────────────────┤
│                         VIEWER                               │
│  Read-only access, own UI state                              │
└─────────────────────────────────────────────────────────────┘
```

### Role Definitions

| Role | Database Value | Description |
|------|----------------|-------------|
| **Owner** | `owner` | Workspace creator with full control. Only one per workspace. |
| **Admin** | `admin` | Can manage users and invites. Cannot delete workspace or transfer ownership. |
| **Operator** | `operator` | Can interact with terminals. Cannot manage other users. |
| **Viewer** | `viewer` | Read-only access. Default role for new users via invite. |

### Role Ordering

For permission comparisons, roles have a numeric ordering:

```typescript
const ROLE_LEVEL: Record<Role, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  viewer: 1,
};
```

---

## Permission Matrix

### Full Permission Table

| Action | Owner | Admin | Operator | Viewer |
|--------|:-----:|:-----:|:--------:|:------:|
| **Viewing** |
| View sessions | ✓ | ✓ | ✓ | ✓ |
| View terminal output | ✓ | ✓ | ✓ | ✓ |
| View user list | ✓ | ✓ | ✓ | ✓ |
| View own profile | ✓ | ✓ | ✓ | ✓ |
| **Terminal Control** |
| Send keys to terminal | ✓ | ✓ | ✓ | ✗ |
| Claim session | ✓ | ✓ | ✓ | ✗ |
| Release own claim | ✓ | ✓ | ✓ | ✗ |
| Override any claim | ✓ | ✓ | ✗ | ✗ |
| **Session Management** |
| Create session | ✓ | ✓ | ✓ | ✗ |
| Delete session | ✓ | ✓ | ✗ | ✗ |
| Rename session | ✓ | ✓ | ✓ | ✗ |
| **User Management** |
| Create invite | ✓ | ✓ | ✗ | ✗ |
| View invites | ✓ | ✓ | ✗ | ✗ |
| Revoke invite | ✓ | ✓ | ✗ | ✗ |
| Promote user | ✓ | ✓* | ✗ | ✗ |
| Demote user | ✓ | ✓* | ✗ | ✗ |
| Remove user | ✓ | ✓ | ✗ | ✗ |
| **Workspace** |
| View settings | ✓ | ✓ | ✓ | ✓ |
| Modify settings | ✓ | ✓ | ✗ | ✗ |
| Delete workspace | ✓ | ✗ | ✗ | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ | ✗ |

*Admin promotion/demotion rules:
- Admin can promote: Viewer → Operator → Admin
- Admin can demote: Operator → Viewer
- Admin **cannot** demote other Admins
- Admin **cannot** modify Owner

---

## API Route Protection

### Middleware Design

```typescript
// src/middleware/permissions.ts

import { Request, Response, NextFunction } from 'express';

export type Role = 'owner' | 'admin' | 'operator' | 'viewer';
export type Permission =
  | 'view'
  | 'sendKeys'
  | 'claim'
  | 'createSession'
  | 'deleteSession'
  | 'createInvite'
  | 'manageUsers'
  | 'modifySettings'
  | 'deleteWorkspace'
  | 'transferOwnership';

/**
 * Middleware factory for permission-protected routes
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user; // From auth middleware

    if (!user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (!hasPermission(user.role, permission)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Permission denied: ${permission} requires higher role`,
        required: getRequiredRole(permission),
        current: user.role,
      });
    }

    next();
  };
}

/**
 * Shorthand middleware for role-based access
 */
export const requireRole = {
  owner: requirePermission('deleteWorkspace'),
  admin: requirePermission('manageUsers'),
  operator: requirePermission('sendKeys'),
  viewer: requirePermission('view'),
};
```

### Route Protection Examples

```typescript
// src/routes/invites.ts
import { Router } from 'express';
import { requirePermission } from '../middleware/permissions';

const router = Router();

// Admin+ only
router.post('/invites', requirePermission('createInvite'), createInvite);
router.get('/invites', requirePermission('createInvite'), listInvites);
router.delete('/invites/:id', requirePermission('createInvite'), revokeInvite);

// Public (validation only)
router.get('/invites/:token/validate', validateInvite);
router.post('/invites/:token/accept', acceptInvite);

export default router;
```

```typescript
// src/routes/users.ts
import { Router } from 'express';
import { requirePermission } from '../middleware/permissions';

const router = Router();

// Admin+ only
router.get('/users', requirePermission('manageUsers'), listUsers);
router.patch('/users/:id/role', requirePermission('manageUsers'), changeRole);
router.delete('/users/:id', requirePermission('manageUsers'), removeUser);

export default router;
```

```typescript
// src/routes/sessions.ts
import { Router } from 'express';
import { requirePermission } from '../middleware/permissions';

const router = Router();

// All authenticated users can view
router.get('/sessions', listSessions);
router.get('/sessions/:id', getSession);

// Operator+ only
router.post('/sessions', requirePermission('createSession'), createSession);
router.patch('/sessions/:id', requirePermission('createSession'), updateSession);

// Admin+ only
router.delete('/sessions/:id', requirePermission('deleteSession'), deleteSession);

export default router;
```

---

## WebSocket Message Permissions

### Permission Checks by Message Type

| Message Type | Required Permission | Notes |
|--------------|---------------------|-------|
| `subscribe` | `view` | All authenticated users |
| `unsubscribe` | `view` | All authenticated users |
| `heartbeat` | `view` | All authenticated users |
| `sendKeys` | `sendKeys` + claim check | Must be operator+ AND hold claim or unclaimed |
| `claim` | `claim` | Operator+ only |
| `release` | `claim` | Must be claim owner or admin+ |

### WebSocket Handler Implementation

```typescript
// src/websocket/handlers.ts

import { WebSocket } from 'ws';
import { User, Permission } from '../types';
import { hasPermission, canSendKeysToSession } from '../permissions';

interface WSMessage {
  type: string;
  sessionId?: string;
  keys?: string;
  [key: string]: unknown;
}

export async function handleMessage(
  ws: WebSocket,
  user: User,
  message: WSMessage
): Promise<void> {
  switch (message.type) {
    case 'subscribe':
      await handleSubscribe(ws, user, message.sessionId);
      break;

    case 'unsubscribe':
      await handleUnsubscribe(ws, user, message.sessionId);
      break;

    case 'sendKeys':
      if (!hasPermission(user.role, 'sendKeys')) {
        sendError(ws, 'FORBIDDEN', 'Viewers cannot send keys');
        return;
      }
      if (!await canSendKeysToSession(user.id, message.sessionId)) {
        sendError(ws, 'CLAIM_REQUIRED', 'Session is claimed by another user');
        return;
      }
      await handleSendKeys(ws, user, message.sessionId, message.keys);
      break;

    case 'claim':
      if (!hasPermission(user.role, 'claim')) {
        sendError(ws, 'FORBIDDEN', 'Viewers cannot claim sessions');
        return;
      }
      await handleClaim(ws, user, message.sessionId);
      break;

    case 'release':
      await handleRelease(ws, user, message.sessionId);
      break;

    case 'heartbeat':
      await handleHeartbeat(ws, user);
      break;

    default:
      sendError(ws, 'INVALID_MESSAGE', `Unknown message type: ${message.type}`);
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  ws.send(JSON.stringify({ type: 'error', code, message }));
}
```

---

## Helper Functions

### Core Permission Functions

```typescript
// src/permissions/index.ts

export type Role = 'owner' | 'admin' | 'operator' | 'viewer';

const ROLE_LEVEL: Record<Role, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  viewer: 1,
};

/**
 * Check if a role meets the minimum required level
 */
export function hasMinRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

/**
 * Check if user can perform a specific action
 */
export function canSendKeys(role: Role): boolean {
  return hasMinRole(role, 'operator');
}

export function canClaim(role: Role): boolean {
  return hasMinRole(role, 'operator');
}

export function canCreateSession(role: Role): boolean {
  return hasMinRole(role, 'operator');
}

export function canDeleteSession(role: Role): boolean {
  return hasMinRole(role, 'admin');
}

export function canManageUsers(role: Role): boolean {
  return hasMinRole(role, 'admin');
}

export function canCreateInvite(role: Role): boolean {
  return hasMinRole(role, 'admin');
}

export function canModifySettings(role: Role): boolean {
  return hasMinRole(role, 'admin');
}

export function canDeleteWorkspace(role: Role): boolean {
  return role === 'owner';
}

export function canTransferOwnership(role: Role): boolean {
  return role === 'owner';
}

export function canOverrideClaim(role: Role): boolean {
  return hasMinRole(role, 'admin');
}
```

### Role Change Validation

```typescript
// src/permissions/roles.ts

import { Role, hasMinRole } from './index';

interface RoleChangeResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if actor can change target's role
 */
export function canChangeRole(
  actorRole: Role,
  targetCurrentRole: Role,
  targetNewRole: Role
): RoleChangeResult {
  // Only admin+ can change roles
  if (!hasMinRole(actorRole, 'admin')) {
    return { allowed: false, reason: 'Only admins can change user roles' };
  }

  // Cannot modify owner
  if (targetCurrentRole === 'owner') {
    return { allowed: false, reason: 'Cannot modify owner role' };
  }

  // Cannot set to owner (only transfer works)
  if (targetNewRole === 'owner') {
    return { allowed: false, reason: 'Use ownership transfer instead' };
  }

  // Owner can do anything (except above restrictions)
  if (actorRole === 'owner') {
    return { allowed: true };
  }

  // Admin restrictions
  if (actorRole === 'admin') {
    // Cannot demote other admins
    if (targetCurrentRole === 'admin') {
      return { allowed: false, reason: 'Admins cannot modify other admins' };
    }
    // Cannot promote to owner
    if (targetNewRole === 'owner') {
      return { allowed: false, reason: 'Only owner can transfer ownership' };
    }
    // Can promote/demote between viewer, operator, admin
    return { allowed: true };
  }

  return { allowed: false, reason: 'Insufficient permissions' };
}

/**
 * Check if actor can remove target from workspace
 */
export function canRemoveUser(
  actorRole: Role,
  targetRole: Role
): RoleChangeResult {
  if (!hasMinRole(actorRole, 'admin')) {
    return { allowed: false, reason: 'Only admins can remove users' };
  }

  if (targetRole === 'owner') {
    return { allowed: false, reason: 'Cannot remove workspace owner' };
  }

  if (actorRole === 'admin' && targetRole === 'admin') {
    return { allowed: false, reason: 'Admins cannot remove other admins' };
  }

  return { allowed: true };
}
```

### Claim Permission Functions

```typescript
// src/permissions/claims.ts

import { db } from '../db';
import { hasMinRole } from './index';
import type { Role } from './index';

interface Claim {
  id: string;
  sessionId: string;
  claimedBy: string;
  expiresAt: Date;
}

/**
 * Check if user can send keys to a specific session
 */
export async function canSendKeysToSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const claim = await db.claims.findActive(sessionId);

  if (!claim) {
    // No active claim - any operator+ can send
    return true;
  }

  // User holds the claim
  if (claim.claimedBy === userId) {
    return true;
  }

  // Session is claimed by someone else
  return false;
}

/**
 * Check if user can claim a session
 */
export async function canClaimSession(
  userId: string,
  userRole: Role,
  sessionId: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!hasMinRole(userRole, 'operator')) {
    return { allowed: false, reason: 'Only operators can claim sessions' };
  }

  const existingClaim = await db.claims.findActive(sessionId);

  if (!existingClaim) {
    return { allowed: true };
  }

  // Admin+ can override any claim
  if (hasMinRole(userRole, 'admin')) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Session is claimed by another user until ${existingClaim.expiresAt}`
  };
}

/**
 * Check if user can release a claim
 */
export async function canReleaseClaim(
  userId: string,
  userRole: Role,
  sessionId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const claim = await db.claims.findActive(sessionId);

  if (!claim) {
    return { allowed: false, reason: 'No active claim on this session' };
  }

  // Claim owner can release
  if (claim.claimedBy === userId) {
    return { allowed: true };
  }

  // Admin+ can release any claim
  if (hasMinRole(userRole, 'admin')) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'You do not own this claim' };
}
```

---

## Error Handling

### Standard Error Response Format

All permission errors return a consistent JSON structure:

```typescript
interface PermissionError {
  error: 'UNAUTHORIZED' | 'FORBIDDEN';
  message: string;
  required?: Role;   // The role required for this action
  current?: Role;    // The user's current role
  action?: string;   // The attempted action
}
```

### HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| **401** | Unauthorized | No valid session/token |
| **403** | Forbidden | Valid session but insufficient permissions |

### Error Examples

**401 Unauthorized** - Missing or invalid authentication:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

**403 Forbidden** - Insufficient role:
```json
{
  "error": "FORBIDDEN",
  "message": "Permission denied: manageUsers requires admin role",
  "required": "admin",
  "current": "operator",
  "action": "manageUsers"
}
```

**403 Forbidden** - Claim conflict:
```json
{
  "error": "FORBIDDEN",
  "message": "Session is claimed by another user",
  "claimedBy": "user123",
  "expiresAt": "2026-02-03T12:30:00Z"
}
```

### WebSocket Error Messages

```typescript
interface WSError {
  type: 'error';
  code: string;
  message: string;
}
```

Common error codes:
- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Insufficient permissions
- `CLAIM_REQUIRED` - Session claimed by another user
- `NOT_FOUND` - Session doesn't exist
- `INVALID_MESSAGE` - Malformed message

---

## Implementation Guide

### Setup Checklist

1. **Database Setup**
   - [ ] Create `users` table with `role` column
   - [ ] Create `claims` table for session claiming
   - [ ] Create `audit_log` table for role changes

2. **Middleware Implementation**
   - [ ] Create `src/middleware/auth.ts` for session validation
   - [ ] Create `src/middleware/permissions.ts` for role checking
   - [ ] Add middleware to Express app

3. **Permission Functions**
   - [ ] Create `src/permissions/index.ts` with core functions
   - [ ] Create `src/permissions/roles.ts` for role change logic
   - [ ] Create `src/permissions/claims.ts` for claim logic

4. **API Routes**
   - [ ] Protect all routes with appropriate middleware
   - [ ] Return consistent error responses

5. **WebSocket Handler**
   - [ ] Add permission checks to all message handlers
   - [ ] Send error messages for unauthorized actions

6. **Testing**
   - [ ] Test each role × each action combination
   - [ ] Test role change rules
   - [ ] Test claim override rules
   - [ ] Test error message consistency

### File Structure

```
src/
├── middleware/
│   ├── auth.ts           # Session/cookie validation
│   └── permissions.ts    # Permission checking middleware
├── permissions/
│   ├── index.ts          # Core permission functions
│   ├── roles.ts          # Role change validation
│   └── claims.ts         # Claim-related permissions
├── routes/
│   ├── invites.ts        # Protected with createInvite
│   ├── users.ts          # Protected with manageUsers
│   └── sessions.ts       # Mixed permissions
└── websocket/
    └── handlers.ts       # Per-message permission checks
```

### Testing Strategy

```typescript
// tests/permissions.test.ts

import { describe, it, expect } from 'vitest';
import { canSendKeys, canManageUsers, canDeleteWorkspace } from '../src/permissions';

describe('Permission Functions', () => {
  describe('canSendKeys', () => {
    it('returns true for owner', () => {
      expect(canSendKeys('owner')).toBe(true);
    });
    it('returns true for admin', () => {
      expect(canSendKeys('admin')).toBe(true);
    });
    it('returns true for operator', () => {
      expect(canSendKeys('operator')).toBe(true);
    });
    it('returns false for viewer', () => {
      expect(canSendKeys('viewer')).toBe(false);
    });
  });

  describe('canManageUsers', () => {
    it('returns true for owner', () => {
      expect(canManageUsers('owner')).toBe(true);
    });
    it('returns true for admin', () => {
      expect(canManageUsers('admin')).toBe(true);
    });
    it('returns false for operator', () => {
      expect(canManageUsers('operator')).toBe(false);
    });
    it('returns false for viewer', () => {
      expect(canManageUsers('viewer')).toBe(false);
    });
  });

  describe('canDeleteWorkspace', () => {
    it('returns true for owner only', () => {
      expect(canDeleteWorkspace('owner')).toBe(true);
      expect(canDeleteWorkspace('admin')).toBe(false);
      expect(canDeleteWorkspace('operator')).toBe(false);
      expect(canDeleteWorkspace('viewer')).toBe(false);
    });
  });
});
```

---

## Audit Logging

All permission-sensitive actions should be logged:

```typescript
interface AuditEntry {
  action: AuditAction;
  actorId: string;
  targetId?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

type AuditAction =
  | 'role_change'
  | 'user_removed'
  | 'invite_created'
  | 'invite_revoked'
  | 'claim_created'
  | 'claim_released'
  | 'claim_overridden'
  | 'settings_changed'
  | 'ownership_transferred';
```

### Example Audit Entries

Role change:
```json
{
  "action": "role_change",
  "actorId": "admin123",
  "targetId": "user456",
  "details": {
    "oldRole": "viewer",
    "newRole": "operator"
  },
  "timestamp": "2026-02-03T10:30:00Z"
}
```

Claim override:
```json
{
  "action": "claim_overridden",
  "actorId": "admin123",
  "targetId": "operator456",
  "details": {
    "sessionId": "session789",
    "previousClaimExpiry": "2026-02-03T11:00:00Z"
  },
  "timestamp": "2026-02-03T10:30:00Z"
}
```
