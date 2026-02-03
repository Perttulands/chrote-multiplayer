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

// === Start Server ===

const port = parseInt(process.env.PORT || "3000");

console.log(`🚀 CHROTE Multiplayer server starting on port ${port}`);
console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);

export default {
  port,
  fetch: app.fetch,
};
