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
import terminalRoutes from "../routes/terminal";
import { createWSServer, authenticateWSConnection } from "./ws";

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

// API info
app.get("/api", (c) => {
  return c.json({
    message: "CHROTE Multiplayer API",
    version: "0.1.0",
    endpoints: {
      auth: "/api/auth",
      invites: "/api/invites",
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

// Start WebSocket polling
wsServer.start();

// WebSocket stats endpoint
app.get("/api/ws/stats", (c) => {
  return c.json(wsServer.getStats());
});

// === Start Server ===

const port = parseInt(process.env.PORT || "3000");

console.log(`🚀 CHROTE Multiplayer server starting on port ${port}`);
console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);

// Cleanup on shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  wsServer.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down...");
  wsServer.stop();
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
  // Bun WebSocket handler
  websocket: {
    open(ws: WebSocket) {
      // Connection opened - actual handling done in upgrade
    },
    message(ws: WebSocket, message: string | Buffer) {
      // Messages handled by the wsServer via addEventListener
    },
    close(ws: WebSocket) {
      // Cleanup handled by the wsServer via addEventListener
    },
  },
};

// Export for WebSocket upgrade handling
export { wsServer };
