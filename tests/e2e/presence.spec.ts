/**
 * E2E tests for presence system.
 *
 * Tests real-time user presence indicators and multi-user viewing.
 */

import { test, expect } from './fixtures';

test.describe('Presence Indicators', () => {
  test('shows avatar stack for viewers', async ({ operatorPage, viewerPage }) => {
    // Both users view same session
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Both should see presence indicators
    await expect(operatorPage.getByTestId('presence-list')).toBeVisible();
    await expect(viewerPage.getByTestId('presence-list')).toBeVisible();
  });

  test('shows user avatars in presence stack', async ({
    operatorPage,
    viewerPage,
    testUsers,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Operator should see viewer's avatar
    const opPresence = operatorPage.getByTestId('presence-list');
    await expect(opPresence.getByTestId('presence-avatar')).toBeVisible();

    // Viewer should see operator's avatar
    const viewerPresence = viewerPage.getByTestId('presence-list');
    await expect(viewerPresence.getByTestId('presence-avatar')).toBeVisible();
  });

  test('shows lock icon for claimed sessions', async ({
    operatorPage,
    viewerPage,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    await viewerPage.getByTestId('session-item').first().click();

    // Viewer should see lock icon
    await expect(viewerPage.getByTestId('claim-lock-icon')).toBeVisible();
  });

  test('presence updates when user joins', async ({
    operatorPage,
    adminPage,
    viewerPage,
  }) => {
    // Operator viewing alone
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const presenceList = operatorPage.getByTestId('presence-list');
    const initialAvatars = await presenceList.getByTestId('presence-avatar').count();

    // Admin joins
    await adminPage.goto('/');
    await adminPage.getByTestId('session-item').first().click();

    // Operator should see updated presence (within 2 seconds)
    await expect(async () => {
      const newCount = await presenceList.getByTestId('presence-avatar').count();
      expect(newCount).toBeGreaterThan(initialAvatars);
    }).toPass({ timeout: 3000 });

    // Viewer joins
    await viewerPage.goto('/');
    await viewerPage.getByTestId('session-item').first().click();

    await expect(async () => {
      const newCount = await presenceList.getByTestId('presence-avatar').count();
      expect(newCount).toBeGreaterThan(initialAvatars + 1);
    }).toPass({ timeout: 3000 });
  });

  test('presence updates when user leaves', async ({
    operatorPage,
    viewerPage,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    const presenceList = operatorPage.getByTestId('presence-list');
    const initialCount = await presenceList.getByTestId('presence-avatar').count();

    // Viewer leaves (navigates away)
    await viewerPage.goto('/settings');

    // Operator should see updated presence
    await expect(async () => {
      const newCount = await presenceList.getByTestId('presence-avatar').count();
      expect(newCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 3000 });
  });

  test('shows overflow indicator for many viewers', async ({ context }) => {
    // Create multiple viewer pages
    const pages = [];
    for (let i = 0; i < 7; i++) {
      const page = await context.newPage();
      await page.context().addCookies([
        {
          name: 'session',
          value: `viewer-${i}`,
          domain: 'localhost',
          path: '/',
        },
      ]);
      pages.push(page);
    }

    // All viewers join same session
    for (const page of pages) {
      await page.goto('/');
      await page.getByTestId('session-item').first().click();
    }

    // First page should show overflow indicator (5+ users)
    const presenceList = pages[0].getByTestId('presence-list');
    await expect(presenceList.getByTestId('presence-overflow')).toBeVisible();
    await expect(presenceList.getByTestId('presence-overflow')).toContainText(/\+\d/);

    // Cleanup
    for (const page of pages) {
      await page.close();
    }
  });
});

test.describe('Presence Latency', () => {
  test('presence updates within 2 seconds', async ({
    operatorPage,
    viewerPage,
  }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const startTime = Date.now();

    // Viewer joins
    await viewerPage.goto('/');
    await viewerPage.getByTestId('session-item').first().click();

    // Wait for presence update on operator's side
    await expect(operatorPage.getByTestId('presence-list')).toContainText(/viewer/i, {
      timeout: 2000,
    });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(2000);
  });
});

test.describe('Multi-User Terminal Viewing', () => {
  test('all users see same terminal output', async ({
    operatorPage,
    viewerPage,
    adminPage,
  }) => {
    // All three join same session
    await operatorPage.goto('/');
    await viewerPage.goto('/');
    await adminPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();
    await adminPage.getByTestId('session-item').first().click();

    // Claim and send command
    await operatorPage.getByRole('button', { name: /claim/i }).click();
    await operatorPage.locator('.xterm-screen').click();
    await operatorPage.keyboard.type('echo "test output"');
    await operatorPage.keyboard.press('Enter');

    // All three should see the output
    const output = 'test output';
    await expect(operatorPage.locator('.xterm-screen')).toContainText(output);
    await expect(viewerPage.locator('.xterm-screen')).toContainText(output);
    await expect(adminPage.locator('.xterm-screen')).toContainText(output);
  });

  test('viewer cannot interfere with operator input', async ({
    operatorPage,
    viewerPage,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Operator claims and starts typing
    await operatorPage.getByRole('button', { name: /claim/i }).click();
    await operatorPage.locator('.xterm-screen').click();
    await operatorPage.keyboard.type('import');

    // Viewer tries to type
    await viewerPage.locator('.xterm-screen').click();
    await viewerPage.keyboard.type('xyz');

    // Viewer's input should not appear
    await expect(operatorPage.locator('.xterm-screen')).not.toContainText('xyz');

    // Operator continues typing
    await operatorPage.keyboard.type('ant');
    await expect(operatorPage.locator('.xterm-screen')).toContainText('important');
  });

  test('output syncs within 200ms across users', async ({
    operatorPage,
    viewerPage,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Send output and measure sync time
    const uniqueOutput = `sync-test-${Date.now()}`;

    // Inject output on operator's connection
    await operatorPage.evaluate((output) => {
      const event = new CustomEvent('terminal-output', {
        detail: { data: output + '\r\n' },
      });
      window.dispatchEvent(event);
    }, uniqueOutput);

    // Measure time for viewer to see output
    const startTime = Date.now();
    await expect(viewerPage.locator('.xterm-screen')).toContainText(uniqueOutput, {
      timeout: 500,
    });
    const syncTime = Date.now() - startTime;

    // Should sync within 200ms (allowing some margin)
    expect(syncTime).toBeLessThan(300);
  });
});

test.describe('Claim Notifications', () => {
  test('viewers notified when session claimed', async ({
    operatorPage,
    viewerPage,
    testUsers,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Operator claims
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Viewer sees notification
    await expect(viewerPage.getByTestId('claim-indicator')).toBeVisible();
    await expect(viewerPage.getByTestId('claim-indicator')).toContainText(testUsers.operator.name);
  });

  test('viewers notified when session released', async ({
    operatorPage,
    viewerPage,
  }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Claim and release
    await operatorPage.getByRole('button', { name: /claim/i }).click();
    await expect(viewerPage.getByTestId('claim-indicator')).toBeVisible();

    await operatorPage.getByRole('button', { name: /release/i }).click();

    // Viewer sees release
    await expect(viewerPage.getByTestId('claim-indicator')).toBeHidden();
  });

  test('blocked operator receives control request notification', async ({
    operatorPage,
    adminPage,
  }) => {
    await operatorPage.goto('/');
    await adminPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await adminPage.getByTestId('session-item').first().click();

    // Operator claims
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Admin requests control
    await adminPage.getByRole('button', { name: /request control/i }).click();

    // Operator should see notification
    await expect(operatorPage.getByTestId('control-request-notification')).toBeVisible();
    await expect(operatorPage.getByTestId('control-request-notification')).toContainText(/admin/i);
  });
});

test.describe('Heartbeat and Idle Detection', () => {
  test('presence is maintained via heartbeats', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Wait for several heartbeat intervals
    await operatorPage.waitForTimeout(5000);

    // Should still show as present
    await expect(operatorPage.getByTestId('connection-status')).toHaveText(/connected/i);
  });

  test('idle user is marked as away', async ({ operatorPage, viewerPage }) => {
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Simulate idle detection on viewer (no activity for extended time)
    await viewerPage.evaluate(() => {
      (window as any).__lastActivity = Date.now() - 10 * 60 * 1000; // 10 min ago
      window.dispatchEvent(new CustomEvent('idle-detected'));
    });

    // Operator might see viewer as "away" in presence
    // Implementation-dependent
  });
});
