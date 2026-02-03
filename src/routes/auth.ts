/**
 * Authentication Routes
 *
 * OAuth login/callback endpoints for GitHub and Google.
 * Session management and logout.
 */

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { nanoid } from "nanoid";
import { eq, or } from "drizzle-orm";
import { createHash } from "crypto";

import { db, users, invites, auditLog } from "../db";
import {
  github,
  google,
  createOAuthState,
  getGitHubUser,
  getGitHubEmails,
  getGoogleUser,
  isOAuthConfigured,
} from "../lib/oauth";
import {
  createSession,
  validateSession,
  invalidateSession,
} from "../lib/session";

const auth = new Hono();

// Cookie names for OAuth state
const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
const PENDING_INVITE_COOKIE = "pending_invite";

// === GitHub OAuth ===

auth.get("/github", async (c) => {
  const config = isOAuthConfigured();
  if (!config.github) {
    return c.json({ error: "GitHub OAuth not configured" }, 500);
  }

  const { state, codeVerifier } = createOAuthState();

  // Store state in cookies (short-lived)
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  setCookie(c, OAUTH_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });

  // Check for invite token in query
  const inviteToken = c.req.query("invite");
  if (inviteToken) {
    setCookie(c, PENDING_INVITE_COOKIE, inviteToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 10,
    });
  }

  const url = github.createAuthorizationURL(state, ["read:user", "user:email"]);
  return c.redirect(url.toString());
});

auth.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, OAUTH_STATE_COOKIE);

  // Validate state
  if (!code || !state || state !== storedState) {
    return c.redirect("/?error=invalid_state");
  }

  // Clear OAuth cookies
  deleteCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_VERIFIER_COOKIE);

  try {
    // Exchange code for tokens
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    // Get user profile
    const githubUser = await getGitHubUser(accessToken);

    // Get primary email
    let email = githubUser.email;
    if (!email) {
      const emails = await getGitHubEmails(accessToken);
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email || emails[0]?.email;
    }

    if (!email) {
      return c.redirect("/?error=no_email");
    }

    // Find or create user
    const result = await findOrCreateUser({
      email,
      name: githubUser.name || githubUser.login,
      avatar_url: githubUser.avatar_url,
      github_id: String(githubUser.id),
      pendingInvite: getCookie(c, PENDING_INVITE_COOKIE),
    });

    deleteCookie(c, PENDING_INVITE_COOKIE);

    if (!result.success) {
      return c.redirect(`/?error=${result.error}`);
    }

    // Create session
    await createSession(result.user.id, c);

    // Audit log
    db.insert(auditLog)
      .values({
        id: nanoid(),
        user_id: result.user.id,
        action: result.created ? "user_created" : "login",
        resource_type: "user",
        resource_id: result.user.id,
        details: JSON.stringify({ provider: "github" }),
        ip_address:
          c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        user_agent: c.req.header("user-agent") || null,
      })
      .run();

    return c.redirect("/");
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    return c.redirect("/?error=oauth_failed");
  }
});

// === Google OAuth ===

auth.get("/google", async (c) => {
  const config = isOAuthConfigured();
  if (!config.google) {
    return c.json({ error: "Google OAuth not configured" }, 500);
  }

  const { state, codeVerifier } = createOAuthState();

  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });

  setCookie(c, OAUTH_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });

  const inviteToken = c.req.query("invite");
  if (inviteToken) {
    setCookie(c, PENDING_INVITE_COOKIE, inviteToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 10,
    });
  }

  const url = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);
  return c.redirect(url.toString());
});

auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, OAUTH_STATE_COOKIE);
  const storedVerifier = getCookie(c, OAUTH_VERIFIER_COOKIE);

  if (!code || !state || state !== storedState || !storedVerifier) {
    return c.redirect("/?error=invalid_state");
  }

  deleteCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_VERIFIER_COOKIE);

  try {
    const tokens = await google.validateAuthorizationCode(code, storedVerifier);
    const accessToken = tokens.accessToken();

    const googleUser = await getGoogleUser(accessToken);

    if (!googleUser.email_verified) {
      return c.redirect("/?error=email_not_verified");
    }

    const result = await findOrCreateUser({
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.picture,
      google_id: googleUser.sub,
      pendingInvite: getCookie(c, PENDING_INVITE_COOKIE),
    });

    deleteCookie(c, PENDING_INVITE_COOKIE);

    if (!result.success) {
      return c.redirect(`/?error=${result.error}`);
    }

    await createSession(result.user.id, c);

    db.insert(auditLog)
      .values({
        id: nanoid(),
        user_id: result.user.id,
        action: result.created ? "user_created" : "login",
        resource_type: "user",
        resource_id: result.user.id,
        details: JSON.stringify({ provider: "google" }),
        ip_address:
          c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        user_agent: c.req.header("user-agent") || null,
      })
      .run();

    return c.redirect("/");
  } catch (error) {
    console.error("Google OAuth error:", error);
    return c.redirect("/?error=oauth_failed");
  }
});

