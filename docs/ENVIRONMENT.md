# Environment Variables

Configuration reference for CHROTE Multiplayer.

## Required Variables

### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment: `development`, `production`, `test` | `development` |
| `SESSION_SECRET` | Secret for signing session cookies. **Must be changed in production.** | `change-me-in-production` |

### Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_PATH` | Path to SQLite database file | `./data/chrote.db` |

### Tmux

| Variable | Description | Default |
|----------|-------------|---------|
| `TMUX_SOCKET_DIR` | Directory for tmux socket files | `/tmp/chrote-tmux` |

## OAuth Configuration

OAuth is optional for local development but required for production.

### GitHub OAuth

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | Production |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | Production |

**Setup:**
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL to `http://localhost:3000/auth/github/callback` (dev) or your production URL

### Google OAuth

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Production |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Production |

**Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`

## Example Configurations

### Development (`.env`)

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./data/chrote.db

# OAuth (optional for local dev)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Session
SESSION_SECRET=dev-secret-change-in-prod

# Tmux
TMUX_SOCKET_DIR=/tmp/chrote-tmux
```

### Production (`.env.production`)

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_PATH=/var/lib/chrote/chrote.db

# OAuth (required)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Session (use a strong random value)
SESSION_SECRET=generated-32-char-random-string

# Tmux
TMUX_SOCKET_DIR=/var/run/chrote-tmux
```

### Docker (via docker-compose.yml)

Environment variables can be passed via:

1. `.env` file in project root (auto-loaded)
2. Environment variables in shell
3. Inline in `docker-compose.yml`

```yaml
services:
  app:
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/chrote.db
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
```

## Generating Secrets

### Session Secret

Generate a secure random string for `SESSION_SECRET`:

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using Bun
bun -e "console.log(crypto.getRandomValues(new Uint8Array(32)).reduce((a,b)=>a+b.toString(16).padStart(2,'0'),''))"
```

## Environment Variable Loading

Variables are loaded in this order (later sources override earlier):

1. System environment variables
2. `.env` file in project root
3. `.env.local` file (git-ignored, for local overrides)
4. `.env.{NODE_ENV}` file (e.g., `.env.production`)

## Validation

The application validates required environment variables on startup. Missing required variables will cause the server to exit with an error message.

```typescript
// Example validation in src/config.ts
if (process.env.NODE_ENV === 'production') {
  if (!process.env.GITHUB_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) {
    throw new Error('At least one OAuth provider must be configured in production');
  }
  if (process.env.SESSION_SECRET === 'change-me-in-production') {
    throw new Error('SESSION_SECRET must be changed in production');
  }
}
```
