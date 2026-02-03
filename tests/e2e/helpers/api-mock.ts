/**
 * API mock utilities for E2E tests.
 *
 * Provides helpers for mocking REST API responses.
 */

import { type Page, type Route } from '@playwright/test';

export interface MockSession {
  id: string;
  name: string;
  createdAt: string;
  claimedBy?: string;
  claimExpiresAt?: string;
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  avatar?: string;
}

export interface MockInvite {
  id: string;
  token: string;
  role: 'admin' | 'operator' | 'viewer';
  usageCount: number;
  createdAt: string;
  createdBy: string;
  expiresAt?: string;
  revoked: boolean;
}

// Default mock data
export const mockSessions: MockSession[] = [
  {
    id: 'session-1',
    name: 'dev-server',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'session-2',
    name: 'build-runner',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'session-3',
    name: 'logs',
    createdAt: new Date().toISOString(),
    claimedBy: 'other-operator',
    claimExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  },
];

export const mockUsers: MockUser[] = [
  {
    id: 'user-owner',
    name: 'Workspace Owner',
    email: 'owner@example.com',
    role: 'owner',
    avatar: 'https://github.com/owner.png',
  },
  {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    avatar: 'https://github.com/admin.png',
  },
  {
    id: 'user-operator',
    name: 'Operator User',
    email: 'operator@example.com',
    role: 'operator',
    avatar: 'https://github.com/operator.png',
  },
  {
    id: 'user-viewer',
    name: 'Viewer User',
    email: 'viewer@example.com',
    role: 'viewer',
    avatar: 'https://github.com/viewer.png',
  },
];

export const mockInvites: MockInvite[] = [
  {
    id: 'invite-1',
    token: 'abc123xyz789',
    role: 'operator',
    usageCount: 2,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'user-admin',
    revoked: false,
  },
  {
    id: 'invite-2',
    token: 'def456uvw012',
    role: 'viewer',
    usageCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'user-admin',
    revoked: false,
  },
];

/**
 * Set up complete API mocking for E2E tests.
 */
export async function setupApiMocks(
  page: Page,
  options: {
    currentUser?: MockUser;
    sessions?: MockSession[];
    users?: MockUser[];
    invites?: MockInvite[];
  } = {}
): Promise<void> {
  const {
    currentUser = mockUsers[2], // Default to operator
    sessions = mockSessions,
    users = mockUsers,
    invites = mockInvites,
  } = options;

  // Health endpoint
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', version: '0.1.0' }),
    });
  });

  // Auth endpoints
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentUser),
    });
  });

  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      },
    });
  });

  // Sessions endpoints
  await page.route('**/api/sessions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessions),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const newSession: MockSession = {
        id: `session-${Date.now()}`,
        name: body.name,
        createdAt: new Date().toISOString(),
      };
      sessions.push(newSession);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newSession),
      });
    }
  });

  await page.route('**/api/sessions/*/claim', async (route) => {
    const sessionId = route.request().url().split('/sessions/')[1].split('/')[0];
    const session = sessions.find((s) => s.id === sessionId);

    if (route.request().method() === 'POST') {
      if (session) {
        session.claimedBy = currentUser.id;
        session.claimExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId,
          claimedBy: currentUser.id,
          expiresAt: session?.claimExpiresAt,
        }),
      });
    } else if (route.request().method() === 'DELETE') {
      if (session) {
        delete session.claimedBy;
        delete session.claimExpiresAt;
      }
      await route.fulfill({ status: 200 });
    }
  });

  await page.route('**/api/sessions/*/send-keys', async (route) => {
    const sessionId = route.request().url().split('/sessions/')[1].split('/')[0];
    const session = sessions.find((s) => s.id === sessionId);

    if (session?.claimedBy !== currentUser.id) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session not claimed by you' }),
      });
    } else {
      await route.fulfill({ status: 200 });
    }
  });

  // Users endpoints
  await page.route('**/api/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(users),
    });
  });

  await page.route('**/api/users/*/role', async (route) => {
    const userId = route.request().url().split('/users/')[1].split('/')[0];
    const body = route.request().postDataJSON();
    const user = users.find((u) => u.id === userId);

    if (user) {
      user.role = body.role;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  await page.route('**/api/users/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      const userId = route.request().url().split('/users/')[1];
      const idx = users.findIndex((u) => u.id === userId);
      if (idx !== -1) {
        users.splice(idx, 1);
      }
      await route.fulfill({ status: 200 });
    }
  });

  // Invites endpoints
  await page.route('**/api/invites', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(invites.filter((i) => !i.revoked)),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const newInvite: MockInvite = {
        id: `invite-${Date.now()}`,
        token: Math.random().toString(36).substring(2, 18),
        role: body.role,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.id,
        revoked: false,
      };
      invites.push(newInvite);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newInvite),
      });
    }
  });

  await page.route('**/api/invites/*/validate', async (route) => {
    const token = route.request().url().split('/invites/')[1].split('/')[0];
    const invite = invites.find((i) => i.token === token && !i.revoked);

    if (invite) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true, role: invite.role }),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid invite' }),
      });
    }
  });

  await page.route('**/api/invites/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      const inviteId = route.request().url().split('/invites/')[1];
      const invite = invites.find((i) => i.id === inviteId);
      if (invite) {
        invite.revoked = true;
      }
      await route.fulfill({ status: 200 });
    }
  });
}

/**
 * Mock a specific API endpoint with custom handler.
 */
export async function mockApiEndpoint(
  page: Page,
  pattern: string,
  handler: (route: Route) => Promise<void>
): Promise<void> {
  await page.route(pattern, handler);
}

/**
 * Mock API to return error for specific endpoint.
 */
export async function mockApiError(
  page: Page,
  pattern: string,
  status: number,
  message: string
): Promise<void> {
  await page.route(pattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    });
  });
}
