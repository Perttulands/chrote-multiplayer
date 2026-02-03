/**
 * Database Tests
 *
 * CMP-ev4.2: Verify database schema and migrations
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from "fs";

const TEST_DB_PATH = join(process.cwd(), "data", "test-chrote.db");
const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

describe("Database Schema", () => {
  let db: Database.Database;

  beforeAll(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
    mkdirSync(join(process.cwd(), "data"), { recursive: true });

    // Create and migrate test database
    db = new Database(TEST_DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Apply migrations
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      db.exec(sql);
    }
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
  });

  it("should create all required tables", () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all()
      .map((row: any) => row.name)
      .sort();

    expect(tables).toContain("users");
    expect(tables).toContain("sessions");
    expect(tables).toContain("invites");
    expect(tables).toContain("claims");
    expect(tables).toContain("presence");
    expect(tables).toContain("audit_log");
  });

  it("should have correct columns in users table", () => {
    const columns = db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((row: any) => row.name);

    expect(columns).toContain("id");
    expect(columns).toContain("email");
    expect(columns).toContain("name");
    expect(columns).toContain("role");
    expect(columns).toContain("github_id");
    expect(columns).toContain("google_id");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
  });

  it("should enforce unique email constraint", () => {
    const { nanoid } = require("nanoid");

    // Insert first user
    db.prepare(
      "INSERT INTO users (id, email, role) VALUES (?, ?, ?)"
    ).run(nanoid(), "test@example.com", "viewer");

    // Try to insert duplicate email
    expect(() => {
      db.prepare(
        "INSERT INTO users (id, email, role) VALUES (?, ?, ?)"
      ).run(nanoid(), "test@example.com", "viewer");
    }).toThrow();
  });

  it("should enforce foreign key constraints", () => {
    const { nanoid } = require("nanoid");

    // Try to create a claim with non-existent user
    expect(() => {
      db.prepare(
        "INSERT INTO claims (id, session_name, user_id, claim_type) VALUES (?, ?, ?, ?)"
      ).run(nanoid(), "test-session", "non-existent-user", "view");
    }).toThrow();
  });

  it("should allow CRUD operations on users", () => {
    const { nanoid } = require("nanoid");
    const userId = nanoid();

    // Create
    db.prepare(
      "INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)"
    ).run(userId, "crud-test@example.com", "Test User", "viewer");

    // Read
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as any;
    expect(user.email).toBe("crud-test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.role).toBe("viewer");

    // Update
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(
      "Updated User",
      userId
    );
    const updated = db
      .prepare("SELECT name FROM users WHERE id = ?")
      .get(userId) as any;
    expect(updated.name).toBe("Updated User");

    // Delete
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    const deleted = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    expect(deleted).toBeUndefined();
  });

  it("should cascade delete claims when user is deleted", () => {
    const { nanoid } = require("nanoid");
    const userId = nanoid();
    const claimId = nanoid();

    // Create user and claim
    db.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, ?)").run(
      userId,
      "cascade-test@example.com",
      "viewer"
    );
    db.prepare(
      "INSERT INTO claims (id, session_name, user_id, claim_type) VALUES (?, ?, ?, ?)"
    ).run(claimId, "test-session", userId, "view");

    // Verify claim exists
    const claim = db.prepare("SELECT * FROM claims WHERE id = ?").get(claimId);
    expect(claim).toBeDefined();

    // Delete user
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    // Verify claim was deleted
    const deletedClaim = db
      .prepare("SELECT * FROM claims WHERE id = ?")
      .get(claimId);
    expect(deletedClaim).toBeUndefined();
  });
});
