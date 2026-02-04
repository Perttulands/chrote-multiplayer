/**
 * CHROTE Tmux Proxy Routes
 *
 * Direct proxy to CHROTE API for tmux operations.
 * These routes forward requests to chrote:8080/api/tmux/*
 */

import { Hono } from "hono";
import { validateSession } from "../lib/session";
import { getChroteClient } from "../server/chrote";

const tmux = new Hono();

// Require authentication for all tmux routes
tmux.use("*", async (c, next) => {
  const result = await validateSession(c);
  if (!result) {
    return c.json({ error: "Authentication required" }, 401);
  }
  // Note: user/session vars not set since these routes don't need them
  return next();
});

// === Capture Pane Content ===

tmux.get("/sessions/:session/panes/:pane/capture", async (c) => {
  const chrote = getChroteClient();
  const session = c.req.param("session");
  const pane = c.req.param("pane");

  try {
    const available = await chrote.isAvailable();
    if (!available) {
      return c.json({ error: "CHROTE API not available" }, 503);
    }

    const result = await chrote.capturePane(session, pane);
    return c.json({
      session: result.session,
      pane: result.pane,
      content: result.content,
      timestamp: result.timestamp,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture pane";
    if (message.includes("not found")) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json({ error: message }, 500);
  }
});

export default tmux;
