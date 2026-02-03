/**
 * Terminal Routes
 *
 * HTTP endpoints for terminal session management.
 * WebSocket handles real-time streaming; these are for REST operations.
 */

import { Hono } from "hono";
import { validateSession } from "../lib/session";
import { getTmuxBridge } from "../server/tmux";
import { ROLE_HIERARCHY } from "../db/schema";

const terminal = new Hono();

// Require authentication for all terminal routes
terminal.use("*", async (c, next) => {
  const result = await validateSession(c);
  if (!result) {
    return c.json({ error: "Authentication required" }, 401);
  }
  c.set("user", result.user);
  c.set("session", result.session);
  return next();
});

// === List Sessions ===

terminal.get("/sessions", async (c) => {
  const bridge = getTmuxBridge();

  try {
    const available = await bridge.isAvailable();
    if (!available) {
      return c.json({ error: "tmux not available" }, 503);
    }

    const sessions = await bridge.listSessions();
    return c.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list sessions";
    return c.json({ error: message }, 500);
  }
});

// === Get Session Details ===

terminal.get("/sessions/:name", async (c) => {
  const bridge = getTmuxBridge();
  const name = c.req.param("name");

  try {
    const session = await bridge.getSession(name);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json({ session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get session";
    return c.json({ error: message }, 500);
  }
});

// === Capture Pane Output ===

terminal.get("/sessions/:name/capture", async (c) => {
  const bridge = getTmuxBridge();
  const name = c.req.param("name");
  const pane = c.req.query("pane") || "0";

  try {
    const result = await bridge.capturePane(name, pane);
    return c.json({
      session: result.session,
      pane: result.pane,
      content: result.content,
      timestamp: result.timestamp.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture pane";
    if (message.includes("not found")) {
      return c.json({ error: "Session or pane not found" }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

// === Get Scrollback ===

terminal.get("/sessions/:name/scrollback", async (c) => {
  const bridge = getTmuxBridge();
  const name = c.req.param("name");
  const pane = c.req.query("pane") || "0";
  const lines = parseInt(c.req.query("lines") || "1000", 10);

  if (lines < 1 || lines > 10000) {
    return c.json({ error: "Lines must be between 1 and 10000" }, 400);
  }

  try {
    const content = await bridge.getScrollback(name, lines, pane);
    return c.json({
      session: name,
      pane,
      lines,
      content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get scrollback";
    if (message.includes("not found")) {
      return c.json({ error: "Session or pane not found" }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

// === Send Keys (operators only) ===

terminal.post("/sessions/:name/keys", async (c) => {
  const user = c.get("user");
  const bridge = getTmuxBridge();
  const name = c.req.param("name");

  // Check operator permission
  if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY.operator) {
    return c.json({ error: "Operator role required" }, 403);
  }

  let body: { keys: string; pane?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.keys || typeof body.keys !== "string") {
    return c.json({ error: "keys field required" }, 400);
  }

  const pane = body.pane || "0";

  try {
    await bridge.sendKeys(name, body.keys, pane);
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send keys";
    if (message.includes("not found")) {
      return c.json({ error: "Session or pane not found" }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

// === Check tmux availability ===

terminal.get("/status", async (c) => {
  const bridge = getTmuxBridge();

  try {
    const available = await bridge.isAvailable();
    const sessions = available ? await bridge.listSessions() : [];

    return c.json({
      tmux: {
        available,
        sessionCount: sessions.length,
      },
    });
  } catch (err) {
    return c.json({
      tmux: {
        available: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
});

export default terminal;
