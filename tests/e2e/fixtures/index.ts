/**
 * Custom Playwright fixtures for chrote-multiplayer E2E tests.
 *
 * Provides authenticated users, mock OAuth, WebSocket helpers, and test utilities.
 */

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';

// User roles
export type UserRole = 'owner' | 'admin' | 'operator' | 'viewer';

// Test user type
export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

// Invite type
export interface TestInvite {
  id: string;
  token: string;
  role: UserRole;
  createdBy: string;
  expiresAt?: Date;
}

// Session type (tmux session)
export interface TestSession {
  id: string;
  name: string;
  createdAt: Date;
  claimedBy?: string;
  claimExpiresAt?: Date;
}

// Custom fixtures
type Fixtures = {
  // Authenticated user contexts
  ownerPage: Page;
  adminPage: Page;
  operatorPage: Page;
  viewerPage: Page;

  // Test data factories
  testUsers: {
    owner: TestUser;
    admin: TestUser;
    operator: TestUser;
    viewer: TestUser;
  };

  // Helper methods
  createInvite: (role: UserRole) => Promise<TestInvite>;
  createSession: (name: string) => Promise<TestSession>;
  mockOAuth: (user: TestUser) => Promise<void>;
  waitForWebSocket: (page: Page) => Promise<void>;
  getTerminalOutput: (page: Page, sessionId: string) => Promise<string>;
};

// Mock OAuth flow helper
async function setupMockOAuth(page: Page, user: TestUser): Promise<void> {
  // Intercept OAuth redirect and simulate successful login
  await page.route('**/api/auth/github/callback**', async (route) => {
    // Simulate OAuth callback with mock code
    await route.fulfill({
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `session=${user.id}; Path=/; HttpOnly; SameSite=Lax`,
      },
    });
  });

  // Mock user info endpoint
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

// Create authenticated browser context
async function createAuthenticatedContext(
  browser: BrowserContext,
  user: TestUser
): Promise<Page> {
  const page = await browser.newPage();

  // Set up auth cookie
  await page.context().addCookies([
    {
      name: 'session',
      value: user.id,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  await setupMockOAuth(page, user);

  return page;
}

// Test users for different roles
const testUsers: Fixtures['testUsers'] = {
  owner: {
    id: 'test-owner-001',
    name: 'Test Owner',
    email: 'owner@test.local',
    role: 'owner',
    avatar: 'https://github.com/identicons/owner.png',
  },
  admin: {
    id: 'test-admin-001',
    name: 'Test Admin',
    email: 'admin@test.local',
    role: 'admin',
    avatar: 'https://github.com/identicons/admin.png',
  },
  operator: {
    id: 'test-operator-001',
    name: 'Test Operator',
    email: 'operator@test.local',
    role: 'operator',
    avatar: 'https://github.com/identicons/operator.png',
  },
  viewer: {
    id: 'test-viewer-001',
    name: 'Test Viewer',
    email: 'viewer@test.local',
    role: 'viewer',
    avatar: 'https://github.com/identicons/viewer.png',
  },
};

// Extend base test with fixtures
export const test = base.extend<Fixtures>({
  testUsers: async ({}, use) => {
    await use(testUsers);
  },

  ownerPage: async ({ context }, use) => {
    const page = await createAuthenticatedContext(context, testUsers.owner);
    await use(page);
    await page.close();
  },

  adminPage: async ({ context }, use) => {
    const page = await createAuthenticatedContext(context, testUsers.admin);
    await use(page);
    await page.close();
  },

  operatorPage: async ({ context }, use) => {
    const page = await createAuthenticatedContext(context, testUsers.operator);
    await use(page);
    await page.close();
  },

  viewerPage: async ({ context }, use) => {
    const page = await createAuthenticatedContext(context, testUsers.viewer);
    await use(page);
    await page.close();
  },

  createInvite: async ({ request }, use) => {
    const createdInvites: TestInvite[] = [];

    const factory = async (role: UserRole): Promise<TestInvite> => {
      const response = await request.post('/api/invites', {
        data: { role },
        headers: {
          Cookie: `session=${testUsers.admin.id}`,
        },
      });

      expect(response.ok()).toBeTruthy();
      const invite = await response.json();
      createdInvites.push(invite);
      return invite;
    };

    await use(factory);

    // Cleanup: revoke created invites
    for (const invite of createdInvites) {
      await request.delete(`/api/invites/${invite.id}`, {
        headers: {
          Cookie: `session=${testUsers.admin.id}`,
        },
      }).catch(() => {});
    }
  },

  createSession: async ({ request }, use) => {
    const createdSessions: TestSession[] = [];

    const factory = async (name: string): Promise<TestSession> => {
      const response = await request.post('/api/sessions', {
        data: { name },
        headers: {
          Cookie: `session=${testUsers.operator.id}`,
        },
      });

      expect(response.ok()).toBeTruthy();
      const session = await response.json();
      createdSessions.push(session);
      return session;
    };

    await use(factory);

    // Cleanup happens automatically via test db reset
  },

  mockOAuth: async ({ page }, use) => {
    const fn = async (user: TestUser) => {
      await setupMockOAuth(page, user);
    };
    await use(fn);
  },

  waitForWebSocket: async ({}, use) => {
    const fn = async (page: Page) => {
      await page.waitForFunction(() => {
        const ws = (window as any).__ws;
        return ws && ws.readyState === WebSocket.OPEN;
      }, { timeout: 10000 });
    };
    await use(fn);
  },

  getTerminalOutput: async ({}, use) => {
    const fn = async (page: Page, sessionId: string): Promise<string> => {
      return await page.evaluate((sid) => {
        const terminal = document.querySelector(`[data-session-id="${sid}"] .xterm-screen`);
        return terminal?.textContent || '';
      }, sessionId);
    };
    await use(fn);
  },
});

export { expect };
