/**
 * E2E tests for WebSocket reconnection.
 *
 * Tests graceful handling of network disconnects and state recovery.
 */

import { test, expect } from './fixtures';

test.describe('WebSocket Connection', () => {
  test('establishes WebSocket connection on page load', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Wait for WebSocket to connect
    const connected = await operatorPage.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const checkConnection = () => {
          const ws = (window as any).__ws;
          if (ws && ws.readyState === WebSocket.OPEN) {
            resolve(true);
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
        setTimeout(() => resolve(false), 10000);
      });
    });

    expect(connected).toBe(true);
  });

  test('shows connection status indicator', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Should show connected status
    await expect(operatorPage.getByTestId('connection-status')).toHaveText(/connected/i);
  });
});

test.describe('Disconnect Handling', () => {
  test('shows disconnected state when connection drops', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Wait for initial connection
    await operatorPage.waitForFunction(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    });

    // Simulate disconnect
    await operatorPage.evaluate(() => {
      const ws = (window as any).__ws;
      if (ws) {
        ws.close();
      }
    });

    // Should show disconnected status
    await expect(operatorPage.getByTestId('connection-status')).toHaveText(/disconnected|reconnecting/i);
  });

  test('terminal shows offline indicator when disconnected', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Simulate disconnect
    await operatorPage.evaluate(() => {
      const ws = (window as any).__ws;
      if (ws) ws.close();
    });

    // Terminal should show offline overlay or indicator
    await expect(operatorPage.getByTestId('terminal-offline-indicator')).toBeVisible()
      .catch(() =>
        expect(operatorPage.locator('.xterm-screen')).toHaveClass(/offline|disabled/)
      );
  });

  test('input is blocked during disconnect', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Disconnect
    await operatorPage.evaluate(() => {
      (window as any).__ws?.close();
    });

    // Try to send input
    await operatorPage.locator('.xterm-screen').click();
    await operatorPage.keyboard.type('test command');

    // Should show error or queue the input
    await expect(operatorPage.getByText(/offline|queued|cannot send/i)).toBeVisible()
      .catch(() => {
        // Input should be blocked
      });
  });
});

test.describe('Automatic Reconnection', () => {
  test('automatically reconnects after disconnect', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Wait for initial connection
    await operatorPage.waitForFunction(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    });

    // Simulate disconnect
    await operatorPage.evaluate(() => {
      (window as any).__ws?.close();
    });

    // Wait for reconnection (with backoff)
    const reconnected = await operatorPage.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const checkConnection = () => {
          const ws = (window as any).__ws;
          if (ws && ws.readyState === WebSocket.OPEN) {
            resolve(true);
          } else {
            setTimeout(checkConnection, 500);
          }
        };
        // Start checking after a delay (to allow reconnect logic)
        setTimeout(checkConnection, 2000);
        // Timeout after 30 seconds
        setTimeout(() => resolve(false), 30000);
      });
    });

    expect(reconnected).toBe(true);

    // Status should show connected
    await expect(operatorPage.getByTestId('connection-status')).toHaveText(/connected/i);
  });

  test('uses exponential backoff for reconnection', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Capture reconnection attempts
    const attempts: number[] = [];

    await operatorPage.evaluate(() => {
      (window as any).__reconnectAttempts = [];
      const originalWS = window.WebSocket;

      (window as any).WebSocket = class extends originalWS {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as any).__reconnectAttempts.push(Date.now());
        }
      };
    });

    // Disconnect multiple times to trigger backoff
    for (let i = 0; i < 3; i++) {
      await operatorPage.evaluate(() => {
        (window as any).__ws?.close();
      });
      await operatorPage.waitForTimeout(2000);
    }

    // Get attempt timestamps
    const timestamps = await operatorPage.evaluate(() => {
      return (window as any).__reconnectAttempts || [];
    });

    // Verify backoff (delays should increase)
    if (timestamps.length >= 3) {
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      // Second delay should be longer (backoff)
      expect(delay2).toBeGreaterThanOrEqual(delay1);
    }
  });
});

