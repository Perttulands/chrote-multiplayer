/**
 * Per-Session WebSocket Handler
 *
 * Dedicated WebSocket connections for individual terminal sessions.
 * Provides a simpler protocol than the main WS server:
 * - Auto-subscribes to the specified session on connect
 * - Streams only that session's output
 * - Supports sendKeys for operators with claim
 */

import { nanoid } from "nanoid";
import type { Role } from "../../db/schema";
import { ROLE_HIERARCHY } from "../../db/schema";
import type { WSAuthResult } from "./auth";
import { TmuxBridge, TmuxPoller, getTmuxBridge, createTmuxPoller } from "../tmux";
import { ChroteClient, getChroteClient } from "../chrote";
import type { TmuxEvent } from "../tmux/types";

/** Heartbeat timeout: 30 seconds */
const HEARTBEAT_TIMEOUT_MS = 30 * 1000;

/** Heartbeat check interval: 10 seconds */
const HEARTBEAT_CHECK_INTERVAL = 10 * 1000;

// ============================================================================
// Message Types
// ============================================================================

/** Client -> Server messages for per-session WS */
export interface PerSessionClientMessage {
  type: "sendKeys" | "heartbeat";
  keys?: string;
  pane?: string;
}

/** Server -> Client messages for per-session WS */
export type PerSessionServerMessage =
  | { type: "connected"; sessionId: string; userId: string; role: Role }
  | { type: "output"; sessionId: string; pane: string; data: string; timestamp: string }
  | { type: "error"; code: string; message: string };

// ============================================================================
// Connection State
// ============================================================================

interface PerSessionClient {
  ws: WebSocket;
  clientId: string;
  sessionId: string;
  userId: string;
  userName: string;
  role: Role;
  pane: string;
  lastHeartbeat: Date;
}

// Reverse mapping from WebSocket to clientId
const wsToClientId = new WeakMap<WebSocket, string>();

// ============================================================================
// Per-Session WebSocket Server
// ============================================================================

export interface PerSessionWSServerOptions {
  /** Custom tmux bridge (for testing) */
  bridge?: TmuxBridge;
  /** Custom CHROTE client (for testing) */
  chrote?: ChroteClient;
  /** Function to get claim info for a session */
  getClaimHolder?: (sessionId: string) => { userId: string } | null;
}

export class PerSessionWSServer {
  private bridge: TmuxBridge;
  private chrote: ChroteClient;
  private poller: TmuxPoller;
  private getClaimHolder: (sessionId: string) => { userId: string } | null;

  /** Connected clients by client ID */
  private clients: Map<string, PerSessionClient> = new Map();

  /** Session ID -> Set of client IDs subscribed to it */
  private sessionClients: Map<string, Set<string>> = new Map();

