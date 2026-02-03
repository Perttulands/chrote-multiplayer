/**
 * Database Connection
 *
 * SQLite database with Drizzle ORM.
 * Local-first: data stays on the machine.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { join } from "path";

// Database path from env or default
const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), "data", "chrote.db");

// Ensure data directory exists
import { mkdirSync } from "fs";
import { dirname } from "path";
try {
  mkdirSync(dirname(DB_PATH), { recursive: true });
} catch {
  // Directory exists
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
sqlite.pragma("journal_mode = WAL");

// Enable foreign keys
sqlite.pragma("foreign_keys = ON");

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in queries
export * from "./schema";

// Close database on process exit
process.on("exit", () => {
  sqlite.close();
});

process.on("SIGINT", () => {
  sqlite.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  sqlite.close();
  process.exit(0);
});
