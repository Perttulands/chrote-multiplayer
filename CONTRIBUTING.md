# Contributing to CHROTE Multiplayer

Thank you for your interest in contributing to CHROTE Multiplayer.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- tmux
- Git

### Getting Started

```bash
# Fork and clone
git clone https://github.com/yourusername/chrote-multiplayer.git
cd chrote-multiplayer

# Install dependencies
bun install

# Setup environment
cp .env.example .env

# Initialize database
bun run db:migrate
bun run db:seed

# Start development server
bun run dev
```

### Running Tests

```bash
# Unit tests
bun test

# Watch mode
bun test:watch

# E2E tests (requires Playwright)
bun test:e2e

# Type check
bun run typecheck

# Lint
bun run lint
```

## Code Style

### Formatting

We use Prettier for code formatting:

```bash
# Format all files
bun run format

# Check formatting
bun run format:check
```

### Linting

We use ESLint for code quality:

```bash
# Lint
bun run lint

# Lint and fix
bun run lint:fix
```

### TypeScript

All code must be properly typed. Run type checking:

```bash
bun run typecheck
```

## Project Structure

```
src/
├── server/           # Server-side code
│   ├── index.ts      # Entry point
│   └── tmux/         # Tmux bridge
├── routes/           # API route handlers
├── lib/              # Shared utilities
├── db/               # Database schema and connection
└── permissions/      # RBAC implementation

ui/                   # React frontend

tests/
├── unit/             # Vitest unit tests
└── e2e/              # Playwright E2E tests
```

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring

### Commit Messages

Follow conventional commits:

```
type(scope): description

feat(auth): add Google OAuth support
fix(ws): handle reconnection properly
docs(api): add WebSocket protocol docs
refactor(db): extract query helpers
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Write/update tests
4. Ensure all tests pass
5. Update documentation if needed
6. Submit PR with clear description

### PR Checklist

- [ ] Tests pass (`bun test`)
- [ ] Types check (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow convention

## Testing Guidelines

### Unit Tests

Located in `tests/unit/`. Use Vitest:

```typescript
import { describe, it, expect } from 'vitest';
import { canSendKeys } from '../../src/permissions';

describe('canSendKeys', () => {
  it('returns true for operator', () => {
    expect(canSendKeys('operator')).toBe(true);
  });

  it('returns false for viewer', () => {
    expect(canSendKeys('viewer')).toBe(false);
  });
});
```

### E2E Tests

Located in `tests/e2e/`. Use Playwright:

```typescript
import { test, expect } from '@playwright/test';

test('user can view sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="session-list"]')).toBeVisible();
});
```

## Database Changes

### Adding Migrations

```bash
# Generate migration after schema changes
bun run db:generate

# Apply migrations
bun run db:migrate
```

### Schema Changes

Edit `src/db/schema.ts` and generate a migration.

## Documentation

- API changes: Update `docs/API.md`
- Permission changes: Update `docs/PERMISSIONS.md`
- Environment changes: Update `docs/ENVIRONMENT.md`
- Deployment changes: Update `docs/DEPLOYMENT.md`

## Questions?

Open an issue for questions or discussions.
