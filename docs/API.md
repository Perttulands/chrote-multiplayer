# API Reference

REST and WebSocket API documentation for CHROTE Multiplayer.

## Table of Contents

- [Authentication](#authentication)
- [REST API](#rest-api)
  - [Auth Endpoints](#auth-endpoints)
  - [Session Endpoints](#session-endpoints)
  - [Tmux Endpoints (CHROTE Proxy)](#tmux-endpoints-chrote-proxy)
  - [User Endpoints](#user-endpoints)
  - [Invite Endpoints](#invite-endpoints)
- [WebSocket Protocol](#websocket-protocol)
- [Error Handling](#error-handling)

---

## Authentication

### Session-Based Auth

CHROTE Multiplayer uses HTTP-only session cookies for authentication.

**Login Flow:**
1. Redirect user to `/auth/github` or `/auth/google`
2. OAuth provider callback to `/auth/{provider}/callback`
3. Session cookie set automatically
4. All subsequent requests include session cookie

**Logout:**
```
POST /auth/logout
```

### Protected Routes

Most API endpoints require authentication. Unauthenticated requests return:

```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

---

## REST API

Base URL: `http://localhost:3000/api`

### Auth Endpoints

#### `GET /auth/github`

Initiates GitHub OAuth flow.

**Response:** 302 Redirect to GitHub

---

#### `GET /auth/google`

Initiates Google OAuth flow.

**Response:** 302 Redirect to Google

---

#### `GET /auth/github/callback`

GitHub OAuth callback handler.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `code` | string | OAuth authorization code |
| `state` | string | CSRF state parameter |

**Response:** 302 Redirect to app or error page

---

#### `POST /auth/logout`

Terminates the current session.

**Response:**
```json
{
  "success": true
}
```

---

#### `GET /auth/me`

Returns current authenticated user.

**Response:**
```json
{
  "id": "user_abc123",
  "name": "John Doe",
  "email": "john@example.com",
  "avatarUrl": "https://github.com/avatars/123",
  "role": "operator",
  "createdAt": "2026-02-03T10:00:00Z"
}
```

---

### Session Endpoints

#### `GET /api/sessions`

List all tmux sessions.

**Required Permission:** `view` (all authenticated users)

**Response:**
```json
{
  "sessions": [
    {
      "id": "main",
      "name": "main",
      "windows": 3,
      "created": "2026-02-03T08:00:00Z",
      "attached": false,
      "claim": null
    },
    {
      "id": "dev",
      "name": "dev",
      "windows": 1,
      "created": "2026-02-03T09:30:00Z",
      "attached": true,
      "claim": {
        "userId": "user_123",
        "userName": "Alice",
        "expiresAt": "2026-02-03T12:00:00Z"
      }
    }
  ]
}
```

---

#### `GET /api/sessions/:id`

Get single session details with pane content.

**Required Permission:** `view`

**Response:**
```json
{
  "id": "main",
  "name": "main",
  "windows": [
    {
      "index": 0,
      "name": "bash",
      "active": true,
      "panes": [
        {
          "index": 0,
          "content": "user@host:~$ ls\nfile1.txt  file2.txt\nuser@host:~$ █",
          "width": 80,
          "height": 24
        }
      ]
    }
  ],
  "viewers": [
    {"userId": "user_123", "name": "Alice"},
    {"userId": "user_456", "name": "Bob"}
  ],
  "claim": null
}
```

---

#### `POST /api/sessions/:id/claim`

Claim exclusive control of a session.

**Required Permission:** `claim` (operator+)

**Response:**
```json
{
  "success": true,
  "claim": {
    "sessionId": "main",
    "userId": "user_123",
    "expiresAt": "2026-02-03T12:30:00Z"
  }
}
```

**Error (403) - Already claimed:**
```json
{
  "error": "FORBIDDEN",
  "message": "Session is claimed by another user",
  "claimedBy": "user_456",
  "expiresAt": "2026-02-03T12:00:00Z"
}
```

---

#### `DELETE /api/sessions/:id/claim`

Release claim on a session.

**Required Permission:** Owner of claim or admin+

**Response:**
```json
{
  "success": true
}
```

---

### Tmux Endpoints (CHROTE Proxy)

#### `GET /api/tmux/sessions/:session/panes/:pane/capture`

Capture terminal pane content from a tmux session via CHROTE API.

**Required Permission:** `view` (all authenticated users)

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `session` | string | Tmux session name (e.g., `chrote-chat`) |
| `pane` | string | Pane index (e.g., `0`) |

**Response:**
```json
{
  "session": "chrote-chat",
  "pane": "0",
  "content": "user@host:~$ ls\nfile1.txt  file2.txt\nuser@host:~$ ",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

**Error (404):**
```json
{
  "error": "Session not found"
}
```

**Error (503):**
```json
{
  "error": "CHROTE API not available"
}
```

---

### User Endpoints

#### `GET /api/users`

List all users in the workspace.

**Required Permission:** `manageUsers` (admin+)

**Response:**
```json
{
  "users": [
    {
      "id": "user_owner",
      "name": "Owner",
      "email": "owner@example.com",
      "role": "owner",
      "createdAt": "2026-01-01T00:00:00Z"
    },
    {
      "id": "user_123",
      "name": "Alice",
      "email": "alice@example.com",
      "role": "operator",
      "createdAt": "2026-02-01T00:00:00Z"
    }
  ]
}
```

---

#### `PATCH /api/users/:id/role`

Change a user's role.

**Required Permission:** `manageUsers` (admin+)

**Request Body:**
```json
{
  "role": "operator"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_123",
    "name": "Alice",
    "role": "operator"
  }
}
```

**Error (403) - Invalid role change:**
```json
{
  "error": "FORBIDDEN",
  "message": "Admins cannot modify other admins"
}
```

---

#### `DELETE /api/users/:id`

Remove a user from the workspace.

**Required Permission:** `manageUsers` (admin+)

**Response:**
```json
{
  "success": true
}
```

---

### Invite Endpoints

#### `POST /api/invites`

Create a new invite link.

**Required Permission:** `createInvite` (admin+)

**Request Body:**
```json
{
  "role": "operator",
  "expiresIn": 604800
}
```

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `role` | string | Role to assign: `viewer`, `operator` | `viewer` |
| `expiresIn` | number | Seconds until expiration | `604800` (7 days) |

**Response:**
```json
{
  "id": "inv_abc123",
  "token": "AbCdEfGh12345678",
  "url": "https://example.com/invite/AbCdEfGh12345678",
  "role": "operator",
  "expiresAt": "2026-02-10T00:00:00Z",
  "usedCount": 0
}
```

---

#### `GET /api/invites`

List all invites.

**Required Permission:** `createInvite` (admin+)

**Response:**
```json
{
  "invites": [
    {
      "id": "inv_abc123",
      "role": "operator",
      "createdBy": "user_owner",
      "createdAt": "2026-02-03T00:00:00Z",
      "expiresAt": "2026-02-10T00:00:00Z",
      "usedCount": 2,
      "revoked": false
    }
  ]
}
```

---

#### `DELETE /api/invites/:id`

Revoke an invite.

**Required Permission:** `createInvite` (admin+)

**Response:**
```json
{
  "success": true
}
```

---

#### `GET /api/invites/:token/validate`

Check if an invite token is valid.

**Authentication:** Not required

**Response (valid):**
```json
{
  "valid": true,
  "role": "operator"
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "reason": "expired"
}
```

---

#### `POST /api/invites/:token/accept`

Accept an invite after OAuth login.

**Authentication:** Required (must be logged in)

**Response:**
```json
{
  "success": true,
  "role": "operator"
}
```

---

## WebSocket Protocol

Connect to: `wss://example.com/ws`

### Connection

WebSocket connections require a valid session cookie. The connection is authenticated on upgrade.

```javascript
const ws = new WebSocket('wss://example.com/ws');
```

### Client to Server Messages

#### Subscribe to Session

```json
{
  "type": "subscribe",
  "sessionId": "main"
}
```

#### Unsubscribe from Session

```json
{
  "type": "unsubscribe",
  "sessionId": "main"
}
```

#### Send Keys

**Required:** Operator+ role AND (unclaimed OR own claim)

```json
{
  "type": "sendKeys",
  "sessionId": "main",
  "keys": "ls -la\n"
}
```

#### Claim Session

**Required:** Operator+ role

```json
{
  "type": "claim",
  "sessionId": "main"
}
```

#### Release Claim

**Required:** Own claim OR admin+

```json
{
  "type": "release",
  "sessionId": "main"
}
```

#### Heartbeat

```json
{
  "type": "heartbeat"
}
```

### Server to Client Messages

#### Terminal Output

```json
{
  "type": "output",
  "sessionId": "main",
  "data": "user@host:~$ ls\nfile1.txt\nuser@host:~$ "
}
```

#### Presence Update

```json
{
  "type": "presence",
  "sessionId": "main",
  "users": [
    {"id": "user_123", "name": "Alice", "avatarUrl": "..."},
    {"id": "user_456", "name": "Bob", "avatarUrl": "..."}
  ]
}
```

#### Claim Created

```json
{
  "type": "claimed",
  "sessionId": "main",
  "by": {
    "id": "user_123",
    "name": "Alice"
  },
  "expiresAt": "2026-02-03T12:30:00Z"
}
```

#### Claim Released

```json
{
  "type": "released",
  "sessionId": "main"
}
```

#### Session List Update

```json
{
  "type": "sessions",
  "sessions": [
    {"id": "main", "name": "main", "windows": 3, "claim": null},
    {"id": "dev", "name": "dev", "windows": 1, "claim": {...}}
  ]
}
```

#### Error

```json
{
  "type": "error",
  "code": "FORBIDDEN",
  "message": "Viewers cannot send keys"
}
```

---

## Per-Session WebSocket

Connect to: `wss://example.com/ws/terminal/:sessionId`

A simplified WebSocket endpoint for direct terminal connections. Unlike the main WebSocket which requires explicit subscribe/unsubscribe, this endpoint automatically subscribes to a single session and streams only that session's output.

### Connection

```javascript
// Connect to a specific session
const ws = new WebSocket('wss://example.com/ws/terminal/chrote-chat');

// Optionally specify pane
const ws = new WebSocket('wss://example.com/ws/terminal/chrote-chat?pane=1');
```

**Authentication:** Requires valid session cookie (same as main WebSocket).

**On Connect:**
- Server validates session exists (returns 4004 if not found)
- Server authenticates user (returns 4001 if not authenticated)
- Server automatically subscribes to the session
- Server sends `connected` message with session info
- Server sends initial terminal output

### Client to Server Messages

#### Send Keys

**Required:** Operator+ role AND own claim on the session

```json
{
  "type": "sendKeys",
  "keys": "ls -la\n",
  "pane": "0"
}
```

#### Heartbeat

```json
{
  "type": "heartbeat"
}
```

### Server to Client Messages

#### Connected

Sent immediately after successful connection.

```json
{
  "type": "connected",
  "sessionId": "chrote-chat",
  "userId": "user_123",
  "role": "operator"
}
```

#### Terminal Output

```json
{
  "type": "output",
  "sessionId": "chrote-chat",
  "pane": "0",
  "data": "user@host:~$ ls\nfile1.txt\nuser@host:~$ ",
  "timestamp": "2026-02-03T12:00:00.000Z"
}
```

#### Error

```json
{
  "type": "error",
  "code": "NOT_CLAIMED",
  "message": "You must claim the session before sending keys"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | Session does not exist |
| `NOT_OPERATOR` | Only operators can send keys |
| `NOT_CLAIMED` | Must claim session before sending keys |
| `TMUX_ERROR` | Error sending keys to tmux |
| `INVALID_MESSAGE` | Invalid JSON message |
| `UNKNOWN_TYPE` | Unknown message type |

### Close Codes

| Code | Meaning |
|------|---------|
| `4001` | Authentication required |
| `4004` | Session not found |
| `4000` | Heartbeat timeout |
| `1001` | Server shutting down |

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid input |
| `401` | Unauthorized - Not logged in |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found |
| `500` | Internal Server Error |

### Error Response Format

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": {}
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid input data |
| `CLAIM_REQUIRED` | Session claimed by another user |
| `ALREADY_CLAIMED` | Session already claimed |
| `INVALID_TOKEN` | Invite token invalid or expired |
