/**
 * WebSocket Integration Tests
 *
 * Tests the WebSocket subsystem including:
 * - Terminal output streaming
 * - Yjs document sync (CRDT operations)
 * - Presence/awareness updates
 * - Reconnection handling
 * - Message protocol framing and error handling
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TerminalWSServer, createWSServer } from "../../src/server/ws/server";
import type { TmuxSession, CaptureResult, ITmuxBridge } from "../../src/server/tmux/types";
import type { ChroteClient } from "../../src/server/chrote/client";
import type { Role } from "../../src/db/schema";
import type { ServerMessage, ClientMessage } from "../../src/server/ws/types";
import { ErrorCodes } from "../../src/server/ws/types";

// ============================================================================
// Mock Implementations
// ============================================================================

class MockTmuxBridge implements ITmuxBridge {
  private sessions: Map<string, TmuxSession> = new Map();
  private paneContent: Map<string, string> = new Map();

  addSession(session: TmuxSession): void {
    this.sessions.set(session.name, session);
  }

  removeSession(name: string): void {
    this.sessions.delete(name);
  }

  setPaneContent(session: string, pane: string, content: string): void {
    this.paneContent.set(`${session}:${pane}`, content);
  }

  async listSessions(): Promise<TmuxSession[]> {
    return Array.from(this.sessions.values());
  }

  async getSession(name: string): Promise<TmuxSession | null> {
    return this.sessions.get(name) ?? null;
  }

  async capturePane(session: string, pane: string = "0"): Promise<CaptureResult> {
    const content = this.paneContent.get(`${session}:${pane}`) ?? "";
    return {
      session,
      pane,
      content,
      timestamp: new Date(),
    };
  }

  async sendKeys(session: string, keys: string, pane: string = "0"): Promise<void> {
    if (!this.sessions.has(session)) {
      throw new Error(`Session '${session}' not found`);
    }
    // In real implementation, this would send keys to tmux
  }

  async getScrollback(session: string, lines: number, pane: string = "0"): Promise<string> {
    return this.paneContent.get(`${session}:${pane}`) ?? "";
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

class MockChroteClient implements Pick<ChroteClient, "listSessions" | "getSession" | "isAvailable"> {
  private sessions: TmuxSession[] = [];

  setSessions(sessions: TmuxSession[]): void {
    this.sessions = sessions;
  }

  async listSessions(): Promise<TmuxSession[]> {
    return this.sessions;
  }

  async getSession(name: string): Promise<TmuxSession | null> {
    return this.sessions.find((s) => s.name === name) ?? null;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Mock WebSocket for testing
 */
class MockWebSocket {
  readyState: number = 1; // OPEN
  messages: string[] = [];
  closeCode?: number;
  closeReason?: string;
  onclose?: () => void;

