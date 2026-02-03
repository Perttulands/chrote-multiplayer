/**
 * WebSocket Protocol Unit Tests
 *
 * Tests for WebSocket message types and protocol logic.
 */

import { describe, it, expect } from "bun:test";

// Import types (these are pure TypeScript, no runtime deps)
import type {
  ClientMessage,
  ServerMessage,
  ClientState,
  ClaimState,
  PresenceUser,
} from "../../src/server/ws/types";
import { ErrorCodes } from "../../src/server/ws/types";

describe("Client Message Types", () => {
  it("should validate subscribe message", () => {
    const msg: ClientMessage = {
      type: "subscribe",
      sessionId: "dev",
      pane: "0",
    };

    expect(msg.type).toBe("subscribe");
    expect(msg.sessionId).toBe("dev");
    expect(msg.pane).toBe("0");
  });

  it("should validate unsubscribe message", () => {
    const msg: ClientMessage = {
      type: "unsubscribe",
      sessionId: "dev",
    };

    expect(msg.type).toBe("unsubscribe");
    expect(msg.sessionId).toBe("dev");
  });

  it("should validate sendKeys message", () => {
    const msg: ClientMessage = {
      type: "sendKeys",
      sessionId: "dev",
      keys: "ls -la\n",
      pane: "0",
    };

    expect(msg.type).toBe("sendKeys");
    expect(msg.sessionId).toBe("dev");
    expect(msg.keys).toBe("ls -la\n");
  });

  it("should validate heartbeat message", () => {
    const msg: ClientMessage = {
      type: "heartbeat",
    };

    expect(msg.type).toBe("heartbeat");
  });

  it("should validate claim message", () => {
    const msg: ClientMessage = {
      type: "claim",
      sessionId: "dev",
    };

    expect(msg.type).toBe("claim");
    expect(msg.sessionId).toBe("dev");
  });

  it("should validate release message", () => {
    const msg: ClientMessage = {
      type: "release",
      sessionId: "dev",
    };

    expect(msg.type).toBe("release");
    expect(msg.sessionId).toBe("dev");
  });

  it("should validate listSessions message", () => {
    const msg: ClientMessage = {
      type: "listSessions",
    };

    expect(msg.type).toBe("listSessions");
  });
});

describe("Server Message Types", () => {
  it("should validate output message", () => {
    const msg: ServerMessage = {
      type: "output",
      sessionId: "dev",
      pane: "0",
      data: "Hello World",
      timestamp: new Date().toISOString(),
    };

    expect(msg.type).toBe("output");
    expect(msg.sessionId).toBe("dev");
    expect(msg.data).toBe("Hello World");
  });

  it("should validate presence message", () => {
    const users: PresenceUser[] = [
      { id: "user1", name: "Alice", status: "controlling" },
      { id: "user2", name: "Bob", status: "viewing" },
    ];

    const msg: ServerMessage = {
      type: "presence",
      sessionId: "dev",
      users,
    };

    expect(msg.type).toBe("presence");
    expect(msg.users).toHaveLength(2);
    expect(msg.users[0].status).toBe("controlling");
    expect(msg.users[1].status).toBe("viewing");
  });

  it("should validate claimed message", () => {
    const msg: ServerMessage = {
      type: "claimed",
      sessionId: "dev",
      by: { id: "user1", name: "Alice" },
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    expect(msg.type).toBe("claimed");
    expect(msg.by.name).toBe("Alice");
  });

  it("should validate released message", () => {
    const msg: ServerMessage = {
      type: "released",
      sessionId: "dev",
    };

    expect(msg.type).toBe("released");
    expect(msg.sessionId).toBe("dev");
  });

  it("should validate error message", () => {
    const msg: ServerMessage = {
      type: "error",
      code: ErrorCodes.PERMISSION_DENIED,
      message: "Only operators can claim sessions",
    };

    expect(msg.type).toBe("error");
    expect(msg.code).toBe("PERMISSION_DENIED");
  });

  it("should validate sessions message", () => {
    const msg: ServerMessage = {
      type: "sessions",
      sessions: [
        {
          name: "dev",
          windows: 2,
          attached: 1,
          created: new Date(),
          id: "$0",
        },
      ],
    };

    expect(msg.type).toBe("sessions");
    expect(msg.sessions).toHaveLength(1);
    expect(msg.sessions[0].name).toBe("dev");
  });

  it("should validate connected message", () => {
    const msg: ServerMessage = {
      type: "connected",
      userId: "user1",
      role: "operator",
    };

    expect(msg.type).toBe("connected");
    expect(msg.userId).toBe("user1");
    expect(msg.role).toBe("operator");
  });
});

describe("Error Codes", () => {
  it("should have authentication error codes", () => {
    expect(ErrorCodes.AUTH_REQUIRED).toBe("AUTH_REQUIRED");
    expect(ErrorCodes.AUTH_INVALID).toBe("AUTH_INVALID");
    expect(ErrorCodes.AUTH_EXPIRED).toBe("AUTH_EXPIRED");
  });

  it("should have permission error codes", () => {
    expect(ErrorCodes.PERMISSION_DENIED).toBe("PERMISSION_DENIED");
    expect(ErrorCodes.NOT_OPERATOR).toBe("NOT_OPERATOR");
  });

  it("should have session error codes", () => {
    expect(ErrorCodes.SESSION_NOT_FOUND).toBe("SESSION_NOT_FOUND");
    expect(ErrorCodes.SESSION_CLAIMED).toBe("SESSION_CLAIMED");
    expect(ErrorCodes.NOT_CLAIMED).toBe("NOT_CLAIMED");
  });

  it("should have protocol error codes", () => {
    expect(ErrorCodes.INVALID_MESSAGE).toBe("INVALID_MESSAGE");
    expect(ErrorCodes.UNKNOWN_TYPE).toBe("UNKNOWN_TYPE");
  });

  it("should have server error codes", () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCodes.TMUX_ERROR).toBe("TMUX_ERROR");
  });
});

