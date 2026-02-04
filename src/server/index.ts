/**
 * CHROTE Multiplayer Server
 *
 * Main entry point for the Hono-based API server.
 * Handles OAuth authentication, invite management, and real-time terminal sharing.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import authRoutes from "../routes/auth";
import invitesRoutes from "../routes/invites";
import terminalRoutes, { setWSServer } from "../routes/terminal";
import tmuxRoutes from "../routes/tmux";
import usersRoutes from "../routes/users";
import { createWSServer, authenticateWSConnection, createPerSessionWSServer } from "./ws";
import { getHocuspocusServer } from "./yjs";

const app = new Hono();

// === Middleware ===

// Logging
app.use("*", logger());

// Security headers
app.use("*", secureHeaders());

// CORS (configure for your frontend origin in production)
app.use(
  "*",
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "http://localhost:3000"
        : "*",
    credentials: true,
  })
);

// === Health Check ===

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// === API Routes ===

app.route("/api/auth", authRoutes);
app.route("/api/invites", invitesRoutes);
app.route("/api/terminal", terminalRoutes);
app.route("/api/tmux", tmuxRoutes);
app.route("/api/users", usersRoutes);

// API info
app.get("/api", (c) => {
  return c.json({
    message: "CHROTE Multiplayer API",
    version: "0.1.0",
    endpoints: {
      auth: "/api/auth",
      invites: "/api/invites",
      users: "/api/users",
    },
  });
});

// === Error Handler ===

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    },
    500
  );
});

// === Not Found ===

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// === WebSocket Server ===

const wsServer = createWSServer({
  authenticate: authenticateWSConnection,
});

// Wire up WebSocket server to terminal routes for lock management
setWSServer(wsServer);

// Start WebSocket polling
wsServer.start();

// === Per-Session WebSocket Server ===

const perSessionWSServer = createPerSessionWSServer();

// Wire up claim holder lookup from main WS server
perSessionWSServer.setClaimHolderLookup((sessionId) => {
  const lock = wsServer.getLock(sessionId);
  return lock ? { userId: lock.userId } : null;
});

// Start per-session server
perSessionWSServer.start();

// WebSocket stats endpoint
app.get("/api/ws/stats", (c) => {
  return c.json({
    main: wsServer.getStats(),
    perSession: perSessionWSServer.getStats(),
  });
});

// === Hocuspocus (Yjs) Server ===

const hocuspocus = getHocuspocusServer();
const yjsPort = parseInt(process.env.YJS_PORT || "3001");

// Start Hocuspocus on separate port for Yjs collaboration
hocuspocus.listen(yjsPort).then(() => {
  console.log(`🔄 Yjs collaboration server running on port ${yjsPort}`);
});

// Yjs stats endpoint
app.get("/api/yjs/stats", (c) => {
  return c.json({
    connections: hocuspocus.getConnectionsCount(),
    documents: hocuspocus.getDocumentsCount(),
  });
});

// === Start Server ===

const port = parseInt(process.env.PORT || "3000");

console.log(`🚀 CHROTE Multiplayer server starting on port ${port}`);
console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);

// Cleanup on shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  wsServer.stop();
  perSessionWSServer.stop();
  await hocuspocus.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down...");
  wsServer.stop();
  perSessionWSServer.stop();
  await hocuspocus.destroy();
  process.exit(0);
});

// Type for WebSocket with attached data
interface WSData {
  request: Request;
  /** Type of WebSocket connection */
  wsType: "main" | "per-session";
  /** Session ID for per-session connections */
  sessionId?: string;
  /** Pane for per-session connections */
  pane?: string;
}

// Export wsServer for other modules
export { wsServer };

// Export Bun server configuration (Bun will call Bun.serve() with this)
export default {
  port,
  // Custom fetch handler that handles WebSocket upgrades
  fetch(request: Request, server: { upgrade: (req: Request, opts?: { data?: WSData }) => boolean; requestIP: (req: Request) => { address: string } | null }) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get("Upgrade");

    // Handle WebSocket upgrade on /ws path (main WS server)
    if (url.pathname === "/ws" && upgradeHeader?.toLowerCase() === "websocket") {
      const success = server.upgrade(request, {
        data: { request, wsType: "main" },
      });
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Handle WebSocket upgrade on /ws/terminal/:sessionId path (per-session WS)
    const perSessionMatch = url.pathname.match(/^\/ws\/terminal\/([^/]+)$/);
    if (perSessionMatch && upgradeHeader?.toLowerCase() === "websocket") {
      const sessionId = decodeURIComponent(perSessionMatch[1]);
      const pane = url.searchParams.get("pane") ?? "0";

      const success = server.upgrade(request, {
        data: { request, wsType: "per-session", sessionId, pane },
      });
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // For all other requests, use the Hono app
    return app.fetch(request, { ip: server.requestIP(request) });
  },
  // WebSocket handlers
  websocket: {
    async open(ws: { data: WSData }) {
      const data = ws.data;

      if (data.wsType === "per-session") {
        // Per-session WebSocket: authenticate and connect to specific session
        console.log(`[WS] Per-session connection opened for ${data.sessionId}, authenticating...`);

        const auth = await authenticateWSConnection(data.request);
        if (!auth) {
          (ws as unknown as WebSocket).close(4001, "Authentication required");
          return;
        }

        await perSessionWSServer.handleConnection(
          ws as unknown as WebSocket,
          auth,
          data.sessionId!,
          data.pane
        );
      } else {
        // Main WebSocket server
        console.log("[WS] Connection opened, authenticating...");
        await wsServer.handleConnection(ws as unknown as WebSocket, data.request);
      }
    },
    message(ws: { data: WSData }, message: string | Buffer) {
      const data = ws.data;

      if (data.wsType === "per-session") {
        perSessionWSServer.handleWsMessage(ws as unknown as WebSocket, message);
      } else {
        wsServer.handleWsMessage(ws as unknown as WebSocket, message);
      }
    },
    close(ws: { data: WSData }) {
      const data = ws.data;

      if (data.wsType === "per-session") {
        perSessionWSServer.handleWsClose(ws as unknown as WebSocket);
      } else {
        wsServer.handleWsClose(ws as unknown as WebSocket);
      }
    },
  },
};
