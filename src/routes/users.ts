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
import { eq, desc, ne } from "drizzle-orm";
import { z } from "zod";

import { db, users, auditLog, ROLE_HIERARCHY, type Role } from "../db";
import { validateSession } from "../lib/session";

const usersRouter = new Hono();

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

  const userRole = result.user.role as Role;
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.admin) {
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
  });

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
  });

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const currentUserRole = currentUser.role as Role;
  const targetUserRole = targetUser.role as Role;

  // === Validation Rules ===

  // Cannot change own role
  if (currentUser.id === targetUser.id) {
    return c.json({ error: "Cannot change your own role" }, 403);
  }

  // Cannot modify owner
  if (targetUserRole === "owner") {
    return c.json({ error: "Cannot modify owner role" }, 403);
  }

  // Owner can do anything (except change themselves, checked above)
  if (currentUserRole === "owner") {
    // Owner can promote/demote anyone to any non-owner role
    return applyRoleChange(c, targetUser, newRole, currentUser);
  }

  // Admin promotion/demotion rules
  if (currentUserRole === "admin") {
    // Admin cannot promote to admin (only owner can)
    if (newRole === "admin") {
      return c.json({ error: "Only owner can create admins" }, 403);
    }

    // Admin cannot demote other admins
    if (targetUserRole === "admin") {
      return c.json({ error: "Admins cannot demote other admins" }, 403);
    }

    // Admin can promote: Viewer → Operator
    // Admin can demote: Operator → Viewer
    return applyRoleChange(c, targetUser, newRole, currentUser);
  }

  // Should not reach here due to requireAdmin middleware
  return c.json({ error: "Forbidden" }, 403);
});

// === Delete User (Admin+) ===

usersRouter.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const currentUser = c.get("user");

  // Get target user
  const targetUser = db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  });

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const currentUserRole = currentUser.role as Role;
  const targetUserRole = targetUser.role as Role;

  // Cannot delete self
  if (currentUser.id === targetUser.id) {
    return c.json({ error: "Cannot delete yourself" }, 403);
  }

  // Cannot delete owner
  if (targetUserRole === "owner") {
    return c.json({ error: "Cannot delete owner" }, 403);
  }

  // Only owner can delete admins
  if (targetUserRole === "admin" && currentUserRole !== "owner") {
    return c.json({ error: "Only owner can delete admins" }, 403);
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

// === Helper: Apply Role Change ===

async function applyRoleChange(
  c: any,
  targetUser: any,
  newRole: string,
  currentUser: any
) {
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
}

export default usersRouter;