describe("Client State", () => {
  it("should track subscriptions", () => {
    const state: ClientState = {
      id: "client1",
      userId: "user1",
      userName: "Alice",
      role: "operator",
      subscriptions: new Set(["dev", "main"]),
      lastHeartbeat: new Date(),
    };

    expect(state.subscriptions.has("dev")).toBe(true);
    expect(state.subscriptions.has("main")).toBe(true);
    expect(state.subscriptions.has("other")).toBe(false);
    expect(state.subscriptions.size).toBe(2);
  });

  it("should update subscriptions", () => {
    const state: ClientState = {
      id: "client1",
      userId: "user1",
      userName: "Alice",
      role: "operator",
      subscriptions: new Set(),
      lastHeartbeat: new Date(),
    };

    state.subscriptions.add("dev");
    expect(state.subscriptions.size).toBe(1);

    state.subscriptions.delete("dev");
    expect(state.subscriptions.size).toBe(0);
  });
});

describe("Claim State", () => {
  it("should track claim expiration", () => {
    const CLAIM_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    const claim: ClaimState = {
      sessionId: "dev",
      userId: "user1",
      userName: "Alice",
      expiresAt: new Date(now + CLAIM_EXPIRY_MS),
    };

    // Should not be expired yet
    expect(claim.expiresAt.getTime()).toBeGreaterThan(now);

    // Calculate time remaining
    const timeRemaining = claim.expiresAt.getTime() - now;
    expect(timeRemaining).toBeCloseTo(CLAIM_EXPIRY_MS, -3);
  });

  it("should detect expired claims", () => {
    const claim: ClaimState = {
      sessionId: "dev",
      userId: "user1",
      userName: "Alice",
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    };

    const isExpired = Date.now() > claim.expiresAt.getTime();
    expect(isExpired).toBe(true);
  });
});

describe("Presence Logic", () => {
  it("should deduplicate users by ID", () => {
    const users: PresenceUser[] = [
      { id: "user1", name: "Alice", status: "viewing" },
      { id: "user1", name: "Alice", status: "controlling" }, // Same user, different connection
      { id: "user2", name: "Bob", status: "viewing" },
    ];

    // Deduplicate, keeping last status
    const uniqueUsers = Array.from(
      new Map(users.map((u) => [u.id, u])).values()
    );

    expect(uniqueUsers).toHaveLength(2);
    expect(uniqueUsers.find((u) => u.id === "user1")?.status).toBe(
      "controlling"
    );
  });

  it("should determine controlling status from claims", () => {
    const claimUserId = "user1";
    const presenceUserId = "user1";

    const status =
      claimUserId === presenceUserId ? "controlling" : "viewing";
    expect(status).toBe("controlling");
  });
});

describe("Heartbeat Logic", () => {
  it("should detect stale heartbeats", () => {
    const HEARTBEAT_TIMEOUT_MS = 30 * 1000; // 30 seconds
    const lastHeartbeat = new Date(Date.now() - 31000); // 31 seconds ago
    const now = Date.now();

    const isStale = now - lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT_MS;
    expect(isStale).toBe(true);
  });

  it("should detect fresh heartbeats", () => {
    const HEARTBEAT_TIMEOUT_MS = 30 * 1000;
    const lastHeartbeat = new Date(Date.now() - 5000); // 5 seconds ago
    const now = Date.now();

    const isStale = now - lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT_MS;
    expect(isStale).toBe(false);
  });
});

describe("Message Parsing", () => {
  it("should parse valid JSON messages", () => {
    const raw = '{"type":"subscribe","sessionId":"dev"}';
    const msg = JSON.parse(raw) as ClientMessage;

    expect(msg.type).toBe("subscribe");
    expect((msg as any).sessionId).toBe("dev");
  });

  it("should handle invalid JSON", () => {
    const raw = "not valid json";

    expect(() => JSON.parse(raw)).toThrow();
  });

  it("should handle unknown message types", () => {
    const raw = '{"type":"unknown","data":"test"}';
    const msg = JSON.parse(raw);

    const validTypes = [
      "subscribe",
      "unsubscribe",
      "sendKeys",
      "heartbeat",
      "claim",
      "release",
      "listSessions",
    ];
    const isValidType = validTypes.includes(msg.type);

    expect(isValidType).toBe(false);
  });
});

describe("Role Hierarchy for Claims", () => {
  const ROLE_HIERARCHY = {
    viewer: 0,
    operator: 1,
    admin: 2,
    owner: 3,
  } as const;

  it("should require operator for sendKeys", () => {
    const userRole = "viewer";
    const requiredRole = "operator";

    const canSendKeys =
      ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
    expect(canSendKeys).toBe(false);
  });

  it("should allow operator to claim", () => {
    const userRole = "operator";
    const requiredRole = "operator";

    const canClaim =
      ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
    expect(canClaim).toBe(true);
  });

  it("should allow admin to override claims", () => {
    const userRole = "admin";
    const requiredRole = "admin";

    const canOverride =
      ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
    expect(canOverride).toBe(true);
  });
});
