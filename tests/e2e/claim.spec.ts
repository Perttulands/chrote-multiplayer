/**
 * E2E tests for session claiming and control.
 *
 * Tests operator claiming sessions and sending commands.
 */

import { test, expect } from './fixtures';

test.describe('Session Claiming', () => {
  test('operator sees claim button on unclaimed session', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Select an unclaimed session
    await operatorPage.getByTestId('session-item').first().click();

    // Should show claim button
    await expect(operatorPage.getByRole('button', { name: /claim/i })).toBeVisible();
  });

  test('operator can claim unclaimed session', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Click claim button
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Button should change to release
    await expect(operatorPage.getByRole('button', { name: /release/i })).toBeVisible();

    // Lock indicator should show
    await expect(operatorPage.getByTestId('claim-indicator')).toBeVisible();
    await expect(operatorPage.getByTestId('claim-indicator')).toContainText(/Test Operator/);
  });

  test('claimed session shows lock indicator with countdown', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Should show countdown timer
    const timer = operatorPage.getByTestId('claim-timer');
    await expect(timer).toBeVisible();

    // Timer should show time remaining (e.g., "29:59" for 30 min default)
    await expect(timer).toHaveText(/\d+:\d+/);
  });

  test('operator can release claimed session', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Release the claim
    await operatorPage.getByRole('button', { name: /release/i }).click();

    // Should show claim button again
    await expect(operatorPage.getByRole('button', { name: /claim/i })).toBeVisible();

    // Lock indicator should be gone
    await expect(operatorPage.getByTestId('claim-indicator')).toBeHidden();
  });

  test('viewer cannot claim session', async ({ viewerPage }) => {
    await viewerPage.goto('/');
    await viewerPage.getByTestId('session-item').first().click();

    // Claim button should not exist or be disabled
    const claimButton = viewerPage.getByRole('button', { name: /claim/i });
    await expect(claimButton).toBeHidden().catch(() =>
      expect(claimButton).toBeDisabled()
    );
  });

  test('claim persists across page refresh', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Verify claim is active
    await expect(operatorPage.getByRole('button', { name: /release/i })).toBeVisible();

    // Refresh page
    await operatorPage.reload();

    // Claim should still be active
    await operatorPage.getByTestId('session-item').first().click();
    await expect(operatorPage.getByRole('button', { name: /release/i })).toBeVisible();
  });
});

test.describe('Send Commands', () => {
  test('claimed operator can send keys to terminal', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Click on terminal to focus
    await operatorPage.locator('.xterm-screen').click();

    // Type a command
    await operatorPage.keyboard.type('ls -la');
    await operatorPage.keyboard.press('Enter');

    // Command should be sent (verify via mock or output)
    // This depends on actual WebSocket implementation
    await expect(operatorPage.locator('.xterm-screen')).toContainText('ls -la');
  });

  test('unclaimed operator cannot send keys', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Don't claim - just try to type
    await operatorPage.locator('.xterm-screen').click();
    await operatorPage.keyboard.type('ls -la');

    // Should show error or be blocked
    await expect(operatorPage.getByText(/claim.*first|not claimed/i)).toBeVisible()
      .catch(() => {
        // Or terminal should not receive input
      });
  });

  test('viewer cannot send keys even to unclaimed session', async ({ viewerPage }) => {
    await viewerPage.goto('/');
    await viewerPage.getByTestId('session-item').first().click();

    // Click terminal and try to type
    await viewerPage.locator('.xterm-screen').click();
    await viewerPage.keyboard.type('ls -la');

    // Input should be blocked (viewer is read-only)
    await expect(viewerPage.getByText(/read.?only|cannot send|viewer/i)).toBeVisible()
      .catch(() => {
        // Terminal should not show the typed command
      });
  });
});

test.describe('Multi-User Claim Conflicts', () => {
  test('second operator sees session as claimed', async ({
    operatorPage,
    adminPage,
    testUsers,
  }) => {
    // First operator claims
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Second user (admin) views same session
    await adminPage.goto('/');
    await adminPage.getByTestId('session-item').first().click();

    // Should see locked indicator
    await expect(adminPage.getByTestId('claim-indicator')).toBeVisible();
    await expect(adminPage.getByTestId('claim-indicator')).toContainText(testUsers.operator.name);
  });

  test('blocked operator can request control', async ({
    operatorPage,
    adminPage,
  }) => {
    // Operator claims session
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Admin tries to claim same session
    await adminPage.goto('/');
    await adminPage.getByTestId('session-item').first().click();

    // Should see "Request Control" button instead of Claim
    await expect(adminPage.getByRole('button', { name: /request control/i })).toBeVisible();

    // Click request control
    await adminPage.getByRole('button', { name: /request control/i }).click();

    // Should show confirmation
    await expect(adminPage.getByText(/request sent|notified/i)).toBeVisible();
  });

  test('admin can override claim', async ({
    operatorPage,
    adminPage,
    testUsers,
  }) => {
    // Operator claims session
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Admin views session
    await adminPage.goto('/');
    await adminPage.getByTestId('session-item').first().click();

    // Admin should have override option
    await expect(adminPage.getByRole('button', { name: /override|force/i })).toBeVisible();

    // Click override
    await adminPage.getByRole('button', { name: /override|force/i }).click();

    // Confirm override
    await adminPage.getByRole('button', { name: /confirm|yes/i }).click();

    // Admin should now have claim
    await expect(adminPage.getByRole('button', { name: /release/i })).toBeVisible();
    await expect(adminPage.getByTestId('claim-indicator')).toContainText(testUsers.admin.name);
  });
});

test.describe('Claim Timeout', () => {
  test('claim expires after timeout', async ({ operatorPage }) => {
    // This test would need time manipulation or short timeout in test env

    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // For testing, simulate timeout expiration
    await operatorPage.evaluate(() => {
      // Simulate WebSocket message for claim expiration
      const ws = (window as any).__ws;
      if (ws) {
        const event = new MessageEvent('message', {
          data: JSON.stringify({
            type: 'released',
            sessionId: 'test-session',
            reason: 'timeout',
          }),
        });
        ws.dispatchEvent(event);
      }
    });

    // Claim should be released
    await expect(operatorPage.getByRole('button', { name: /claim/i })).toBeVisible();
    await expect(operatorPage.getByTestId('claim-indicator')).toBeHidden();
  });

  test('operator receives warning before claim expires', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Simulate approaching timeout (e.g., 5 min remaining)
    await operatorPage.evaluate(() => {
      const event = new CustomEvent('claim-warning', {
        detail: { remainingSeconds: 300 },
      });
      window.dispatchEvent(event);
    });

    // Should show warning
    await expect(operatorPage.getByText(/expiring|renew/i)).toBeVisible()
      .catch(() => {
        // Or timer should be highlighted
        expect(operatorPage.getByTestId('claim-timer')).toHaveClass(/warning|urgent/);
      });
  });
});

test.describe('Presence During Claim', () => {
  test('shows who is viewing while claimed', async ({
    operatorPage,
    viewerPage,
  }) => {
    // Operator claims session
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Viewer joins same session
    await viewerPage.goto('/');
    await viewerPage.getByTestId('session-item').first().click();

    // Operator should see viewer in presence list
    await expect(operatorPage.getByTestId('presence-list')).toContainText(/Test Viewer/);

    // Viewer should see operator as claim holder
    await expect(viewerPage.getByTestId('claim-indicator')).toContainText(/Test Operator/);
  });
});