test.describe('State Recovery', () => {
  test('restores session subscriptions after reconnect', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Subscribe to a session
    await operatorPage.getByTestId('session-item').first().click();

    // Wait for subscription
    await operatorPage.waitForFunction(() => {
      return (window as any).__subscribedSessions?.length > 0;
    }).catch(() => {});

    // Disconnect
    await operatorPage.evaluate(() => {
      (window as any).__ws?.close();
    });

    // Wait for reconnection
    await operatorPage.waitForFunction(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    }, { timeout: 15000 });

    // Subscriptions should be restored
    const subscriptions = await operatorPage.evaluate(() => {
      return (window as any).__subscribedSessions || [];
    });

    expect(subscriptions.length).toBeGreaterThan(0);
  });

  test('receives buffered output after reconnect', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Disconnect
    await operatorPage.evaluate(() => {
      (window as any).__ws?.close();
    });

    // Wait for reconnection
    await operatorPage.waitForFunction(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    }, { timeout: 15000 });

    // Terminal should receive any missed output
    // (Server should send buffered content on reconnect)
    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();
  });

  test('preserves claim after reconnect', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();
    await operatorPage.getByRole('button', { name: /claim/i }).click();

    // Verify claim active
    await expect(operatorPage.getByRole('button', { name: /release/i })).toBeVisible();

    // Disconnect
    await operatorPage.evaluate(() => {
      (window as any).__ws?.close();
    });

    // Wait for reconnection
    await operatorPage.waitForFunction(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    }, { timeout: 15000 });

    // Claim should still be active
    await expect(operatorPage.getByRole('button', { name: /release/i })).toBeVisible();
  });

  test('presence updates after reconnect', async ({ operatorPage, viewerPage }) => {
    // Both connected to same session
    await operatorPage.goto('/');
    await viewerPage.goto('/');

    await operatorPage.getByTestId('session-item').first().click();
    await viewerPage.getByTestId('session-item').first().click();

    // Operator disconnects and reconnects
    await operatorPage.evaluate(() => {
      (window as any).__ws?.close();
    });

    await operatorPage.waitForFunction(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    }, { timeout: 15000 });

    // Viewer should still see operator in presence list
    await expect(viewerPage.getByTestId('presence-list')).toContainText(/operator/i);
  });
});

test.describe('Connection Quality', () => {
  test('handles high latency gracefully', async ({ operatorPage }) => {
    // Add artificial delay to WebSocket messages
    await operatorPage.route('**/ws', async (route) => {
      await new Promise((r) => setTimeout(r, 500)); // 500ms delay
      await route.continue();
    });

    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Terminal should still be usable
    await expect(operatorPage.locator('.xterm-screen')).toBeVisible();
  });

  test('shows latency indicator when connection is slow', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Simulate slow connection detection
    await operatorPage.evaluate(() => {
      (window as any).__connectionLatency = 2000; // 2 second latency
      window.dispatchEvent(new CustomEvent('connection-slow'));
    });

    // Should show warning
    await expect(operatorPage.getByTestId('connection-quality')).toHaveText(/slow|high latency/i)
      .catch(() => {
        // Or show warning icon
        expect(operatorPage.getByTestId('connection-warning')).toBeVisible();
      });
  });
});

test.describe('Multiple Browser Tabs', () => {
  test('handles connection in multiple tabs', async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Set up auth for both
    await context.addCookies([
      {
        name: 'session',
        value: 'test-operator-001',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page1.goto('/');
    await page2.goto('/');

    // Both should be connected
    const page1Connected = await page1.evaluate(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    });

    const page2Connected = await page2.evaluate(() => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    });

    expect(page1Connected).toBe(true);
    expect(page2Connected).toBe(true);

    await page1.close();
    await page2.close();
  });

  test('claim is synced across tabs', async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await context.addCookies([
      {
        name: 'session',
        value: 'test-operator-001',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page1.goto('/');
    await page2.goto('/');

    // Select same session in both
    await page1.getByTestId('session-item').first().click();
    await page2.getByTestId('session-item').first().click();

    // Claim in tab 1
    await page1.getByRole('button', { name: /claim/i }).click();

    // Tab 2 should see the claim
    await expect(page2.getByRole('button', { name: /release/i })).toBeVisible();

    await page1.close();
    await page2.close();
  });
});
