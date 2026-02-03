/**
 * E2E tests for invite system.
 *
 * Tests create invite → share → new user joins flow.
 */

import { test, expect, type TestUser } from './fixtures';

test.describe('Invite Creation', () => {
  test('admin can create invite link', async ({ adminPage }) => {
    await adminPage.goto('/settings/invites');

    // Click create invite button
    await adminPage.getByRole('button', { name: /create invite/i }).click();

    // Select role
    await adminPage.getByLabel(/role/i).selectOption('operator');

    // Submit
    await adminPage.getByRole('button', { name: /create|generate/i }).click();

    // Should show invite link
    await expect(adminPage.getByTestId('invite-link')).toBeVisible();

    // Link should be copyable
    const inviteLink = await adminPage.getByTestId('invite-link').inputValue();
    expect(inviteLink).toMatch(/\/invite\/[a-zA-Z0-9_-]+$/);
  });

  test('admin can create viewer invite', async ({ adminPage }) => {
    await adminPage.goto('/settings/invites');

    await adminPage.getByRole('button', { name: /create invite/i }).click();
    await adminPage.getByLabel(/role/i).selectOption('viewer');
    await adminPage.getByRole('button', { name: /create|generate/i }).click();

    await expect(adminPage.getByTestId('invite-link')).toBeVisible();
  });

  test('operator cannot create invites', async ({ operatorPage }) => {
    await operatorPage.goto('/settings/invites');

    // Should not have access or button should be disabled
    const createButton = operatorPage.getByRole('button', { name: /create invite/i });
    await expect(createButton).toBeHidden().catch(() =>
      expect(createButton).toBeDisabled()
    );
  });

  test('viewer cannot access invite settings', async ({ viewerPage }) => {
    await viewerPage.goto('/settings/invites');

    // Should redirect or show access denied
    await expect(viewerPage.getByText(/access denied|not authorized/i)).toBeVisible()
      .catch(() => expect(viewerPage).toHaveURL('/'));
  });
});

test.describe('Invite Acceptance', () => {
  test('new user can join via invite link', async ({ page, adminPage, createInvite }) => {
    // Admin creates invite
    await adminPage.goto('/settings/invites');
    await adminPage.getByRole('button', { name: /create invite/i }).click();
    await adminPage.getByLabel(/role/i).selectOption('operator');
    await adminPage.getByRole('button', { name: /create|generate/i }).click();

    const inviteLink = await adminPage.getByTestId('invite-link').inputValue();
    const inviteToken = inviteLink.split('/invite/')[1];

    // New user clicks invite link (not logged in)
    await page.context().clearCookies();
    await page.goto(inviteLink);

    // Should show invite acceptance page
    await expect(page.getByText(/join|accept invite/i)).toBeVisible();
    await expect(page.getByText(/operator/i)).toBeVisible(); // Shows role they'll get

    // User clicks login with GitHub
    const newUser: TestUser = {
      id: 'new-user-via-invite',
      name: 'New User',
      email: 'newuser@test.local',
      role: 'operator', // Will be assigned from invite
    };

    // Mock OAuth for new user
    await page.route('**/api/auth/github/callback**', async (route) => {
      await route.fulfill({
        status: 302,
        headers: {
          'Location': `/?invite=${inviteToken}`,
          'Set-Cookie': `session=${newUser.id}; Path=/; HttpOnly; SameSite=Lax`,
        },
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(newUser),
      });
    });

    await page.getByRole('button', { name: /github/i }).click();

    // Wait for redirect after OAuth
    await page.waitForURL('/');

    // Should be logged in with operator role
    await expect(page.getByTestId('user-avatar')).toBeVisible();
    await expect(page.getByText(newUser.name)).toBeVisible();
  });

  test('invalid invite token shows error', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/invite/invalid-token-12345');

    // Should show error
    await expect(page.getByText(/invalid|expired|not found/i)).toBeVisible();
  });

  test('expired invite shows error', async ({ page, adminPage }) => {
    // Create invite via API with past expiration (mock)
    await page.route('**/api/invites/*/validate', async (route) => {
      await route.fulfill({
        status: 410, // Gone
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invite expired' }),
      });
    });

    await page.context().clearCookies();
    await page.goto('/invite/expired-invite-token');

    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test('revoked invite shows error', async ({ page }) => {
    await page.route('**/api/invites/*/validate', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invite not found' }),
      });
    });

    await page.context().clearCookies();
    await page.goto('/invite/revoked-invite-token');

    await expect(page.getByText(/invalid|not found|revoked/i)).toBeVisible();
  });
});

test.describe('Invite Management', () => {
  test('admin can view list of invites', async ({ adminPage }) => {
    await adminPage.goto('/settings/invites');

    // Should show invites table/list
    await expect(adminPage.getByTestId('invites-list')).toBeVisible();
  });

  test('admin can revoke invite', async ({ adminPage }) => {
    await adminPage.goto('/settings/invites');

    // Create an invite first
    await adminPage.getByRole('button', { name: /create invite/i }).click();
    await adminPage.getByLabel(/role/i).selectOption('viewer');
    await adminPage.getByRole('button', { name: /create|generate/i }).click();
    await adminPage.keyboard.press('Escape'); // Close modal

    // Find and revoke the invite
    const inviteRow = adminPage.getByTestId('invite-row').first();
    await inviteRow.getByRole('button', { name: /revoke|delete/i }).click();

    // Confirm revocation
    await adminPage.getByRole('button', { name: /confirm|yes/i }).click();

    // Invite should be removed or marked as revoked
    await expect(inviteRow).toBeHidden();
  });

  test('invite shows usage count', async ({ adminPage }) => {
    await adminPage.goto('/settings/invites');

    // Invites should show how many times they've been used
    const usageCount = adminPage.getByTestId('invite-usage-count').first();
    await expect(usageCount).toBeVisible();
    await expect(usageCount).toHaveText(/\d+/);
  });
});

test.describe('Copy Invite Link', () => {
  test('can copy invite link to clipboard', async ({ adminPage, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await adminPage.goto('/settings/invites');

    // Create invite
    await adminPage.getByRole('button', { name: /create invite/i }).click();
    await adminPage.getByLabel(/role/i).selectOption('viewer');
    await adminPage.getByRole('button', { name: /create|generate/i }).click();

    // Click copy button
    await adminPage.getByRole('button', { name: /copy/i }).click();

    // Should show copied confirmation
    await expect(adminPage.getByText(/copied/i)).toBeVisible();

    // Verify clipboard content
    const clipboardText = await adminPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/\/invite\/[a-zA-Z0-9_-]+$/);
  });
});
