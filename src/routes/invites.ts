/**
 * Invite Management Routes
 *
 * Create, list, validate, and revoke invite links.
 * Admin+ only for management, public validation endpoint.
 */

import { Hono } from "hono";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db, invites, users, auditLog, ROLE_HIERARCHY, type Role } from "../db";
import { validateSession } from "../lib/session";
import type { AppEnv } from "../types";

const invitesRouter = new Hono<AppEnv>();

// === Schemas ===

const createInviteSchema = z.object({
  role: z.enum(["viewer", "operator", "admin"]),
  note: z.string().max(200).optional(),
  max_uses: z.number().int().positive().optional(),
  expires_in_days: z.number().int().positive().max(365).optional(),
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

// === Create Invite (Admin+) ===

invitesRouter.post("/", requireAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      400
    );
  }

  const { role, note, max_uses, expires_in_days } = parsed.data;

  // Admins can only create viewer/operator invites, not admin
  const userRole = user.role as Role;
  if (role === "admin" && userRole !== "owner") {
    return c.json({ error: "Only owner can create admin invites" }, 403);
  }

  // Generate token (16 chars, URL-safe)
  const token = nanoid(16);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Calculate expiration
  let expiresAt: Date | undefined;
  if (expires_in_days) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);
  }

  const inviteId = nanoid();

  db.insert(invites)
    .values({
      id: inviteId,
      token_hash: tokenHash,
      role,
      note,
      max_uses,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .run();

  // Audit log
  db.insert(auditLog)
    .values({
      id: nanoid(),
      user_id: user.id,
      action: "invite_created",
      resource_type: "invite",
      resource_id: inviteId,
      details: JSON.stringify({ role, max_uses, expires_in_days }),
      ip_address:
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      user_agent: c.req.header("user-agent") || null,
    })
    .run();

  // Return token (only shown once!)
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  return c.json({
    id: inviteId,
    token, // Only returned on creation
    url: `${baseUrl}/invite/${token}`,
    role,
    note,
    max_uses,
    expires_at: expiresAt?.toISOString(),
  });
});

// === List Invites (Admin+) ===

invitesRouter.get("/", requireAdmin, async (c) => {
  const inviteList = db
    .select({
      id: invites.id,
      role: invites.role,
      note: invites.note,
      uses: invites.uses,
      max_uses: invites.max_uses,
      revoked: invites.revoked,
      created_at: invites.created_at,
      expires_at: invites.expires_at,
      created_by: invites.created_by,
      creator_name: users.name,
      creator_email: users.email,
    })
    .from(invites)
    .leftJoin(users, eq(invites.created_by, users.id))
    .orderBy(desc(invites.created_at))
    .all();

  return c.json({
    invites: inviteList.map((inv) => ({
      ...inv,
      created_at: inv.created_at?.toISOString(),
      expires_at: inv.expires_at?.toISOString(),
      is_active:
        !inv.revoked &&
        (!inv.expires_at || inv.expires_at > new Date()) &&
        (inv.max_uses === null || inv.uses < inv.max_uses),
    })),
  });
});

// === Get Single Invite (Admin+) ===

invitesRouter.get("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  const invite = db.query.invites.findFirst({
    where: (i, { eq }) => eq(i.id, id),
    with: {
      // Get users who used this invite
    },
  }).sync();

  if (!invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  // Get users created with this invite
  const invitedUsers = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.invite_id, id))
    .all();

  return c.json({
    invite: {
      ...invite,
      created_at: invite.created_at?.toISOString(),
      expires_at: invite.expires_at?.toISOString(),
      revoked_at: invite.revoked_at?.toISOString(),
      is_active:
        !invite.revoked &&
        (!invite.expires_at || invite.expires_at > new Date()) &&
        (invite.max_uses === null || invite.uses < invite.max_uses),
    },
    invited_users: invitedUsers.map((u) => ({
      ...u,
      created_at: u.created_at?.toISOString(),
    })),
  });
});

// === Revoke Invite (Admin+) ===

invitesRouter.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const invite = db.query.invites.findFirst({
    where: (i, { eq }) => eq(i.id, id),
  }).sync();

  if (!invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  if (invite.revoked) {
    return c.json({ error: "Invite already revoked" }, 400);
  }

  // Revoke
  db.update(invites)
    .set({
      revoked: true,
      revoked_at: new Date(),
      revoked_by: user.id,
    })
    .where(eq(invites.id, id))
    .run();

  // Audit log
  db.insert(auditLog)
    .values({
      id: nanoid(),
      user_id: user.id,
      action: "invite_revoked",
      resource_type: "invite",
      resource_id: id,
      ip_address:
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      user_agent: c.req.header("user-agent") || null,
    })
    .run();

  return c.json({ success: true });
});

// === Validate Invite Token (Public) ===

invitesRouter.get("/:token/validate", async (c) => {
  const token = c.req.param("token");

  // Hash the token to look up
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const invite = db.query.invites.findFirst({
    where: (i, { eq }) => eq(i.token_hash, tokenHash),
  }).sync();

  if (!invite) {
    return c.json({ valid: false, reason: "not_found" });
  }

  if (invite.revoked) {
    return c.json({ valid: false, reason: "revoked" });
  }

  if (invite.expires_at && invite.expires_at < new Date()) {
    return c.json({ valid: false, reason: "expired" });
  }

  if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
    return c.json({ valid: false, reason: "exhausted" });
  }

  return c.json({
    valid: true,
    role: invite.role,
    // Don't expose note or other sensitive info
  });
});

export default invitesRouter;
