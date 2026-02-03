/**
 * E2E tests for OAuth authentication flow.
 *
 * Tests GitHub OAuth login, session persistence, and logout.
 */

import { test, expect } from './fixtures';

test.describe('OAuth Login Flow', () => {
  test('shows login page for unauthenticated users', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();

    await page.goto('/');

    // Should show login options
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('redirects to GitHub OAuth on login button click', async ({ page }) => {
    await page.context().clearCookies();

    // Intercept OAuth redirect
    let oauthUrl = '';
    await page.route('**/api/auth/github', async (route) => {
      oauthUrl = route.request().url();
      await route.abort(); // Don't actually redirect
    });

    await page.goto('/');
    await page.getByRole('button', { name: /github/i }).click();

    // Should have attempted OAuth redirect
    expect(oauthUrl).toContain('/api/auth/github');
  });

  test('handles OAuth callback and creates session', async ({ page, mockOAuth, testUsers }) => {
    await page.context().clearCookies();
    await mockOAuth(testUsers.admin);

    // Simulate OAuth callback
    await page.goto('/api/auth/github/callback?code=mock-code');

    // Should redirect to app
    await page.waitForURL('/');

    // Should show authenticated UI
    await expect(page.getByTestId('user-avatar')).toBeVisible();
    await expect(page.getByText(testUsers.admin.name)).toBeVisible();
  });

  test('persists session across page refresh', async ({ adminPage }) => {
    await adminPage.goto('/');

    // Should be authenticated
    await expect(adminPage.getByTestId('user-avatar')).toBeVisible();

    // Refresh page
    await adminPage.reload();

    // Should still be authenticated
    await expect(adminPage.getByTestId('user-avatar')).toBeVisible();
  });

  test('logout clears session and redirects to login', async ({ adminPage }) => {
    await adminPage.goto('/');

    // Click logout
    await adminPage.getByRole('button', { name: /logout|sign out/i }).click();

    // Should redirect to login
    await expect(adminPage.getByRole('heading', { name: /login|sign in/i })).toBeVisible();

    // Session cookie should be cleared
    const cookies = await adminPage.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === 'session');
    expect(sessionCookie).toBeUndefined();
  });

  test('handles OAuth error gracefully', async ({ page }) => {
    await page.context().clearCookies();

    // Simulate OAuth error
    await page.route('**/api/auth/github/callback**', async (route) => {
      await route.fulfill({
        status: 302,
        headers: { 'Location': '/login?error=access_denied' },
      });
    });

    await page.goto('/api/auth/github/callback?error=access_denied');

    // Should show error message
    await expect(page.getByText(/access denied|error|failed/i)).toBeVisible();
  });
});

test.describe('Session Validation', () => {
  test('rejects invalid session cookie', async ({ page }) => {
    // Set invalid session cookie
    await page.context().addCookies([
      {
        name: 'session',
        value: 'invalid-session-id',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/');

    // Should redirect to login
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
  });

  test('rejects expired session', async ({ page }) => {
    // Set expired session cookie
    await page.context().addCookies([
      {
        name: 'session',
        value: 'expired-session-id',
        domain: 'localhost',
        path: '/',
        expires: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      },
    ]);

    await page.goto('/');

    // Should redirect to login
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
  });
});
