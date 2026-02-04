/**
 * Shared Types
 *
 * Type definitions for Hono context variables and other shared types.
 */

import type { users, sessions } from "./db/schema";

// User type from database schema
export type User = typeof users.$inferSelect;

// Session type from database schema
export type Session = typeof sessions.$inferSelect;

// Hono environment for typed context variables
export type AppEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};