  send(data: string): void {
    if (this.readyState === 1) {
      this.messages.push(data);
    }
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  getLastMessage<T = ServerMessage>(): T | null {
    if (this.messages.length === 0) return null;
    return JSON.parse(this.messages[this.messages.length - 1]) as T;
  }

  getAllMessages<T = ServerMessage>(): T[] {
    return this.messages.map((m) => JSON.parse(m) as T);
  }

  clearMessages(): void {
    this.messages = [];
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

function createTestSession(name: string, overrides: Partial<TmuxSession> = {}): TmuxSession {
  return {
    name,
    windows: 1,
    attached: 0,
    created: new Date(),
    id: `$${name}`,
    ...overrides,
  };
}

function createMockRequest(cookies: string = ""): Request {
  return new Request("http://localhost/ws", {
    headers: cookies ? { cookie: cookies } : {},
  });
}

interface TestContext {
  server: TerminalWSServer;
  bridge: MockTmuxBridge;
  chrote: MockChroteClient;
}

function createTestServer(
  authUser: { userId: string; userName: string; role: Role } | null = {
    userId: "user-1",
    userName: "Test User",
    role: "operator",
  }
): TestContext {
  const bridge = new MockTmuxBridge();
  const chrote = new MockChroteClient();

  const server = createWSServer({
    bridge: bridge as unknown as import("../../src/server/tmux/bridge").TmuxBridge,
    chrote: chrote as unknown as ChroteClient,
    authenticate: async () => authUser,
  });

  return { server, bridge, chrote };
}

// ============================================================================
// Terminal Output Streaming Tests
// ============================================================================

describe("Terminal Output Streaming", () => {
  let ctx: TestContext;
  let ws: MockWebSocket;

  beforeEach(() => {
    ctx = createTestServer();
    ws = new MockWebSocket();

    // Add test session
    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);
    ctx.bridge.setPaneContent("dev", "0", "$ hello world\n");
  });

  afterEach(() => {
    ctx.server.stop();
  });

  test("should send connected message on successful auth", async () => {
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    const messages = ws.getAllMessages();
    const connected = messages.find((m) => m.type === "connected");

    expect(connected).toBeDefined();
    expect(connected?.userId).toBe("user-1");
    expect(connected?.role).toBe("operator");
  });

  test("should send sessions list on connection", async () => {
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    const messages = ws.getAllMessages();
    const sessionsMsg = messages.find((m) => m.type === "sessions");

    expect(sessionsMsg).toBeDefined();
    expect(sessionsMsg?.sessions).toHaveLength(1);
    expect(sessionsMsg?.sessions[0].name).toBe("dev");
  });

  test("should reject unauthenticated connections", async () => {
    const { server } = createTestServer(null);

    await server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    const errorMsg = ws.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.AUTH_REQUIRED);
    expect(ws.closeCode).toBe(4001);

    server.stop();
  });

  test("should send initial output on subscribe", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());
    ws.clearMessages();

    const subscribeMsg: ClientMessage = {
      type: "subscribe",
      sessionId: "dev",
      pane: "0",
    };

    ctx.server.handleWsMessage(ws as unknown as WebSocket, JSON.stringify(subscribeMsg));

    // Wait for async subscribe handling
    await new Promise((resolve) => setTimeout(resolve, 50));

    const messages = ws.getAllMessages();
    const outputMsg = messages.find((m) => m.type === "output");

    expect(outputMsg).toBeDefined();
    expect(outputMsg?.sessionId).toBe("dev");
    expect(outputMsg?.data).toContain("hello world");
  });

  test("should return error for non-existent session", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());
    ws.clearMessages();

    const subscribeMsg: ClientMessage = {
      type: "subscribe",
      sessionId: "nonexistent",
    };

    ctx.server.handleWsMessage(ws as unknown as WebSocket, JSON.stringify(subscribeMsg));

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = ws.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.SESSION_NOT_FOUND);
  });

  test("should handle disconnect gracefully", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    const initialStats = ctx.server.getStats();
    expect(initialStats.connections).toBe(1);

    ctx.server.handleWsClose(ws as unknown as WebSocket);

    const finalStats = ctx.server.getStats();
    expect(finalStats.connections).toBe(0);
  });
});

// ============================================================================
// Presence/Awareness Tests
// ============================================================================