// === Logout ===

auth.post("/logout", async (c) => {
  const result = await validateSession(c);
  if (result) {
    db.insert(auditLog)
      .values({
        id: nanoid(),
        user_id: result.user.id,
        action: "logout",
        resource_type: "user",
        resource_id: result.user.id,
        ip_address:
          c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        user_agent: c.req.header("user-agent") || null,
      })
      .run();
  }

  await invalidateSession(c);
  return c.json({ success: true });
});

// === Current User ===

auth.get("/me", async (c) => {
  const result = await validateSession(c);
  if (!result) {
    return c.json({ user: null });
  }

  const { user } = result;
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

// === Status (which providers are configured) ===

auth.get("/status", (c) => {
  const config = isOAuthConfigured();
  return c.json({
    providers: {
      github: config.github,
      google: config.google,
    },
  });
});

// === Helper: Find or Create User ===

interface FindOrCreateUserParams {
  email: string;
  name: string | null;
  avatar_url: string | null;
  github_id?: string;
  google_id?: string;
  pendingInvite?: string;
}

type FindOrCreateUserResult =
  | {
      success: true;
      user: typeof users.$inferSelect;
      created: boolean;
    }
  | {
      success: false;
      error: string;
    };

async function findOrCreateUser(
  params: FindOrCreateUserParams
): Promise<FindOrCreateUserResult> {
  const { email, name, avatar_url, github_id, google_id, pendingInvite } = params;

  // Check if user exists (by email or provider ID)
  let existingUser = db.query.users.findFirst({
    where: (u, { or, eq }) =>
      or(
        eq(u.email, email),
        github_id ? eq(u.github_id, github_id) : undefined,
        google_id ? eq(u.google_id, google_id) : undefined
      ),
  });

  if (existingUser) {
    // Update provider ID if not set
    const updates: Partial<typeof users.$inferInsert> = {
      updated_at: new Date(),
    };

    if (github_id && !existingUser.github_id) {
      updates.github_id = github_id;
    }
    if (google_id && !existingUser.google_id) {
      updates.google_id = google_id;
    }
    if (name && !existingUser.name) {
      updates.name = name;
    }
    if (avatar_url && !existingUser.avatar_url) {
      updates.avatar_url = avatar_url;
    }

    if (Object.keys(updates).length > 1) {
      db.update(users)
        .set(updates)
        .where(eq(users.id, existingUser.id))
        .run();
    }

    return { success: true, user: existingUser, created: false };
  }

  // New user - require invite (unless first user/owner)
  const userCount = db.select().from(users).all().length;

  let role: "viewer" | "operator" | "admin" | "owner" = "viewer";
  let inviteId: string | undefined;
  let invitedBy: string | undefined;

  if (userCount === 0) {
    // First user becomes owner
    role = "owner";
  } else if (pendingInvite) {
    // Validate invite
    const tokenHash = createHash("sha256").update(pendingInvite).digest("hex");
    const invite = db.query.invites.findFirst({
      where: (i, { eq, and }) =>
        and(eq(i.token_hash, tokenHash), eq(i.revoked, false)),
    });

    if (!invite) {
      return { success: false, error: "invalid_invite" };
    }

    // Check expiration
    if (invite.expires_at && invite.expires_at < new Date()) {
      return { success: false, error: "invite_expired" };
    }

    // Check max uses
    if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
      return { success: false, error: "invite_exhausted" };
    }

    role = invite.role;
    inviteId = invite.id;
    invitedBy = invite.created_by;

    // Increment usage
    db.update(invites)
      .set({ uses: invite.uses + 1 })
      .where(eq(invites.id, invite.id))
      .run();
  } else {
    // No invite and not first user
    return { success: false, error: "invite_required" };
  }

  // Create user
  const userId = nanoid();
  db.insert(users)
    .values({
      id: userId,
      email,
      name,
      avatar_url,
      role,
      github_id,
      google_id,
      invite_id: inviteId,
      invited_by: invitedBy,
    })
    .run();

  const newUser = db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
  });

  if (!newUser) {
    return { success: false, error: "user_creation_failed" };
  }

  return { success: true, user: newUser, created: true };
}

export default auth;
