# CHROTE Multiplayer

Collaborative multi-user terminal sharing environment for CHROTE personal clouds. Share tmux sessions in real-time with role-based access control.

## Features

- **Real-time Terminal Sharing** - Stream tmux sessions to multiple viewers via WebSocket
- **Role-Based Access Control** - 4-tier permission system (Owner, Admin, Operator, Viewer)
- **Session Claiming** - Exclusive control with automatic timeout and manual release
- **OAuth Authentication** - GitHub and Google login via Arctic
- **Invite System** - Secure invite links with configurable roles

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- tmux installed and running
- GitHub/Google OAuth app credentials (optional, for production)

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/chrote-multiplayer.git
cd chrote-multiplayer

# Install dependencies
bun install

# Copy environment config
cp .env.example .env

# Initialize database
bun run db:migrate
bun run db:seed

# Start development server
bun run dev
```

Open http://localhost:3000

### With Docker

```bash
# Development with hot reload
docker compose up dev

# Production
docker compose up app -d
```

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Browser                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   React + xterm.js                       │   │
│  └───────────────────────────┬─────────────────────────────┘   │
└──────────────────────────────┼─────────────────────────────────┘
                               │ WebSocket
┌──────────────────────────────┼─────────────────────────────────┐
│                         Server                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   Hono (HTTP + WebSocket)                                │  │
│  │   ├── Auth (OAuth + Sessions)                            │  │
│  │   ├── Permissions (RBAC middleware)                      │  │
│  │   └── WebSocket Handler (terminal streaming)             │  │
│  └────────────────────────────┬─────────────────────────────┘  │
│                               │                                 │
│  ┌────────────────────────────┴─────────────────────────────┐  │
│  │   Tmux Bridge                                            │  │
│  │   ├── Session discovery                                  │  │
│  │   ├── Pane output capture (5 FPS)                        │  │
│  │   └── Key input forwarding                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   SQLite + Drizzle ORM                                   │  │
│  │   users, invites, sessions, claims, presence, audit_log  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                          ┌────────┐
                          │  tmux  │
                          └────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Server | Hono |
| Database | SQLite + Drizzle ORM |
| Frontend | React + xterm.js |
| Auth | Arctic (OAuth 2.0) |
| Terminal | tmux bridge |
| Testing | Vitest + Playwright |

## Project Structure

```
chrote-multiplayer/
├── src/
│   ├── server/
│   │   ├── index.ts        # Server entry point
│   │   └── tmux/           # Tmux bridge implementation
│   ├── routes/             # API route handlers
│   ├── lib/                # Shared utilities
│   │   ├── oauth.ts        # OAuth configuration
│   │   └── session.ts      # Session management
│   ├── db/
│   │   ├── schema.ts       # Drizzle schema
│   │   └── index.ts        # Database connection
│   └── permissions/        # RBAC implementation
├── ui/                     # React frontend
├── tests/
│   ├── unit/               # Vitest unit tests
│   └── e2e/                # Playwright E2E tests
├── db/
│   ├── migrations/         # Drizzle migrations
│   └── seed.ts             # Development seed data
├── docs/
│   ├── PERMISSIONS.md      # Permission system docs
│   ├── API.md              # API reference
│   └── DEPLOYMENT.md       # Deployment guide
└── docker-compose.yml
```

## Documentation

- [API Reference](docs/API.md) - REST and WebSocket API documentation
- [Permission System](docs/PERMISSIONS.md) - Role-based access control
- [Deployment Guide](docs/DEPLOYMENT.md) - Docker and VPS deployment
- [Environment Variables](docs/ENVIRONMENT.md) - Configuration reference

## Roles and Permissions

| Role | Can View | Send Keys | Manage Users | Delete Workspace |
|------|:--------:|:---------:|:------------:|:----------------:|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | ✗ |
| Operator | ✓ | ✓ | ✗ | ✗ |
| Viewer | ✓ | ✗ | ✗ | ✗ |

See [PERMISSIONS.md](docs/PERMISSIONS.md) for the complete permission matrix.

## Development

```bash
# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Run E2E tests
bun test:e2e

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format

# Database studio
bun run db:studio
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start server with hot reload |
| `bun run dev:ui` | Start Vite dev server for UI |
| `bun run build` | Build server for production |
| `bun run build:ui` | Build UI for production |
| `bun test` | Run unit tests |
| `bun test:e2e` | Run Playwright E2E tests |
| `bun run db:migrate` | Run database migrations |
| `bun run db:seed` | Seed development data |
| `bun run db:reset` | Reset and reseed database |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT
