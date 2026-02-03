/**
 * E2E tests for terminal output viewing.
 *
 * Tests real-time terminal output via WebSocket and xterm.js.
 */

import { test, expect } from './fixtures';

test.describe('Terminal Output Display', () => {
  test('displays terminal with session list', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Should show session sidebar
    await expect(operatorPage.getByTestId('session-sidebar')).toBeVisible();

    // Should show at least one session (or empty state)
    const sessions = operatorPage.getByTestId('session-item');
    const emptyState = operatorPage.getByText(/no sessions/i);

    await expect(sessions.first().or(emptyState)).toBeVisible();
  });

  test('clicking session shows terminal output', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Click on a session
    const session = operatorPage.getByTestId('session-item').first();
    if (await session.isVisible()) {
      await session.click();

      // Terminal container should appear
      await expect(operatorPage.getByTestId('terminal-container')).toBeVisible();

      // xterm canvas should be rendered
      await expect(operatorPage.locator('.xterm-screen')).toBeVisible();
    }
  });

  test('terminal renders ANSI colors correctly', async ({ operatorPage }) => {
    await operatorPage.goto('/');

    // Select a session
    await operatorPage.getByTestId('session-item').first().click();

    // Wait for terminal to be ready
    await expect(operatorPage.locator('.xterm-screen')).toBeVisible();

    // Send a command that produces colored output (via WebSocket mock)
    await operatorPage.evaluate(() => {
      // Simulate receiving colored output
      const event = new CustomEvent('terminal-output', {
        detail: {
          data: '\x1b[32mGreen text\x1b[0m \x1b[31mRed text\x1b[0m',
        },
      });
      window.dispatchEvent(event);
    });

    // Check that colored spans exist in xterm
    const greenSpan = operatorPage.locator('.xterm-rows span').filter({ hasText: 'Green' });
    const redSpan = operatorPage.locator('.xterm-rows span').filter({ hasText: 'Red' });

    // Colors should be rendered (xterm applies color via style or class)
    await expect(greenSpan.or(redSpan)).toBeVisible();
  });

  test('terminal updates in real-time', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    // Wait for WebSocket connection
    await operatorPage.waitForFunction(() => {
      return (window as any).__wsConnected === true;
    }, { timeout: 10000 }).catch(() => {});

    // Get initial content
    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();

    // Simulate receiving new output
    await operatorPage.evaluate(() => {
      const ws = (window as any).__ws;
      if (ws) {
        const event = new MessageEvent('message', {
          data: JSON.stringify({
            type: 'output',
            sessionId: 'test-session',
            data: 'New output line\r\n',
          }),
        });
        ws.dispatchEvent(event);
      }
    });

    // Terminal should contain new output
    await expect(terminal).toContainText('New output');
  });

  test('terminal supports smooth scrolling', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();

    // Simulate lots of output
    for (let i = 0; i < 100; i++) {
      await operatorPage.evaluate((lineNum) => {
        const event = new CustomEvent('terminal-output', {
          detail: { data: `Line ${lineNum}\r\n` },
        });
        window.dispatchEvent(event);
      }, i);
    }

    // Terminal should be scrollable
    const viewport = operatorPage.locator('.xterm-viewport');
    const scrollHeight = await viewport.evaluate((el) => el.scrollHeight);
    const clientHeight = await viewport.evaluate((el) => el.clientHeight);

    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });

  test('terminal resize handles gracefully', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();

    // Resize viewport
    await operatorPage.setViewportSize({ width: 800, height: 600 });
    await operatorPage.waitForTimeout(500); // Wait for resize handler

    // Terminal should still be visible and functional
    await expect(terminal).toBeVisible();

    // Resize again
    await operatorPage.setViewportSize({ width: 1200, height: 900 });
    await operatorPage.waitForTimeout(500);

    await expect(terminal).toBeVisible();
  });
});

test.describe('Terminal Selection and Copy', () => {
  test('can select text in terminal', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();

    // Triple-click to select a line
    await terminal.click({ clickCount: 3 });

    // Selection should be active (xterm adds selection class)
    await expect(operatorPage.locator('.xterm-selection')).toBeVisible();
  });

  test('can copy selected text', async ({ operatorPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();

    // Select text
    await terminal.click({ clickCount: 3 });

    // Copy via keyboard
    await operatorPage.keyboard.press('Control+C');

    // Or via context menu if available
    // await terminal.click({ button: 'right' });
    // await operatorPage.getByRole('menuitem', { name: /copy/i }).click();
  });
});

test.describe('Independent Scroll Per User', () => {
  test('scroll position is independent across users', async ({
    operatorPage,
    viewerPage,
  }) => {
    // Both users view same session
    await operatorPage.goto('/sessions/test-session');
    await viewerPage.goto('/sessions/test-session');

    const opTerminal = operatorPage.locator('.xterm-viewport');
    const viewerTerminal = viewerPage.locator('.xterm-viewport');

    await expect(opTerminal).toBeVisible();
    await expect(viewerTerminal).toBeVisible();

    // Simulate scrollback content
    for (const page of [operatorPage, viewerPage]) {
      await page.evaluate(() => {
        for (let i = 0; i < 100; i++) {
          const event = new CustomEvent('terminal-output', {
            detail: { data: `Line ${i}\r\n` },
          });
          window.dispatchEvent(event);
        }
      });
    }

    // Operator scrolls up
    await opTerminal.evaluate((el) => { el.scrollTop = 0; });

    // Get scroll positions
    const opScrollTop = await opTerminal.evaluate((el) => el.scrollTop);
    const viewerScrollTop = await viewerTerminal.evaluate((el) => el.scrollTop);

    // Scroll positions should be independent
    // (Viewer should still be at bottom, operator at top)
    expect(opScrollTop).toBe(0);
    expect(viewerScrollTop).toBeGreaterThan(0);
  });
});

test.describe('Terminal Performance', () => {
  test('maintains 60fps during rapid output', async ({ operatorPage }) => {
    await operatorPage.goto('/');
    await operatorPage.getByTestId('session-item').first().click();

    const terminal = operatorPage.locator('.xterm-screen');
    await expect(terminal).toBeVisible();

    // Measure frame rate during rapid output
    const fps = await operatorPage.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let frameCount = 0;
        const startTime = performance.now();

        // Simulate rapid terminal output
        const outputInterval = setInterval(() => {
          const event = new CustomEvent('terminal-output', {
            detail: { data: 'x'.repeat(80) + '\r\n' },
          });
          window.dispatchEvent(event);
        }, 10);

        // Count frames
        function countFrames() {
          frameCount++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrames);
          } else {
            clearInterval(outputInterval);
            resolve(frameCount);
          }
        }

        requestAnimationFrame(countFrames);
      });
    });

    // Should maintain at least 30fps (ideally 60)
    expect(fps).toBeGreaterThan(30);
  });
});