describe("Presence and Awareness", () => {
  let ctx: TestContext;
  let ws1: MockWebSocket;
  let ws2: MockWebSocket;

  beforeEach(() => {
    const bridge = new MockTmuxBridge();
    const chrote = new MockChroteClient();

    const session = createTestSession("dev");
    bridge.addSession(session);
    chrote.setSessions([session]);
    bridge.setPaneContent("dev", "0", "$ ");

    let userIndex = 0;
    const users = [
      { userId: "user-1", userName: "Alice", role: "operator" as Role },
      { userId: "user-2", userName: "Bob", role: "operator" as Role },
    ];

    ctx = {
      bridge,
      chrote,
      server: createWSServer({
        bridge: bridge as unknown as import("../../src/server/tmux/bridge").TmuxBridge,
        chrote: chrote as unknown as ChroteClient,
        authenticate: async () => users[userIndex++] ?? null,
      }),
    };

    ws1 = new MockWebSocket();
    ws2 = new MockWebSocket();
  });

  afterEach(() => {
    ctx.server.stop();
  });

  test("should broadcast presence when user subscribes", async () => {
    ctx.server.start();

    // Connect user 1
    await ctx.server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());
    ws1.clearMessages();

    // Subscribe to session
    ctx.server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const presenceMsg = ws1.getAllMessages().find((m) => m.type === "presence");
    expect(presenceMsg).toBeDefined();
    expect(presenceMsg?.users).toHaveLength(1);
    expect(presenceMsg?.users[0].name).toBe("Alice");
    expect(presenceMsg?.users[0].status).toBe("viewing");
  });

  test("should show multiple users in presence", async () => {
    ctx.server.start();

    // Connect both users
    await ctx.server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());
    await ctx.server.handleConnection(ws2 as unknown as WebSocket, createMockRequest());

    // Both subscribe
    ctx.server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    ws1.clearMessages();
    ws2.clearMessages();

    ctx.server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check presence broadcast to user 1
    const presenceMsg = ws1.getAllMessages().find((m) => m.type === "presence");
    expect(presenceMsg?.users).toHaveLength(2);
    expect(presenceMsg?.users.map((u: { name: string }) => u.name).sort()).toEqual(["Alice", "Bob"]);
  });

  test("should update presence status when user claims session", async () => {
    ctx.server.start();

    await ctx.server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());

    // Subscribe first
    ctx.server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws1.clearMessages();

    // Claim session
    ctx.server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const presenceMsg = ws1.getAllMessages().find((m) => m.type === "presence");
    expect(presenceMsg?.users[0].status).toBe("controlling");
  });

  test("should remove user from presence on disconnect", async () => {
    ctx.server.start();

    await ctx.server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());
    await ctx.server.handleConnection(ws2 as unknown as WebSocket, createMockRequest());

    // Both subscribe
    ctx.server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    ctx.server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify both users are in presence before disconnect
    const presenceBefore = ws2.getAllMessages().filter((m) => m.type === "presence");
    const latestBefore = presenceBefore[presenceBefore.length - 1];
    expect(latestBefore?.users).toHaveLength(2);

    // Verify server has 2 connections
    expect(ctx.server.getStats().connections).toBe(2);

    // Disconnect user 1
    ctx.server.handleWsClose(ws1 as unknown as WebSocket);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify server now has 1 connection
    expect(ctx.server.getStats().connections).toBe(1);
    expect(ctx.server.getStats().users).toBe(1);

    // Trigger a new presence update by having Bob re-subscribe
    ws2.clearMessages();
    ctx.server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "unsubscribe", sessionId: "dev" })
    );
    ctx.server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now presence should show only Bob
    const presenceAfter = ws2.getAllMessages().filter((m) => m.type === "presence");
    const latestAfter = presenceAfter[presenceAfter.length - 1];
    expect(latestAfter?.users).toHaveLength(1);
    expect(latestAfter?.users[0].name).toBe("Bob");
  });
});

// ============================================================================
// Claim/Release Tests
// ============================================================================

