/**
 * User Management Routes
 *
 * CMP-gjl.1: Admin interface for managing users
 * - List all users (Admin+)
 * - Change user roles (Admin+ with hierarchy rules)
 * - Remove users (Admin+)
 */

import { Hono } from "hono";
import { nanoid } from "nanoid";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db, users, auditLog } from "../db";
import { validateSession } from "../lib/session";
import { canManageUsers, type Role as PermRole } from "../permissions";
import { canChangeRole, canRemoveUser } from "../permissions/roles";
import type { AppEnv } from "../types";

const usersRouter = new Hono<AppEnv>();

// === Schemas ===

const updateRoleSchema = z.object({
  role: z.enum(["viewer", "operator", "admin"]),
});

// === Middleware: Require Admin ===

async function requireAdmin(c: any, next: any) {
  const result = await validateSession(c);
  if (!result) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userRole = result.user.role as PermRole;
  if (!canManageUsers(userRole)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  c.set("user", result.user);
  await next();
}

// === List Users (Admin+) ===

usersRouter.get("/", requireAdmin, async (c) => {
  const userList = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatar_url: users.avatar_url,
      role: users.role,
      created_at: users.created_at,
      last_seen_at: users.last_seen_at,
    })
    .from(users)
    .orderBy(desc(users.created_at))
    .all();

  return c.json({
    users: userList.map((u) => ({
      ...u,
      created_at: u.created_at?.toISOString(),
      last_seen_at: u.last_seen_at?.toISOString(),
    })),
  });
});

// === Get Single User (Admin+) ===

usersRouter.get("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  const user = db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  }).sync();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      role: user.role,
      github_id: user.github_id ? "linked" : null,
      google_id: user.google_id ? "linked" : null,
      created_at: user.created_at?.toISOString(),
      updated_at: user.updated_at?.toISOString(),
      last_seen_at: user.last_seen_at?.toISOString(),
    },
  });
});

// === Update User Role (Admin+) ===

usersRouter.patch("/:id/role", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const currentUser = c.get("user");
  const body = await c.req.json();

  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      400
    );
  }

  const { role: newRole } = parsed.data;

  // Get target user
  const targetUser = db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  }).sync();

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // Cannot change own role
  if (currentUser.id === targetUser.id) {
    return c.json({ error: "Cannot change your own role" }, 403);
  }

  // Use permission system to validate role change
  const currentUserRole = currentUser.role as PermRole;
  const targetUserRole = targetUser.role as PermRole;

  const result = canChangeRole(currentUserRole, targetUserRole, newRole as PermRole);
  if (!result.allowed) {
    return c.json({ error: result.reason }, 403);
  }

  // Apply the role change
  const oldRole = targetUser.role;

  // No change needed
  if (oldRole === newRole) {
    return c.json({
      success: true,
      message: "Role unchanged",
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: newRole,
      },
    });
  }

  // Update role
  db.update(users)
    .set({
      role: newRole,
      updated_at: new Date(),
    })
    .where(eq(users.id, targetUser.id))
    .run();

  // Audit log
  db.insert(auditLog)
    .values({
      id: nanoid(),
      user_id: currentUser.id,
      action: "role_changed",
      resource_type: "user",
      resource_id: targetUser.id,
      details: JSON.stringify({
        target_email: targetUser.email,
        old_role: oldRole,
        new_role: newRole,
      }),
      ip_address:
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      user_agent: c.req.header("user-agent") || null,
    })
    .run();

  return c.json({
    success: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      role: newRole,
      previous_role: oldRole,
    },
  });
});

// === Delete User (Admin+) ===

usersRouter.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const currentUser = c.get("user");

  // Get target user
  const targetUser = db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  }).sync();

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // Cannot delete self
  if (currentUser.id === targetUser.id) {
    return c.json({ error: "Cannot delete yourself" }, 403);
  }

  // Use permission system to validate removal
  const currentUserRole = currentUser.role as PermRole;
  const targetUserRole = targetUser.role as PermRole;

  const result = canRemoveUser(currentUserRole, targetUserRole);
  if (!result.allowed) {
    return c.json({ error: result.reason }, 403);
  }

  // Delete user (cascades to sessions, claims, presence)
  db.delete(users).where(eq(users.id, id)).run();

  // Audit log
  db.insert(auditLog)
    .values({
      id: nanoid(),
      user_id: currentUser.id,
      action: "user_deleted",
      resource_type: "user",
      resource_id: id,
      details: JSON.stringify({
        deleted_email: targetUser.email,
        deleted_role: targetUserRole,
      }),
      ip_address:
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      user_agent: c.req.header("user-agent") || null,
    })
    .run();

  return c.json({ success: true });
});

export default usersRouter;
