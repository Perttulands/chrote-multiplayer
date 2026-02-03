/**
 * WebSocket Server
 *
 * Real-time terminal streaming and presence management.
 * Handles authentication, subscriptions, and message routing.
 */

import { nanoid } from "nanoid";
import type { Server as HTTPServer } from "http";
import type {
  ClientMessage,
  ServerMessage,
  ClientState,
  ClaimState,
  ErrorCode,
  PresenceUser,
} from "./types";
import { ErrorCodes } from "./types";
import { TmuxBridge, TmuxPoller, getTmuxBridge, createTmuxPoller } from "../tmux";
import type { TmuxSession, TmuxEvent } from "../tmux/types";
import { ROLE_HIERARCHY, type Role } from "../../db/schema";

/** Heartbeat timeout: 30 seconds */
const HEARTBEAT_TIMEOUT_MS = 30 * 1000;

/** Heartbeat check interval: 10 seconds */
const HEARTBEAT_CHECK_INTERVAL = 10 * 1000;

export interface WSServerOptions {
  /** Custom tmux bridge (for testing) */
  bridge?: TmuxBridge;
  /** Authentication function: returns user info or null */
  authenticate: (
    request: Request
  ) => Promise<{ userId: string; userName: string; role: Role } | null>;
}

interface WebSocketWithState {
  ws: WebSocket;
  state: ClientState;
}

export class TerminalWSServer {
  private bridge: TmuxBridge;
  private poller: TmuxPoller;
  private authenticate: WSServerOptions["authenticate"];

  /** Connected clients by client ID */
  private clients: Map<string, WebSocketWithState> = new Map();

  /** User ID to client IDs mapping (one user can have multiple connections) */
  private userClients: Map<string, Set<string>> = new Map();

  /** Active claims by session ID */
  private claims: Map<string, ClaimState> = new Map();

