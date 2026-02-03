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
import usersRoutes from "../routes/users";
import { createWSServer, authenticateWSConnection } from "./ws";
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

// WebSocket stats endpoint
app.get("/api/ws/stats", (c) => {
  return c.json(wsServer.getStats());
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
  await hocuspocus.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down...");
  wsServer.stop();
  await hocuspocus.destroy();
  process.exit(0);
});

// Type for WebSocket with attached data
interface WSData {
  request: Request;
}

// Export wsServer for other modules
export { wsServer };

// Export Bun server configuration (Bun will call Bun.serve() with this)
export default {
  port,
  // Custom fetch handler that handles WebSocket upgrades
  fetch(request: Request, server: { upgrade: (req: Request, opts?: { data?: WSData }) => boolean; requestIP: (req: Request) => { address: string } | null }) {
    const url = new URL(request.url);

    // Handle WebSocket upgrade on /ws path
    if (url.pathname === "/ws") {
      // Check for WebSocket upgrade header
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader?.toLowerCase() === "websocket") {
        // Upgrade the connection, storing the request for authentication
        const success = server.upgrade(request, {
          data: { request },
        });
        if (success) {
          // Bun handles the upgrade response
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
    }

    // For all other requests, use the Hono app
    return app.fetch(request, { ip: server.requestIP(request) });
  },
  // WebSocket handlers
  websocket: {
    async open(ws: { data: WSData }) {
      // Get the original request from upgrade data
      const data = ws.data;
      console.log("[WS] Connection opened, authenticating...");

      // Pass to the terminal WebSocket server
      await wsServer.handleConnection(ws as unknown as WebSocket, data.request);
    },
    message(ws: unknown, message: string | Buffer) {
      // Route message to the terminal WebSocket server
      wsServer.handleWsMessage(ws as WebSocket, message);
    },
    close(ws: unknown) {
      // Route close event to the terminal WebSocket server
      wsServer.handleWsClose(ws as WebSocket);
    },
  },
};