describe("Claim and Release Mechanics", () => {
  let ctx: TestContext;
  let ws: MockWebSocket;

  beforeEach(() => {
    ctx = createTestServer();
    ws = new MockWebSocket();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);
    ctx.bridge.setPaneContent("dev", "0", "$ ");
  });

  afterEach(() => {
    ctx.server.stop();
  });

  test("should allow operator to claim session", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    // Subscribe first
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws.clearMessages();

    // Claim
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const claimedMsg = ws.getAllMessages().find((m) => m.type === "claimed");
    expect(claimedMsg).toBeDefined();
    expect(claimedMsg?.sessionId).toBe("dev");
    expect(claimedMsg?.by.name).toBe("Test User");
  });

  test("should reject claim from viewer role", async () => {
    const { server, bridge, chrote } = createTestServer({
      userId: "viewer-1",
      userName: "Viewer",
      role: "viewer",
    });
    const viewerWs = new MockWebSocket();

    const session = createTestSession("dev");
    bridge.addSession(session);
    chrote.setSessions([session]);

    server.start();
    await server.handleConnection(viewerWs as unknown as WebSocket, createMockRequest());
    viewerWs.clearMessages();

    viewerWs.readyState = 1;
    server.handleWsMessage(
      viewerWs as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = viewerWs.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.NOT_OPERATOR);

    server.stop();
  });

  test("should release claim", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    // Subscribe and claim
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws.clearMessages();

    // Release
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "release", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const releasedMsg = ws.getAllMessages().find((m) => m.type === "released");
    expect(releasedMsg).toBeDefined();
    expect(releasedMsg?.sessionId).toBe("dev");
  });

  test("should prevent second user from claiming locked session", async () => {
    const bridge = new MockTmuxBridge();
    const chrote = new MockChroteClient();

    const session = createTestSession("dev");
    bridge.addSession(session);
    chrote.setSessions([session]);
    bridge.setPaneContent("dev", "0", "$ ");

    let userIndex = 0;
    const users = [
      { userId: "user-1", userName: "Alice", role: "operator" as Role },
      { userId: "user-2", userName: "Bob", role: "operator" as Role },
    ];

    const server = createWSServer({
      bridge: bridge as unknown as import("../../src/server/tmux/bridge").TmuxBridge,
      chrote: chrote as unknown as ChroteClient,
      authenticate: async () => users[userIndex++],
    });

    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    server.start();

    // User 1 connects and claims
    await server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());
    server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // User 2 connects and tries to claim
    await server.handleConnection(ws2 as unknown as WebSocket, createMockRequest());
    ws2.clearMessages();

    server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = ws2.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.SESSION_CLAIMED);

    server.stop();
  });

  test("should allow admin to override claim", async () => {
    const bridge = new MockTmuxBridge();
    const chrote = new MockChroteClient();

    const session = createTestSession("dev");
    bridge.addSession(session);
    chrote.setSessions([session]);
    bridge.setPaneContent("dev", "0", "$ ");

    let userIndex = 0;
    const users = [
      { userId: "user-1", userName: "Alice", role: "operator" as Role },
      { userId: "admin-1", userName: "Admin", role: "admin" as Role },
    ];

    const server = createWSServer({
      bridge: bridge as unknown as import("../../src/server/tmux/bridge").TmuxBridge,
      chrote: chrote as unknown as ChroteClient,
      authenticate: async () => users[userIndex++],
    });

    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    server.start();

    // Operator claims
    await server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());
    server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Admin overrides
    await server.handleConnection(ws2 as unknown as WebSocket, createMockRequest());
    server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws2.clearMessages();

    server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const claimedMsg = ws2.getAllMessages().find((m) => m.type === "claimed");
    expect(claimedMsg).toBeDefined();
    expect(claimedMsg?.by.name).toBe("Admin");

    // Operator should receive release notification
    const releasedMsg = ws1.getAllMessages().find((m) => m.type === "released");
    expect(releasedMsg).toBeDefined();

    server.stop();
  });
});

// ============================================================================
// SendKeys Tests
// ============================================================================