  /** Heartbeat check timer */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WSServerOptions) {
    this.bridge = options.bridge ?? getTmuxBridge();
    this.poller = createTmuxPoller(this.bridge);
    this.authenticate = options.authenticate;

    // Wire up poller events
    this.poller.on("event", (event: TmuxEvent) => this.handleTmuxEvent(event));
    this.poller.on("sessions", (sessions: TmuxSession[]) =>
      this.broadcastSessions(sessions)
    );
    this.poller.on("error", (err: Error) => {
      console.error("[WS] Poller error:", err.message);
    });
  }

  /**
   * Start the WebSocket server
   */
  start(): void {
    this.poller.start();

    // Start heartbeat checker
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, HEARTBEAT_CHECK_INTERVAL);

    console.log("[WS] Terminal WebSocket server started");
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    this.poller.stop();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections
    for (const { ws } of this.clients.values()) {
      ws.close(1001, "Server shutting down");
    }
    this.clients.clear();
    this.userClients.clear();
    this.claims.clear();

    console.log("[WS] Terminal WebSocket server stopped");
  }

  /**
   * Handle new WebSocket connection (call from Bun/Hono upgrade handler)
   */
  async handleConnection(ws: WebSocket, request: Request): Promise<void> {
    // Authenticate
    const auth = await this.authenticate(request);
    if (!auth) {
      this.sendError(ws, ErrorCodes.AUTH_REQUIRED, "Authentication required");
      ws.close(4001, "Authentication required");
      return;
    }

    // Create client state
    const clientId = nanoid();
    const state: ClientState = {
      id: clientId,
      userId: auth.userId,
      userName: auth.userName,
      role: auth.role,
      subscriptions: new Set(),
      lastHeartbeat: new Date(),
    };

    this.clients.set(clientId, { ws, state });

    // Track user -> clients mapping
    if (!this.userClients.has(auth.userId)) {
      this.userClients.set(auth.userId, new Set());
    }
    this.userClients.get(auth.userId)!.add(clientId);

    // Send connected message
    this.send(ws, {
      type: "connected",
      userId: auth.userId,
      role: auth.role,
    });

    // Send current sessions list
    const sessions = await this.bridge.listSessions();
    this.send(ws, { type: "sessions", sessions });

    console.log(`[WS] Client connected: ${clientId} (user: ${auth.userName})`);

    // Set up message handler
    ws.addEventListener("message", (event) => {
      this.handleMessage(clientId, event.data as string);
    });

    // Set up close handler
    ws.addEventListener("close", () => {
      this.handleDisconnect(clientId);
    });

    ws.addEventListener("error", (event) => {
      console.error(`[WS] Client error: ${clientId}`, event);
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(clientId: string, rawMessage: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { ws, state } = client;

    let message: ClientMessage;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.sendError(ws, ErrorCodes.INVALID_MESSAGE, "Invalid JSON");
      return;
    }

    // Update heartbeat on any message
    state.lastHeartbeat = new Date();

    try {
      switch (message.type) {
        case "subscribe":
          await this.handleSubscribe(client, message.sessionId, message.pane);
          break;

        case "unsubscribe":
          this.handleUnsubscribe(client, message.sessionId, message.pane);
          break;

        case "sendKeys":
          await this.handleSendKeys(client, message.sessionId, message.keys, message.pane);
          break;

        case "heartbeat":
          // Already updated lastHeartbeat above
          break;

        case "claim":
          await this.handleClaim(client, message.sessionId);
          break;

        case "release":
          this.handleRelease(client, message.sessionId);
          break;

        case "listSessions":
          const sessions = await this.bridge.listSessions();
          this.send(ws, { type: "sessions", sessions });
          break;

        default:
          this.sendError(
            ws,
            ErrorCodes.UNKNOWN_TYPE,
            `Unknown message type: ${(message as { type: string }).type}`
          );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Internal error";
      console.error(`[WS] Error handling message:`, err);
      this.sendError(ws, ErrorCodes.INTERNAL_ERROR, errMsg);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { state } = client;

    // Remove from user -> clients mapping
    const userClientIds = this.userClients.get(state.userId);
    if (userClientIds) {
      userClientIds.delete(clientId);
      if (userClientIds.size === 0) {
        this.userClients.delete(state.userId);
      }
    }

    // Unsubscribe from all sessions
    for (const sessionId of state.subscriptions) {
      this.poller.unsubscribe(sessionId);
      this.broadcastPresence(sessionId);
    }

    // Release any claims held by this user (if no other connections)
    if (!this.userClients.has(state.userId)) {
      for (const [sessionId, claim] of this.claims) {
        if (claim.userId === state.userId) {
          this.claims.delete(sessionId);
          this.broadcast(sessionId, { type: "released", sessionId });
        }
      }
    }

    this.clients.delete(clientId);
    console.log(`[WS] Client disconnected: ${clientId}`);
  }

  /**
   * Handle subscribe request
   */
  private async handleSubscribe(
    client: WebSocketWithState,
    sessionId: string,
    pane?: string
  ): Promise<void> {
    const { ws, state } = client;
    const paneId = pane ?? "0";

    // Check session exists
    const session = await this.bridge.getSession(sessionId);
    if (!session) {
      this.sendError(ws, ErrorCodes.SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
      return;
    }

    // Subscribe
    state.subscriptions.add(sessionId);
    this.poller.subscribe(sessionId, paneId);

    // Send initial output
    try {
      const content = await this.poller.forceRefresh(sessionId, paneId);
      this.send(ws, {
        type: "output",
        sessionId,
        pane: paneId,
        data: content,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[WS] Error getting initial output:`, err);
    }

    // Send current lock state for this session
    const claim = this.claims.get(sessionId);
    if (claim) {
      this.send(ws, {
        type: "claimed",
        sessionId,
        by: { id: claim.userId, name: claim.userName },
      });
    }

    // Broadcast updated presence
    this.broadcastPresence(sessionId);
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(
    client: WebSocketWithState,
    sessionId: string,
    pane?: string
  ): void {
    const { state } = client;

    state.subscriptions.delete(sessionId);

    // Only unsubscribe from poller if no other clients watching
    const stillWatching = Array.from(this.clients.values()).some(
      (c) => c.state.subscriptions.has(sessionId)
    );
    if (!stillWatching) {
      this.poller.unsubscribe(sessionId, pane);
    }

    this.broadcastPresence(sessionId);
  }

  /**
   * Handle sendKeys request
   */
  private async handleSendKeys(
    client: WebSocketWithState,
    sessionId: string,
    keys: string,
    pane?: string
  ): Promise<void> {
    const { ws, state } = client;

    // Check permission - must be operator+
    if (ROLE_HIERARCHY[state.role] < ROLE_HIERARCHY.operator) {
      this.sendError(
        ws,
        ErrorCodes.NOT_OPERATOR,
        "Only operators can send keys"
      );
      return;
    }

    // Check claim - must have control of this session
    const claim = this.claims.get(sessionId);
    if (!claim || claim.userId !== state.userId) {
      this.sendError(
        ws,
        ErrorCodes.NOT_CLAIMED,
        "You must claim the session before sending keys"
      );
      return;
    }

    // Send keys
    try {
      await this.bridge.sendKeys(sessionId, keys, pane ?? "0");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send keys";
      this.sendError(ws, ErrorCodes.TMUX_ERROR, msg);
    }
  }

  /**
   * Handle claim request
   */
  private async handleClaim(
    client: WebSocketWithState,
    sessionId: string
  ): Promise<void> {
    const { ws, state } = client;

    // Check permission - must be operator+
    if (ROLE_HIERARCHY[state.role] < ROLE_HIERARCHY.operator) {
      this.sendError(
        ws,
        ErrorCodes.NOT_OPERATOR,
        "Only operators can claim sessions"
      );
      return;
    }

    // Check if already claimed by someone else
    const existingClaim = this.claims.get(sessionId);
    if (existingClaim && existingClaim.userId !== state.userId) {
      // Check if admin can override
      if (ROLE_HIERARCHY[state.role] < ROLE_HIERARCHY.admin) {
        this.sendError(
          ws,
          ErrorCodes.SESSION_CLAIMED,
          `Session claimed by ${existingClaim.userName}`
        );
        return;
      }
      // Admin override - notify previous holder
      this.notifyUser(existingClaim.userId, {
        type: "released",
        sessionId,
      });
    }

    // Create claim
    const claim: ClaimState = {
      sessionId,
      userId: state.userId,
      userName: state.userName,
    };
    this.claims.set(sessionId, claim);

    // Broadcast claim
    this.broadcast(sessionId, {
      type: "claimed",
      sessionId,
      by: { id: state.userId, name: state.userName },
    });

    // Update presence
    this.broadcastPresence(sessionId);
  }

  /**
   * Handle release request
   */
  private handleRelease(client: WebSocketWithState, sessionId: string): void {
    const { ws, state } = client;

    const claim = this.claims.get(sessionId);
    if (!claim) {
      this.sendError(ws, ErrorCodes.NOT_CLAIMED, "Session not claimed");
      return;
    }

    // Only the holder or admin can release
    if (
      claim.userId !== state.userId &&
      ROLE_HIERARCHY[state.role] < ROLE_HIERARCHY.admin
    ) {
      this.sendError(ws, ErrorCodes.PERMISSION_DENIED, "Cannot release others' claims");
      return;
    }

    this.claims.delete(sessionId);

    // Broadcast release
    this.broadcast(sessionId, { type: "released", sessionId });
    this.broadcastPresence(sessionId);
  }

  /**
   * Handle tmux event from poller
   */
  private handleTmuxEvent(event: TmuxEvent): void {
    switch (event.type) {
      case "output":
        this.broadcast(event.session, {
          type: "output",
          sessionId: event.session,
          pane: event.pane,
          data: event.content,
          timestamp: new Date().toISOString(),
        });
        break;

      case "session_created":
        this.broadcastAll({
          type: "sessionCreated",
          session: event.session,
        });
        break;

      case "session_destroyed":
        // Release any claims on destroyed session
        this.claims.delete(event.sessionName);

        this.broadcastAll({
          type: "sessionDestroyed",
          sessionId: event.sessionName,
        });
        break;
    }
  }

  /**
   * Broadcast sessions list update
   */
  private broadcastSessions(sessions: TmuxSession[]): void {
    this.broadcastAll({ type: "sessions", sessions });
  }

  /**
   * Broadcast presence for a session
   */
  private broadcastPresence(sessionId: string): void {
    const users: PresenceUser[] = [];
    const claim = this.claims.get(sessionId);

    for (const { state } of this.clients.values()) {
      if (state.subscriptions.has(sessionId)) {
        users.push({
          id: state.userId,
          name: state.userName,
          status: claim?.userId === state.userId ? "controlling" : "viewing",
        });
      }
    }

    // Deduplicate by user ID (one user can have multiple connections)
    const uniqueUsers = Array.from(
      new Map(users.map((u) => [u.id, u])).values()
    );

    this.broadcast(sessionId, {
      type: "presence",
      sessionId,
      users: uniqueUsers,
    });
  }

  /**
   * Check for stale heartbeats and disconnect
   */
  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [clientId, { ws, state }] of this.clients) {
      if (now - state.lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[WS] Heartbeat timeout: ${clientId}`);
        ws.close(4000, "Heartbeat timeout");
        // handleDisconnect will be called by close event
      }
    }
  }

  /**
   * Send message to a single client
   */
  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to a single client
   */
  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    this.send(ws, { type: "error", code, message });
  }

  /**
   * Broadcast to all clients subscribed to a session
   */
  private broadcast(sessionId: string, message: ServerMessage): void {
    for (const { ws, state } of this.clients.values()) {
      if (state.subscriptions.has(sessionId)) {
        this.send(ws, message);
      }
    }
  }

  /**
   * Broadcast to all connected clients
   */
  private broadcastAll(message: ServerMessage): void {
    for (const { ws } of this.clients.values()) {
      this.send(ws, message);
    }
  }

  /**
   * Send message to all connections of a specific user
   */
  private notifyUser(userId: string, message: ServerMessage): void {
    const clientIds = this.userClients.get(userId);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        this.send(client.ws, message);
      }
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connections: number;
    users: number;
    subscriptions: number;
    claims: number;
  } {
    return {
      connections: this.clients.size,
      users: this.userClients.size,
      subscriptions: this.poller.getSubscriptions().size,
      claims: this.claims.size,
    };
  }

  /**
   * Get all current locks (for REST API)
   */
  getLocks(): Array<{ sessionId: string; userId: string; userName: string }> {
    return Array.from(this.claims.values()).map((claim) => ({
      sessionId: claim.sessionId,
      userId: claim.userId,
      userName: claim.userName,
    }));
  }

  /**
   * Get lock for a specific session (for REST API)
   */
  getLock(sessionId: string): ClaimState | null {
    return this.claims.get(sessionId) ?? null;
  }

  /**
   * Acquire lock via REST API
   * Returns true if lock acquired, false if already locked by another user
   */
  acquireLock(
    sessionId: string,
    userId: string,
    userName: string,
    role: Role
  ): { success: boolean; error?: string; lockedBy?: { id: string; name: string } } {
    // Check permission - must be operator+
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY.operator) {
      return { success: false, error: "Only operators can acquire locks" };
    }

    // Check if already claimed by someone else
    const existingClaim = this.claims.get(sessionId);
    if (existingClaim && existingClaim.userId !== userId) {
      // Check if admin can override
      if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY.admin) {
        return {
          success: false,
          error: `Session locked by ${existingClaim.userName}`,
          lockedBy: { id: existingClaim.userId, name: existingClaim.userName },
        };
      }
      // Admin override - notify previous holder
      this.notifyUser(existingClaim.userId, {
        type: "released",
        sessionId,
      });
    }

    // Create claim
    const claim: ClaimState = {
      sessionId,
      userId,
      userName,
    };
    this.claims.set(sessionId, claim);

    // Broadcast claim to all subscribed clients
    this.broadcast(sessionId, {
      type: "claimed",
      sessionId,
      by: { id: userId, name: userName },
    });

    // Also broadcast to all clients so non-subscribers can see lock state
    this.broadcastAll({
      type: "claimed",
      sessionId,
      by: { id: userId, name: userName },
    });

    this.broadcastPresence(sessionId);

    return { success: true };
  }

  /**
   * Release lock via REST API
   * Returns true if released, false if not allowed
   */
  releaseLock(
    sessionId: string,
    userId: string,
    role: Role
  ): { success: boolean; error?: string } {
    const claim = this.claims.get(sessionId);
    if (!claim) {
      return { success: false, error: "Session not locked" };
    }

    // Only the holder or admin can release
    if (claim.userId !== userId && ROLE_HIERARCHY[role] < ROLE_HIERARCHY.admin) {
      return { success: false, error: "Cannot release others' locks" };
    }

    this.claims.delete(sessionId);

    // Broadcast release
    this.broadcast(sessionId, { type: "released", sessionId });
    this.broadcastAll({ type: "released", sessionId });
    this.broadcastPresence(sessionId);

    return { success: true };
  }
}

/**
 * Create a new WebSocket server instance
 */
export function createWSServer(options: WSServerOptions): TerminalWSServer {
  return new TerminalWSServer(options);
}
