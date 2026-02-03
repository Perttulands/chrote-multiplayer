/**
 * Authentication setup for E2E tests.
 *
 * Creates authenticated state files for different user roles
 * that can be reused across test runs.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const STORAGE_DIR = path.join(__dirname, '.auth');

// Test user credentials for mock OAuth
const TEST_USERS = {
  owner: {
    id: 'test-owner-001',
    name: 'Test Owner',
    email: 'owner@test.local',
    role: 'owner',
  },
  admin: {
    id: 'test-admin-001',
    name: 'Test Admin',
    email: 'admin@test.local',
    role: 'admin',
  },
  operator: {
    id: 'test-operator-001',
    name: 'Test Operator',
    email: 'operator@test.local',
    role: 'operator',
  },
  viewer: {
    id: 'test-viewer-001',
    name: 'Test Viewer',
    email: 'viewer@test.local',
    role: 'viewer',
  },
};

setup('authenticate as owner', async ({ page }) => {
  const user = TEST_USERS.owner;

  // Mock the OAuth flow
  await page.route('**/api/auth/github', async (route) => {
    await route.fulfill({
      status: 302,
      headers: { 'Location': `/api/auth/github/callback?code=mock-code-${user.id}` },
    });
  });

  await page.route('**/api/auth/github/callback**', async (route) => {
    await route.fulfill({
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `session=${user.id}; Path=/; HttpOnly; SameSite=Lax`,
      },
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  // Navigate and trigger auth
  await page.goto('/');

  // Set auth cookie directly
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

  // Save storage state
  await page.context().storageState({ path: path.join(STORAGE_DIR, 'owner.json') });
});

setup('authenticate as admin', async ({ page }) => {
  const user = TEST_USERS.admin;

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

  await page.context().storageState({ path: path.join(STORAGE_DIR, 'admin.json') });
});

setup('authenticate as operator', async ({ page }) => {
  const user = TEST_USERS.operator;

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

  await page.context().storageState({ path: path.join(STORAGE_DIR, 'operator.json') });
});

setup('authenticate as viewer', async ({ page }) => {
  const user = TEST_USERS.viewer;

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

  await page.context().storageState({ path: path.join(STORAGE_DIR, 'viewer.json') });
});
