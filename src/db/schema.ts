/**
 * Database Schema - Drizzle ORM
 *
 * Tables:
 * - users: User accounts (linked to OAuth providers)
 * - sessions: Active user sessions
 * - invites: Invite tokens for user onboarding
 * - claims: Terminal session claims (who's controlling what)
 * - presence: Real-time user presence
 * - audit_log: Security audit trail
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// === Users ===
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(), // nanoid
    email: text("email").notNull().unique(),
    name: text("name"),
    avatar_url: text("avatar_url"),
    role: text("role", { enum: ["viewer", "operator", "admin", "owner"] })
      .notNull()
      .default("viewer"),

    // OAuth provider info
    github_id: text("github_id").unique(),
    google_id: text("google_id").unique(),

    // Invite tracking
    invited_by: text("invited_by").references(() => users.id),
    invite_id: text("invite_id").references(() => invites.id),

    // Timestamps
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    last_seen_at: integer("last_seen_at", { mode: "timestamp" }),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    githubIdx: index("users_github_id_idx").on(table.github_id),
    googleIdx: index("users_google_id_idx").on(table.google_id),
    roleIdx: index("users_role_idx").on(table.role),
  })
);

// === Sessions ===
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // Session token (nanoid)
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Session metadata
    user_agent: text("user_agent"),
    ip_address: text("ip_address"),

    // Timestamps
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    expires_at: integer("expires_at", { mode: "timestamp" }).notNull(),
    last_active_at: integer("last_active_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.user_id),
    expiresIdx: index("sessions_expires_at_idx").on(table.expires_at),
  })
);

// === Invites ===
export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(), // nanoid
    token_hash: text("token_hash").notNull().unique(), // SHA-256 hash of token

    // Invite settings
    role: text("role", { enum: ["viewer", "operator", "admin"] })
      .notNull()
      .default("viewer"),
    note: text("note"), // Admin note about this invite

    // Usage tracking
    uses: integer("uses").notNull().default(0),
    max_uses: integer("max_uses"), // null = unlimited

    // Status
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
    revoked_at: integer("revoked_at", { mode: "timestamp" }),
    revoked_by: text("revoked_by").references(() => users.id),

    // Creator
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    // Expiration (optional)
    expires_at: integer("expires_at", { mode: "timestamp" }),
  },
  (table) => ({
    tokenHashIdx: index("invites_token_hash_idx").on(table.token_hash),
    createdByIdx: index("invites_created_by_idx").on(table.created_by),
  })
);

// === Claims (Terminal Session Control) ===
export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(), // nanoid
    session_name: text("session_name").notNull(), // tmux session name
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Claim type: 'control' = exclusive, 'view' = read-only
    claim_type: text("claim_type", { enum: ["control", "view"] })
      .notNull()
      .default("view"),

    // Timestamps
    claimed_at: integer("claimed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    released_at: integer("released_at", { mode: "timestamp" }),

    // Auto-release if user goes idle
    expires_at: integer("expires_at", { mode: "timestamp" }),
  },
  (table) => ({
    sessionIdx: index("claims_session_name_idx").on(table.session_name),
    userIdx: index("claims_user_id_idx").on(table.user_id),
    activeIdx: index("claims_active_idx").on(
      table.session_name,
      table.released_at
    ),
  })
);

// === Presence (Real-time User Status) ===
export const presence = sqliteTable(
  "presence",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    // Status
    status: text("status", { enum: ["online", "away", "offline"] })
      .notNull()
      .default("offline"),

    // Current location in app
    current_session: text("current_session"), // tmux session being viewed
    current_view: text("current_view"), // 'dashboard', 'terminal', 'settings', etc.

    // Connection info
    connected_at: integer("connected_at", { mode: "timestamp" }),
    last_heartbeat: integer("last_heartbeat", { mode: "timestamp" }),
  },
  (table) => ({
    statusIdx: index("presence_status_idx").on(table.status),
    sessionIdx: index("presence_current_session_idx").on(table.current_session),
  })
);

// === Audit Log ===
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(), // nanoid
    user_id: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Event details
    action: text("action").notNull(), // 'login', 'logout', 'claim', 'release', 'invite_create', etc.
    resource_type: text("resource_type"), // 'session', 'user', 'invite', etc.
    resource_id: text("resource_id"),

    // Context
    details: text("details", { mode: "json" }), // Additional event data
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),

    // Timestamp
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdx: index("audit_log_user_id_idx").on(table.user_id),
    actionIdx: index("audit_log_action_idx").on(table.action),
    createdIdx: index("audit_log_created_at_idx").on(table.created_at),
    resourceIdx: index("audit_log_resource_idx").on(
      table.resource_type,
      table.resource_id
    ),
  })
);

// === Type Exports ===
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;

export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;

export type Presence = typeof presence.$inferSelect;
export type NewPresence = typeof presence.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// Role hierarchy for permission checks
export const ROLE_HIERARCHY = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;