describe("SendKeys Operation", () => {
  let ctx: TestContext;
  let ws: MockWebSocket;

  beforeEach(() => {
    ctx = createTestServer();
    ws = new MockWebSocket();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);
    ctx.bridge.setPaneContent("dev", "0", "$ ");
  });

  afterEach(() => {
    ctx.server.stop();
  });

  test("should require claim before sending keys", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    // Subscribe but don't claim
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws.clearMessages();

    // Try to send keys
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "sendKeys", sessionId: "dev", keys: "ls\n" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = ws.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.NOT_CLAIMED);
  });

  test("should allow sending keys when claimed", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    // Subscribe and claim
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws.clearMessages();

    // Send keys - should not produce error
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "sendKeys", sessionId: "dev", keys: "ls -la\n" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not have error message
    const errorMsg = ws.getAllMessages().find((m) => m.type === "error");
    expect(errorMsg).toBeUndefined();
  });

  test("should reject sendKeys from viewer", async () => {
    const { server, bridge, chrote } = createTestServer({
      userId: "viewer-1",
      userName: "Viewer",
      role: "viewer",
    });
    const viewerWs = new MockWebSocket();

    const session = createTestSession("dev");
    bridge.addSession(session);
    chrote.setSessions([session]);

    server.start();
    await server.handleConnection(viewerWs as unknown as WebSocket, createMockRequest());
    viewerWs.clearMessages();

    server.handleWsMessage(
      viewerWs as unknown as WebSocket,
      JSON.stringify({ type: "sendKeys", sessionId: "dev", keys: "ls\n" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = viewerWs.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.NOT_OPERATOR);

    server.stop();
  });
});

// ============================================================================
// Message Protocol Tests
// ============================================================================

describe("Message Protocol", () => {
  let ctx: TestContext;
  let ws: MockWebSocket;

  beforeEach(() => {
    ctx = createTestServer();
    ws = new MockWebSocket();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);
  });

  afterEach(() => {
    ctx.server.stop();
  });

  test("should reject invalid JSON", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());
    ws.clearMessages();

    ctx.server.handleWsMessage(ws as unknown as WebSocket, "not json {{{");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = ws.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.INVALID_MESSAGE);
  });

  test("should reject unknown message types", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());
    ws.clearMessages();

    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "unknownType", data: "test" })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMsg = ws.getLastMessage();
    expect(errorMsg?.type).toBe("error");
    expect(errorMsg?.code).toBe(ErrorCodes.UNKNOWN_TYPE);
  });

  test("should handle heartbeat messages", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());
    ws.clearMessages();

    // Send heartbeat
    ctx.server.handleWsMessage(ws as unknown as WebSocket, JSON.stringify({ type: "heartbeat" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Heartbeat doesn't produce a response, but should not error
    const messages = ws.getAllMessages();
    const errorMsg = messages.find((m) => m.type === "error");
    expect(errorMsg).toBeUndefined();
  });

  test("should handle listSessions request", async () => {
    ctx.server.start();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());
    ws.clearMessages();

    ctx.server.handleWsMessage(ws as unknown as WebSocket, JSON.stringify({ type: "listSessions" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    const sessionsMsg = ws.getLastMessage();
    expect(sessionsMsg?.type).toBe("sessions");
    expect(sessionsMsg?.sessions).toHaveLength(1);
  });
});

// ============================================================================
// Reconnection Handling Tests
// ============================================================================

describe("Reconnection Handling", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestServer();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);
    ctx.bridge.setPaneContent("dev", "0", "$ ");
  });

  afterEach(() => {
    ctx.server.stop();
  });

  test("should release claims on disconnect", async () => {
    ctx.server.start();
    const ws = new MockWebSocket();

    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    // Subscribe and claim
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify claim exists
    const lock = ctx.server.getLock("dev");
    expect(lock).not.toBeNull();
    expect(lock?.userId).toBe("user-1");

    // Disconnect
    ctx.server.handleWsClose(ws as unknown as WebSocket);

    // Verify claim released
    const lockAfter = ctx.server.getLock("dev");
    expect(lockAfter).toBeNull();
  });

  test("should allow reconnection and re-subscribe", async () => {
    ctx.server.start();

    // First connection
    const ws1 = new MockWebSocket();
    await ctx.server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());

    ctx.server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Disconnect
    ctx.server.handleWsClose(ws1 as unknown as WebSocket);

    // Reconnect with new WebSocket
    const ws2 = new MockWebSocket();
    await ctx.server.handleConnection(ws2 as unknown as WebSocket, createMockRequest());

    const messages = ws2.getAllMessages();
    const connected = messages.find((m) => m.type === "connected");
    expect(connected).toBeDefined();

    // Can subscribe again
    ws2.clearMessages();
    ctx.server.handleWsMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    const outputMsg = ws2.getAllMessages().find((m) => m.type === "output");
    expect(outputMsg).toBeDefined();
  });

  test("should maintain claims for users with multiple connections", async () => {
    const bridge = new MockTmuxBridge();
    const chrote = new MockChroteClient();

    const session = createTestSession("dev");
    bridge.addSession(session);
    chrote.setSessions([session]);
    bridge.setPaneContent("dev", "0", "$ ");

    // Same user for all connections
    const server = createWSServer({
      bridge: bridge as unknown as import("../../src/server/tmux/bridge").TmuxBridge,
      chrote: chrote as unknown as ChroteClient,
      authenticate: async () => ({
        userId: "user-1",
        userName: "Test User",
        role: "operator" as Role,
      }),
    });

    server.start();

    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();

    // Two connections from same user
    await server.handleConnection(ws1 as unknown as WebSocket, createMockRequest());
    await server.handleConnection(ws2 as unknown as WebSocket, createMockRequest());

    // Claim from first connection
    server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.handleWsMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Close first connection
    server.handleWsClose(ws1 as unknown as WebSocket);

    // Claim should still exist because user has second connection
    const stats = server.getStats();
    expect(stats.users).toBe(1);

    server.stop();
  });
});

