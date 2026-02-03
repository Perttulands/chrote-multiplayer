/**
 * WebSocket mock utilities for E2E tests.
 *
 * Provides helpers for simulating WebSocket behavior in tests.
 */

import { type Page } from '@playwright/test';

export interface WsMessage {
  type: string;
  sessionId?: string;
  data?: string;
  users?: { id: string; name: string; avatar?: string }[];
  by?: string;
  expiresAt?: string;
  code?: string;
  message?: string;
}

/**
 * Set up WebSocket mock that captures and allows injecting messages.
 */
export async function setupWebSocketMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Store original WebSocket
    const OriginalWebSocket = window.WebSocket;

    // Track connections
    (window as any).__wsConnections = [];
    (window as any).__wsMessages = [];
    (window as any).__subscribedSessions = [];

    // Mock WebSocket class
    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState: number = MockWebSocket.CONNECTING;
      bufferedAmount: number = 0;
      extensions: string = '';
      protocol: string = '';
      binaryType: BinaryType = 'blob';

      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;

      constructor(url: string | URL, protocols?: string | string[]) {
        super();
        this.url = url.toString();
        (window as any).__wsConnections.push(this);
        (window as any).__ws = this;
        (window as any).__wsConnected = false;

        // Simulate connection with delay
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          (window as any).__wsConnected = true;
          const event = new Event('open');
          this.onopen?.(event);
          this.dispatchEvent(event);
        }, 100);
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        const message = JSON.parse(data as string);
        (window as any).__wsMessages.push({ direction: 'out', message });

        // Track subscriptions
        if (message.type === 'subscribe') {
          (window as any).__subscribedSessions.push(message.sessionId);
        } else if (message.type === 'unsubscribe') {
          const idx = (window as any).__subscribedSessions.indexOf(message.sessionId);
          if (idx !== -1) {
            (window as any).__subscribedSessions.splice(idx, 1);
          }
        }
      }

      close(code?: number, reason?: string): void {
        this.readyState = MockWebSocket.CLOSING;
        setTimeout(() => {
          this.readyState = MockWebSocket.CLOSED;
          (window as any).__wsConnected = false;
          const event = new CloseEvent('close', { code, reason });
          this.onclose?.(event);
          this.dispatchEvent(event);
        }, 50);
      }

      // Helper to simulate receiving a message
      _receiveMessage(data: any): void {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        (window as any).__wsMessages.push({ direction: 'in', message: JSON.parse(message) });
        const event = new MessageEvent('message', { data: message });
        this.onmessage?.(event);
        this.dispatchEvent(event);
      }
    }

    // Replace global WebSocket
    (window as any).WebSocket = MockWebSocket;
    (window as any).MockWebSocket = MockWebSocket;
  });
}

/**
 * Inject a WebSocket message as if received from server.
 */
export async function injectWsMessage(page: Page, message: WsMessage): Promise<void> {
  await page.evaluate((msg) => {
    const ws = (window as any).__ws;
    if (ws && ws._receiveMessage) {
      ws._receiveMessage(msg);
    }
  }, message);
}

/**
 * Simulate terminal output via WebSocket.
 */
export async function simulateTerminalOutput(
  page: Page,
  sessionId: string,
  data: string
): Promise<void> {
  await injectWsMessage(page, {
    type: 'output',
    sessionId,
    data,
  });
}

/**
 * Simulate presence update via WebSocket.
 */
export async function simulatePresenceUpdate(
  page: Page,
  sessionId: string,
  users: Array<{ id: string; name: string; avatar?: string }>
): Promise<void> {
  await injectWsMessage(page, {
    type: 'presence',
    sessionId,
    users,
  });
}

/**
 * Simulate claim notification via WebSocket.
 */
export async function simulateClaim(
  page: Page,
  sessionId: string,
  claimedBy: string,
  expiresAt: Date
): Promise<void> {
  await injectWsMessage(page, {
    type: 'claimed',
    sessionId,
    by: claimedBy,
    expiresAt: expiresAt.toISOString(),
  });
}

/**
 * Simulate release notification via WebSocket.
 */
export async function simulateRelease(page: Page, sessionId: string): Promise<void> {
  await injectWsMessage(page, {
    type: 'released',
    sessionId,
  });
}

/**
 * Get all captured WebSocket messages.
 */
export async function getCapturedMessages(page: Page): Promise<Array<{
  direction: 'in' | 'out';
  message: WsMessage;
}>> {
  return await page.evaluate(() => {
    return (window as any).__wsMessages || [];
  });
}

/**
 * Get messages sent by the client.
 */
export async function getOutgoingMessages(page: Page): Promise<WsMessage[]> {
  const messages = await getCapturedMessages(page);
  return messages.filter((m) => m.direction === 'out').map((m) => m.message);
}

/**
 * Wait for WebSocket connection to be established.
 */
export async function waitForWsConnection(page: Page, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    () => {
      const ws = (window as any).__ws;
      return ws && ws.readyState === WebSocket.OPEN;
    },
    { timeout }
  );
}

/**
 * Simulate WebSocket disconnection.
 */
export async function simulateDisconnect(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ws = (window as any).__ws;
    if (ws) {
      ws.close(1006, 'Simulated disconnect');
    }
  });
}

/**
 * Get current WebSocket subscriptions.
 */
export async function getSubscriptions(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    return (window as any).__subscribedSessions || [];
  });
}