  /** Heartbeat check timer */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PerSessionWSServerOptions = {}) {
    this.bridge = options.bridge ?? getTmuxBridge();
    this.chrote = options.chrote ?? getChroteClient();
    this.poller = createTmuxPoller(this.bridge, this.chrote);
    this.getClaimHolder = options.getClaimHolder ?? (() => null);

    // Wire up poller events
    this.poller.on("event", (event: TmuxEvent) => this.handleTmuxEvent(event));
    this.poller.on("error", (err: Error) => {
      console.error("[PerSessionWS] Poller error:", err.message);
    });
  }

  /**
   * Start the per-session WebSocket server
   */
  start(): void {
    this.poller.start();

    // Start heartbeat checker
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, HEARTBEAT_CHECK_INTERVAL);

    console.log("[PerSessionWS] Per-session WebSocket server started");
  }

  /**
   * Stop the per-session WebSocket server
   */
  stop(): void {
    this.poller.stop();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, "Server shutting down");
    }
    this.clients.clear();
    this.sessionClients.clear();

    console.log("[PerSessionWS] Per-session WebSocket server stopped");
  }

  /**
   * Handle new WebSocket connection for a specific session
   */
  async handleConnection(
    ws: WebSocket,
    auth: WSAuthResult,
    sessionId: string,
    pane: string = "0"
  ): Promise<void> {
    // Verify session exists
    const session = await this.bridge.getSession(sessionId);
    if (!session) {
      this.sendError(ws, "SESSION_NOT_FOUND", `Session not found: ${sessionId}`);
      ws.close(4004, "Session not found");
      return;
    }

    // Create client state
    const clientId = nanoid();
    const client: PerSessionClient = {
      ws,
      clientId,
      sessionId,
      userId: auth.userId,
      userName: auth.userName,
      role: auth.role,
      pane,
      lastHeartbeat: new Date(),
    };

    this.clients.set(clientId, client);
    wsToClientId.set(ws, clientId);

    // Track session -> clients mapping
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    this.sessionClients.get(sessionId)!.add(clientId);

    // Subscribe to this session in poller
    this.poller.subscribe(sessionId, pane);

    // Send connected message
    this.send(ws, {
      type: "connected",
      sessionId,
      userId: auth.userId,
      role: auth.role,
    });

    // Send initial output
    try {
      const content = await this.poller.forceRefresh(sessionId, pane);
      this.send(ws, {
        type: "output",
        sessionId,
        pane,
        data: content,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[PerSessionWS] Error getting initial output:`, err);
    }

    console.log(
      `[PerSessionWS] Client ${clientId} connected to session ${sessionId} (user: ${auth.userName})`
    );
  }

  /**
   * Handle WebSocket message
   */
  handleWsMessage(ws: WebSocket, rawMessage: string | Buffer): void {
    const clientId = wsToClientId.get(ws);
    if (!clientId) {
      console.error("[PerSessionWS] Message from unknown WebSocket");
      return;
    }

    const client = this.clients.get(clientId);
    if (!client) return;

    const messageStr = typeof rawMessage === "string" ? rawMessage : rawMessage.toString();

    let message: PerSessionClientMessage;
    try {
      message = JSON.parse(messageStr);
    } catch {
      this.sendError(ws, "INVALID_MESSAGE", "Invalid JSON");
      return;
    }

    // Update heartbeat on any message
    client.lastHeartbeat = new Date();

    switch (message.type) {
      case "sendKeys":
        this.handleSendKeys(client, message.keys ?? "", message.pane);
        break;

      case "heartbeat":
        // Already updated lastHeartbeat above
        break;

      default:
        this.sendError(
          ws,
          "UNKNOWN_TYPE",
          `Unknown message type: ${(message as { type: string }).type}`
        );
    }
  }

  /**
   * Handle WebSocket close
   */
  handleWsClose(ws: WebSocket): void {
    const clientId = wsToClientId.get(ws);
    if (!clientId) return;

    wsToClientId.delete(ws);

    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from session tracking
    const sessionClientIds = this.sessionClients.get(client.sessionId);
    if (sessionClientIds) {
      sessionClientIds.delete(clientId);
      if (sessionClientIds.size === 0) {
        this.sessionClients.delete(client.sessionId);
        // Unsubscribe from poller if no one is watching
        this.poller.unsubscribe(client.sessionId, client.pane);
      }
    }

    this.clients.delete(clientId);
    console.log(`[PerSessionWS] Client ${clientId} disconnected from session ${client.sessionId}`);
  }

  /**
   * Handle sendKeys request
   */
  private async handleSendKeys(
    client: PerSessionClient,
    keys: string,
    pane?: string
  ): Promise<void> {
    const { ws, sessionId, userId, role } = client;

    // Check permission - must be operator+
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY.operator) {
      this.sendError(ws, "NOT_OPERATOR", "Only operators can send keys");
      return;
    }

    // Check claim - must have control of this session
    const claimHolder = this.getClaimHolder(sessionId);
    if (!claimHolder || claimHolder.userId !== userId) {
      this.sendError(ws, "NOT_CLAIMED", "You must claim the session before sending keys");
      return;
    }

    // Send keys
    try {
      await this.bridge.sendKeys(sessionId, keys, pane ?? client.pane);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send keys";
      this.sendError(ws, "TMUX_ERROR", msg);
    }
  }

  /**
   * Handle tmux event from poller
   */
  private handleTmuxEvent(event: TmuxEvent): void {
    if (event.type !== "output") return;

    const sessionId = event.session;
    const clientIds = this.sessionClients.get(sessionId);
    if (!clientIds) return;

    const message: PerSessionServerMessage = {
      type: "output",
      sessionId,
      pane: event.pane,
      data: event.content,
      timestamp: new Date().toISOString(),
    };

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        this.send(client.ws, message);
      }
    }
  }

  /**
   * Check for stale heartbeats and disconnect
   */
  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [clientId, client] of this.clients) {
      if (now - client.lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[PerSessionWS] Heartbeat timeout: ${clientId}`);
        client.ws.close(4000, "Heartbeat timeout");
        // handleWsClose will be called by close event
      }
    }
  }

  /**
   * Send message to a client
   */
  private send(ws: WebSocket, message: PerSessionServerMessage): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to a client
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, { type: "error", code, message });
  }

  /**
   * Set the claim holder lookup function (called by main server)
   */
  setClaimHolderLookup(fn: (sessionId: string) => { userId: string } | null): void {
    this.getClaimHolder = fn;
  }

  /**
   * Get connection statistics
   */
  getStats(): { connections: number; sessions: number } {
    return {
      connections: this.clients.size,
      sessions: this.sessionClients.size,
    };
  }
}

/**
 * Create a new per-session WebSocket server instance
 */
export function createPerSessionWSServer(
  options: PerSessionWSServerOptions = {}
): PerSessionWSServer {
  return new PerSessionWSServer(options);
}