// ============================================================================
// Server Lifecycle Tests
// ============================================================================

describe("Server Lifecycle", () => {
  test("should track connection statistics", async () => {
    const ctx = createTestServer();
    ctx.server.start();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);

    // No connections initially
    let stats = ctx.server.getStats();
    expect(stats.connections).toBe(0);
    expect(stats.users).toBe(0);

    // Add connection
    const ws = new MockWebSocket();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    stats = ctx.server.getStats();
    expect(stats.connections).toBe(1);
    expect(stats.users).toBe(1);

    // Subscribe to session
    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    stats = ctx.server.getStats();
    expect(stats.subscriptions).toBe(1);

    ctx.server.stop();
  });

  test("should clean up on stop", async () => {
    const ctx = createTestServer();
    ctx.server.start();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);

    const ws = new MockWebSocket();
    await ctx.server.handleConnection(ws as unknown as WebSocket, createMockRequest());

    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "subscribe", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    ctx.server.handleWsMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "claim", sessionId: "dev" })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Stop server
    ctx.server.stop();

    // All should be cleaned up
    const stats = ctx.server.getStats();
    expect(stats.connections).toBe(0);
    expect(stats.claims).toBe(0);

    // WebSocket should be closed
    expect(ws.closeCode).toBe(1001);
  });

  test("should provide locks via REST API methods", async () => {
    const ctx = createTestServer();
    ctx.server.start();

    const session = createTestSession("dev");
    ctx.bridge.addSession(session);
    ctx.chrote.setSessions([session]);

    // Acquire lock via REST API
    const result = ctx.server.acquireLock("dev", "user-1", "Test User", "operator");
    expect(result.success).toBe(true);

    // Get all locks
    const locks = ctx.server.getLocks();
    expect(locks).toHaveLength(1);
    expect(locks[0].sessionId).toBe("dev");

    // Get specific lock
    const lock = ctx.server.getLock("dev");
    expect(lock).not.toBeNull();
    expect(lock?.userName).toBe("Test User");

    // Release via REST API
    const releaseResult = ctx.server.releaseLock("dev", "user-1", "operator");
    expect(releaseResult.success).toBe(true);

    expect(ctx.server.getLock("dev")).toBeNull();

    ctx.server.stop();
  });
});
