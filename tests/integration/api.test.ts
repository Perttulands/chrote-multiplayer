/**
 * API Integration Tests
 *
 * CMP-4yb: Integration tests for REST API routes
 * Tests with real SQLite test DB.
 *
 * NOTE: These tests create their own Hono app instance with a test database,
 * rather than importing the production app which uses a singleton db.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from "fs";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { Hono } from "hono";

// === Test Database Setup ===

const TEST_DB_PATH = join(process.cwd(), "data", "api-integration-test.db");
const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

function createTestDb(): Database {
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }
  mkdirSync(join(process.cwd(), "data"), { recursive: true });

  const sqlite = new Database(TEST_DB_PATH);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    sqlite.exec(sql);
  }

  return sqlite;
}

// === Test Fixtures ===

interface TestUser {
  id: string;
  email: string;
  name: string;
  role: "viewer" | "operator" | "admin" | "owner";
  sessionToken?: string;
}

// === Test App Factory (uses raw SQL to match data inserted with raw SQL) ===

function createTestApp(sqlite: Database) {
  const app = new Hono();

  // Helper to get user from session token
  function getAuthUser(c: any): any | null {
    const token = c.req.header("Cookie")?.match(/chrote_session=([^;]+)/)?.[1];
    if (!token) return null;

    const hashedToken = createHash("sha256").update(token).digest("hex");
    const now = Math.floor(Date.now() / 1000);

    const result = sqlite
      .prepare(
        `SELECT u.* FROM sessions s
         INNER JOIN users u ON s.user_id = u.id
         WHERE s.id = ? AND s.expires_at > ?`
      )
      .get(hashedToken, now) as any;

    return result || null;
  }

  // === Auth Routes ===

  app.get("/api/auth/me", (c) => {
    const user = getAuthUser(c);
    if (!user) return c.json({ user: null });

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        role: user.role,
      },
    });
  });

  app.get("/api/auth/status", (c) => c.json({ providers: { github: false, google: false } }));

  app.post("/api/auth/logout", (c) => {
    const token = c.req.header("Cookie")?.match(/chrote_session=([^;]+)/)?.[1];
    if (token) {
      const hashedToken = createHash("sha256").update(token).digest("hex");
      sqlite.prepare("DELETE FROM sessions WHERE id = ?").run(hashedToken);
    }
    return c.json({ success: true });
  });

  // === User Routes ===

  const requireAdmin = async (c: any, next: () => Promise<void>) => {
    const user = getAuthUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin" && user.role !== "owner") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    c.set("user", user);
    await next();
  };

  app.get("/api/users", requireAdmin, (c) => {
    const users = sqlite.prepare("SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC").all();
    return c.json({ users });
  });

  app.get("/api/users/:id", requireAdmin, (c) => {
    const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(c.req.param("id"));
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ user });
  });

  app.patch("/api/users/:id/role", requireAdmin, async (c) => {
    const currentUser = c.get("user");
    const body = await c.req.json();
    const validRoles = ["viewer", "operator", "admin"];

    if (!body.role || !validRoles.includes(body.role)) {
      return c.json({ error: "Invalid request" }, 400);
    }

    const target = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(c.req.param("id")) as any;
    if (!target) return c.json({ error: "User not found" }, 404);
    if (currentUser.id === target.id) return c.json({ error: "Cannot change your own role" }, 403);
    if (body.role === "admin" && currentUser.role !== "owner") {
      return c.json({ error: "Only owner can promote to admin" }, 403);
    }
    if (target.role === "admin" && currentUser.role === "admin") {
      return c.json({ error: "Cannot modify another admin" }, 403);
    }

    sqlite.prepare("UPDATE users SET role = ? WHERE id = ?").run(body.role, target.id);
    return c.json({ success: true, user: { id: target.id, email: target.email, role: body.role } });
  });

  app.delete("/api/users/:id", requireAdmin, (c) => {
    const currentUser = c.get("user");
    const target = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(c.req.param("id")) as any;

    if (!target) return c.json({ error: "User not found" }, 404);
    if (currentUser.id === target.id) return c.json({ error: "Cannot delete yourself" }, 403);
    if (target.role === "admin" && currentUser.role !== "owner") {
      return c.json({ error: "Cannot delete admin" }, 403);
    }

    sqlite.prepare("DELETE FROM users WHERE id = ?").run(target.id);
    return c.json({ success: true });
  });

  // === Invite Routes ===

  app.post("/api/invites", requireAdmin, async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const validRoles = ["viewer", "operator", "admin"];

    if (!body.role || !validRoles.includes(body.role)) {
      return c.json({ error: "Invalid request" }, 400);
    }
    if (body.role === "admin" && user.role !== "owner") {
      return c.json({ error: "Only owner can create admin invites" }, 403);
    }

    const token = nanoid(16);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const inviteId = nanoid();
    let expiresAt: number | null = null;

    if (body.expires_in_days) {
      expiresAt = Math.floor(Date.now() / 1000) + body.expires_in_days * 24 * 60 * 60;
    }

    sqlite
      .prepare("INSERT INTO invites (id, token_hash, role, note, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(inviteId, tokenHash, body.role, body.note || null, body.max_uses || null, expiresAt, user.id);

    return c.json({
      id: inviteId,
      token,
      url: `http://localhost:3000/invite/${token}`,
      role: body.role,
      note: body.note,
      max_uses: body.max_uses,
      expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : undefined,
    });
  });

  app.get("/api/invites", requireAdmin, (c) => {
    const invites = sqlite.prepare("SELECT * FROM invites ORDER BY created_at DESC").all();
    return c.json({ invites });
  });

  app.get("/api/invites/:id", requireAdmin, (c) => {
    const invite = sqlite.prepare("SELECT * FROM invites WHERE id = ?").get(c.req.param("id")) as any;
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    return c.json({ invite });
  });

  app.delete("/api/invites/:id", requireAdmin, (c) => {
    const user = c.get("user");
    const invite = sqlite.prepare("SELECT * FROM invites WHERE id = ?").get(c.req.param("id")) as any;

    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.revoked) return c.json({ error: "Invite already revoked" }, 400);

    sqlite.prepare("UPDATE invites SET revoked = 1, revoked_at = ?, revoked_by = ? WHERE id = ?").run(
      Math.floor(Date.now() / 1000),
      user.id,
      invite.id
    );
    return c.json({ success: true });
  });

  // Public invite validation - must be registered before :id routes to match correctly
  app.get("/api/invites/:token/validate", (c) => {
    const token = c.req.param("token");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = Math.floor(Date.now() / 1000);

    const invite = sqlite.prepare("SELECT * FROM invites WHERE token_hash = ?").get(tokenHash) as any;

    if (!invite) return c.json({ valid: false, reason: "not_found" });
    if (invite.revoked) return c.json({ valid: false, reason: "revoked" });
    if (invite.expires_at && invite.expires_at < now) return c.json({ valid: false, reason: "expired" });
    if (invite.max_uses !== null && invite.uses >= invite.max_uses) return c.json({ valid: false, reason: "exhausted" });

    return c.json({ valid: true, role: invite.role });
  });

  // === Health Routes ===

  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() }));
  app.get("/api/health", (c) => c.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() }));
  app.get("/api", (c) => c.json({ message: "CHROTE Multiplayer API", version: "0.1.0", endpoints: {} }));

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}

// === Test Helpers ===

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createUser(db: Database, overrides: Partial<TestUser> = {}): TestUser {
  const user: TestUser = {
    id: nanoid(),
    email: `test-${nanoid(8)}@example.com`,
    name: "Test User",
    role: "viewer",
    ...overrides,
  };

  db.prepare("INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(
    user.id,
    user.email,
    user.name,
    user.role
  );

  return user;
}

function createUserSession(db: Database, userId: string): string {
  const token = nanoid(32);
  const hashedToken = hashToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  db.prepare("INSERT INTO sessions (id, user_id, expires_at, last_active_at) VALUES (?, ?, ?, ?)").run(
    hashedToken,
    userId,
    expiresAt,
    Math.floor(Date.now() / 1000)
  );

  return token;
}

function createInvite(
  db: Database,
  createdBy: string,
  overrides: { role?: string; maxUses?: number; expiresAt?: number } = {}
) {
  const token = nanoid(16);
  const tokenHash = hashToken(token);
  const id = nanoid();

  db.prepare(
    "INSERT INTO invites (id, token_hash, role, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, tokenHash, overrides.role ?? "viewer", createdBy, overrides.maxUses ?? null, overrides.expiresAt ?? null);

  return { id, token, tokenHash, role: overrides.role ?? "viewer", createdBy };
}

function makeRequest(
  path: string,
  options: { method?: string; body?: object; sessionToken?: string } = {}
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.sessionToken) {
    headers["Cookie"] = `chrote_session=${options.sessionToken}`;
  }

  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// === Test Suite ===

describe("API Integration Tests", () => {
  let sqlite: Database;
  let app: ReturnType<typeof createTestApp>;
  let owner: TestUser;
  let admin: TestUser;
  let operator: TestUser;
  let viewer: TestUser;

  beforeAll(() => {
    sqlite = createTestDb();
    app = createTestApp(sqlite);

    owner = createUser(sqlite, { name: "Owner", role: "owner", email: "owner@test.com" });
    owner.sessionToken = createUserSession(sqlite, owner.id);

    admin = createUser(sqlite, { name: "Admin", role: "admin", email: "admin@test.com" });
    admin.sessionToken = createUserSession(sqlite, admin.id);

    operator = createUser(sqlite, { name: "Operator", role: "operator", email: "operator@test.com" });
    operator.sessionToken = createUserSession(sqlite, operator.id);

    viewer = createUser(sqlite, { name: "Viewer", role: "viewer", email: "viewer@test.com" });
    viewer.sessionToken = createUserSession(sqlite, viewer.id);
  });

  afterAll(() => {
    sqlite.close();
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
  });

  // === Auth Tests ===

  describe("Auth Routes", () => {
    describe("GET /api/auth/me", () => {
      it("should return user info when authenticated", async () => {
        const response = await app.fetch(makeRequest("/api/auth/me", { sessionToken: owner.sessionToken }));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe(owner.email);
        expect(data.user.role).toBe("owner");
      });

      it("should return null user when not authenticated", async () => {
        const response = await app.fetch(makeRequest("/api/auth/me"));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user).toBeNull();
      });

      it("should return null user with invalid session", async () => {
        const response = await app.fetch(makeRequest("/api/auth/me", { sessionToken: "invalid-token" }));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user).toBeNull();
      });
    });

    describe("GET /api/auth/status", () => {
      it("should return OAuth provider status", async () => {
        const response = await app.fetch(makeRequest("/api/auth/status"));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.providers).toBeDefined();
        expect(typeof data.providers.github).toBe("boolean");
      });
    });

    describe("POST /api/auth/logout", () => {
      it("should logout authenticated user", async () => {
        const tempUser = createUser(sqlite, { name: "Temp User" });
        const tempToken = createUserSession(sqlite, tempUser.id);

        const response = await app.fetch(makeRequest("/api/auth/logout", { method: "POST", sessionToken: tempToken }));
        expect(response.status).toBe(200);

        const meResponse = await app.fetch(makeRequest("/api/auth/me", { sessionToken: tempToken }));
        const meData = await meResponse.json();
        expect(meData.user).toBeNull();
      });
    });
  });

  // === User Tests ===

  describe("User Routes", () => {
    describe("GET /api/users", () => {
      it("should return all users for admin", async () => {
        const response = await app.fetch(makeRequest("/api/users", { sessionToken: admin.sessionToken }));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data.users)).toBe(true);
        expect(data.users.length).toBeGreaterThanOrEqual(4);
      });

      it("should deny access to operators", async () => {
        const response = await app.fetch(makeRequest("/api/users", { sessionToken: operator.sessionToken }));
        expect(response.status).toBe(403);
      });

      it("should deny access to viewers", async () => {
        const response = await app.fetch(makeRequest("/api/users", { sessionToken: viewer.sessionToken }));
        expect(response.status).toBe(403);
      });

      it("should require authentication", async () => {
        const response = await app.fetch(makeRequest("/api/users"));
        expect(response.status).toBe(401);
      });
    });

    describe("GET /api/users/:id", () => {
      it("should return user details for admin", async () => {
        const response = await app.fetch(makeRequest(`/api/users/${viewer.id}`, { sessionToken: admin.sessionToken }));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user.email).toBe(viewer.email);
      });

      it("should return 404 for non-existent user", async () => {
        const response = await app.fetch(makeRequest("/api/users/non-existent", { sessionToken: admin.sessionToken }));
        expect(response.status).toBe(404);
      });
    });

    describe("PATCH /api/users/:id/role", () => {
      it("should allow admin to change viewer to operator", async () => {
        const target = createUser(sqlite, { name: "Role Test", role: "viewer" });
        const response = await app.fetch(
          makeRequest(`/api/users/${target.id}/role`, {
            method: "PATCH",
            sessionToken: admin.sessionToken,
            body: { role: "operator" },
          })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user.role).toBe("operator");
      });

      it("should prevent admin from promoting to admin", async () => {
        const target = createUser(sqlite, { name: "Promote Test", role: "operator" });
        const response = await app.fetch(
          makeRequest(`/api/users/${target.id}/role`, {
            method: "PATCH",
            sessionToken: admin.sessionToken,
            body: { role: "admin" },
          })
        );
        expect(response.status).toBe(403);
      });

      it("should allow owner to promote to admin", async () => {
        const target = createUser(sqlite, { name: "Owner Promote", role: "operator" });
        const response = await app.fetch(
          makeRequest(`/api/users/${target.id}/role`, {
            method: "PATCH",
            sessionToken: owner.sessionToken,
            body: { role: "admin" },
          })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.user.role).toBe("admin");
      });

      it("should prevent changing own role", async () => {
        const response = await app.fetch(
          makeRequest(`/api/users/${admin.id}/role`, {
            method: "PATCH",
            sessionToken: admin.sessionToken,
            body: { role: "viewer" },
          })
        );
        expect(response.status).toBe(403);
      });

      it("should validate role values", async () => {
        const response = await app.fetch(
          makeRequest(`/api/users/${viewer.id}/role`, {
            method: "PATCH",
            sessionToken: admin.sessionToken,
            body: { role: "superadmin" },
          })
        );
        expect(response.status).toBe(400);
      });
    });

    describe("DELETE /api/users/:id", () => {
      it("should allow admin to delete viewer", async () => {
        const target = createUser(sqlite, { name: "Delete Test", role: "viewer" });
        const response = await app.fetch(
          makeRequest(`/api/users/${target.id}`, { method: "DELETE", sessionToken: admin.sessionToken })
        );
        expect(response.status).toBe(200);

        const checkResponse = await app.fetch(
          makeRequest(`/api/users/${target.id}`, { sessionToken: admin.sessionToken })
        );
        expect(checkResponse.status).toBe(404);
      });

      it("should prevent admin from deleting another admin", async () => {
        const targetAdmin = createUser(sqlite, { name: "Another Admin", role: "admin" });
        const response = await app.fetch(
          makeRequest(`/api/users/${targetAdmin.id}`, { method: "DELETE", sessionToken: admin.sessionToken })
        );
        expect(response.status).toBe(403);
      });

      it("should prevent deleting self", async () => {
        const response = await app.fetch(
          makeRequest(`/api/users/${admin.id}`, { method: "DELETE", sessionToken: admin.sessionToken })
        );
        expect(response.status).toBe(403);
      });
    });
  });

  // === Invite Tests ===

  describe("Invite Routes", () => {
    describe("POST /api/invites", () => {
      it("should allow admin to create viewer invite", async () => {
        const response = await app.fetch(
          makeRequest("/api/invites", {
            method: "POST",
            sessionToken: admin.sessionToken,
            body: { role: "viewer", note: "Test invite" },
          })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.token).toBeDefined();
        expect(data.role).toBe("viewer");
      });

      it("should prevent admin from creating admin invite", async () => {
        const response = await app.fetch(
          makeRequest("/api/invites", {
            method: "POST",
            sessionToken: admin.sessionToken,
            body: { role: "admin" },
          })
        );
        expect(response.status).toBe(403);
      });

      it("should allow owner to create admin invite", async () => {
        const response = await app.fetch(
          makeRequest("/api/invites", {
            method: "POST",
            sessionToken: owner.sessionToken,
            body: { role: "admin" },
          })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.role).toBe("admin");
      });

      it("should support max_uses and expiration", async () => {
        const response = await app.fetch(
          makeRequest("/api/invites", {
            method: "POST",
            sessionToken: admin.sessionToken,
            body: { role: "viewer", max_uses: 5, expires_in_days: 7 },
          })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.max_uses).toBe(5);
        expect(data.expires_at).toBeDefined();
      });

      it("should deny access to non-admins", async () => {
        const response = await app.fetch(
          makeRequest("/api/invites", {
            method: "POST",
            sessionToken: operator.sessionToken,
            body: { role: "viewer" },
          })
        );
        expect(response.status).toBe(403);
      });
    });

    describe("GET /api/invites", () => {
      it("should list all invites for admin", async () => {
        const response = await app.fetch(makeRequest("/api/invites", { sessionToken: admin.sessionToken }));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data.invites)).toBe(true);
      });
    });

    describe("GET /api/invites/:id", () => {
      it("should return invite details", async () => {
        const invite = createInvite(sqlite, admin.id, { role: "operator" });
        const response = await app.fetch(
          makeRequest(`/api/invites/${invite.id}`, { sessionToken: admin.sessionToken })
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.invite.role).toBe("operator");
      });

      it("should return 404 for non-existent invite", async () => {
        const response = await app.fetch(makeRequest("/api/invites/nonexistent", { sessionToken: admin.sessionToken }));
        expect(response.status).toBe(404);
      });
    });

    describe("DELETE /api/invites/:id", () => {
      it("should revoke invite", async () => {
        const invite = createInvite(sqlite, admin.id);
        const response = await app.fetch(
          makeRequest(`/api/invites/${invite.id}`, { method: "DELETE", sessionToken: admin.sessionToken })
        );
        expect(response.status).toBe(200);

        const checkResponse = await app.fetch(
          makeRequest(`/api/invites/${invite.id}`, { sessionToken: admin.sessionToken })
        );
        const checkData = await checkResponse.json();
        expect(checkData.invite.revoked).toBeTruthy();
      });

      it("should error when revoking already revoked invite", async () => {
        const invite = createInvite(sqlite, admin.id);
        await app.fetch(makeRequest(`/api/invites/${invite.id}`, { method: "DELETE", sessionToken: admin.sessionToken }));

        const response = await app.fetch(
          makeRequest(`/api/invites/${invite.id}`, { method: "DELETE", sessionToken: admin.sessionToken })
        );
        expect(response.status).toBe(400);
      });
    });

    describe("GET /api/invites/:token/validate (Public)", () => {
      it("should validate active invite token", async () => {
        const invite = createInvite(sqlite, admin.id, { role: "operator" });
        const response = await app.fetch(makeRequest(`/api/invites/${invite.token}/validate`));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.valid).toBe(true);
        expect(data.role).toBe("operator");
      });

      it("should reject invalid token", async () => {
        const response = await app.fetch(makeRequest("/api/invites/invalid-token/validate"));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.valid).toBe(false);
        expect(data.reason).toBe("not_found");
      });

      it("should reject revoked invite", async () => {
        const invite = createInvite(sqlite, admin.id);
        sqlite.prepare("UPDATE invites SET revoked = 1 WHERE id = ?").run(invite.id);

        const response = await app.fetch(makeRequest(`/api/invites/${invite.token}/validate`));
        const data = await response.json();
        expect(data.valid).toBe(false);
        expect(data.reason).toBe("revoked");
      });

      it("should reject expired invite", async () => {
        const expiredAt = Math.floor(Date.now() / 1000) - 3600;
        const invite = createInvite(sqlite, admin.id, { expiresAt: expiredAt });

        const response = await app.fetch(makeRequest(`/api/invites/${invite.token}/validate`));
        const data = await response.json();
        expect(data.valid).toBe(false);
        expect(data.reason).toBe("expired");
      });

      it("should reject exhausted invite", async () => {
        const invite = createInvite(sqlite, admin.id, { maxUses: 1 });
        sqlite.prepare("UPDATE invites SET uses = 1 WHERE id = ?").run(invite.id);

        const response = await app.fetch(makeRequest(`/api/invites/${invite.token}/validate`));
        const data = await response.json();
        expect(data.valid).toBe(false);
        expect(data.reason).toBe("exhausted");
      });
    });
  });

  // === Health Tests ===

  describe("Health Routes", () => {
    it("GET /health should return ok", async () => {
      const response = await app.fetch(makeRequest("/health"));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("ok");
    });

    it("GET /api/health should return ok", async () => {
      const response = await app.fetch(makeRequest("/api/health"));
      expect(response.status).toBe(200);
    });

    it("GET /api should return API info", async () => {
      const response = await app.fetch(makeRequest("/api"));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe("CHROTE Multiplayer API");
    });
  });

  // === Edge Cases ===

  describe("Edge Cases", () => {
    it("should return 404 for unknown routes", async () => {
      const response = await app.fetch(makeRequest("/api/unknown/route"));
      expect(response.status).toBe(404);
    });

    it("should handle missing required fields", async () => {
      const response = await app.fetch(
        makeRequest("/api/invites", {
          method: "POST",
          sessionToken: admin.sessionToken,
          body: {},
        })
      );
      expect(response.status).toBe(400);
    });
  });
});
