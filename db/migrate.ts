/**
 * Database Migration Script
 *
 * Run with: bun run db:migrate
 *
 * CMP-ev4.2: Database Schema & Migrations
 */

import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync, readdirSync, readFileSync } from "fs";

const DB_PATH =
  process.env.DATABASE_PATH || join(process.cwd(), "data", "chrote.db");
const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

// Ensure data directory exists
try {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
} catch {
  // Directory exists
}

console.log(`📦 Migrating database: ${DB_PATH}`);

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Create migrations tracking table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

// Get applied migrations
const applied = new Set(
  sqlite
    .prepare("SELECT name FROM _migrations")
    .all()
    .map((row: any) => row.name)
);

// Get migration files
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Apply pending migrations
let appliedCount = 0;
for (const file of migrationFiles) {
  if (applied.has(file)) {
    console.log(`⏭️  Already applied: ${file}`);
    continue;
  }

  console.log(`📝 Applying: ${file}`);

  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");

  // Run migration in transaction
  sqlite.exec("BEGIN");
  try {
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
    sqlite.exec("COMMIT");
    console.log(`✅ Applied: ${file}`);
    appliedCount++;
  } catch (error) {
    sqlite.exec("ROLLBACK");
    console.error(`❌ Failed to apply ${file}:`, error);
    throw error;
  }
}

if (appliedCount === 0) {
  console.log("✅ Database is up to date!");
} else {
  console.log(`✅ Applied ${appliedCount} migration(s)!`);
}

sqlite.close();
