/**
 * Hocuspocus Server Configuration
 *
 * Real-time collaboration server using Yjs CRDTs.
 * Handles document sync, presence, and authentication.
 */

import { Server as HocuspocusServer } from "@hocuspocus/server";
import { createHash } from "crypto";
import { db, sessions, users } from "../../db";
import { eq, and, gt } from "drizzle-orm";
import type { Role } from "../../db/schema";
import { getUserColor, type AwarenessUser, type ConnectionContext } from "./types";

const SESSION_COOKIE_NAME = "chrote_session";

/**
 * Hash session token for database lookup
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parse cookies from WebSocket request
 */
function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name) {
      cookies.set(name, valueParts.join("="));
    }
  }

  return cookies;
}

/**
 * Validate session token and return user info
 */
async function validateToken(
  token: string
): Promise<{ userId: string; userName: string; role: Role } | null> {
  const hashedToken = hashToken(token);
  const now = new Date();

  const result = db
    .select({
      userId: users.id,
      userName: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(and(eq(sessions.id, hashedToken), gt(sessions.expires_at, now)))
    .get();

  if (!result) {
    return null;
  }

  return {
    userId: result.userId,
    userName: result.userName || "Anonymous",
    role: result.role as Role,
  };
}

/**
 * Create and configure the Hocuspocus server
 */
export function createHocuspocusServer(): HocuspocusServer {
  const server = new HocuspocusServer({
    name: "chrote-multiplayer",

    // Quiet mode - we'll handle logging ourselves
    quiet: true,

    // Authentication
    async onAuthenticate(data) {
      const { token, requestHeaders, documentName } = data;

      // Try token from query param first (passed by client)
      if (token) {
        const auth = await validateToken(token);
        if (auth) {
          console.log(`[Yjs] Auth via token: ${auth.userName} -> ${documentName}`);
          return {
            user: {
              userId: auth.userId,
              userName: auth.userName,
              role: auth.role,
              sessionToken: token,
            } satisfies ConnectionContext,
          };
        }
      }

      // Fall back to cookie
      const cookies = parseCookies(requestHeaders.cookie);
      const sessionToken = cookies.get(SESSION_COOKIE_NAME);

      if (!sessionToken) {
        throw new Error("Authentication required");
      }

      const auth = await validateToken(sessionToken);
      if (!auth) {
        throw new Error("Invalid or expired session");
      }

      console.log(`[Yjs] Auth via cookie: ${auth.userName} -> ${documentName}`);

      return {
        user: {
          userId: auth.userId,
          userName: auth.userName,
          role: auth.role,
          sessionToken,
        } satisfies ConnectionContext,
      };
    },

    // Connection handling
    async onConnect(data) {
      const { documentName, context } = data;
      const user = context.user as ConnectionContext;

      console.log(`[Yjs] Connected: ${user.userName} to ${documentName}`);

      // Set initial awareness state
      const awarenessUser: AwarenessUser = {
        id: user.userId,
        name: user.userName,
        role: user.role,
        color: getUserColor(user.userId),
        lastActive: Date.now(),
      };

      // Return the awareness data to be set
      return {
        instance: data.instance,
        user: awarenessUser,
      };
    },

    // Disconnection handling
    async onDisconnect(data) {
      const { documentName, context } = data;
      const user = context?.user as ConnectionContext | undefined;

      if (user) {
        console.log(`[Yjs] Disconnected: ${user.userName} from ${documentName}`);
      }
    },

    // Document loading (could add persistence here)
    async onLoadDocument(data) {
      const { documentName, document } = data;

      console.log(`[Yjs] Loading document: ${documentName}`);

      // Initialize document metadata if not exists
      const meta = document.getMap("meta");
      if (!meta.has("id")) {
        meta.set("id", documentName);
        meta.set("createdAt", Date.now());
        meta.set("updatedAt", Date.now());
        meta.set("version", 1);
      }

      return document;
    },

    // Document changes (could add persistence here)
    async onChange(data) {
      const { documentName, document } = data;

      // Update metadata
      const meta = document.getMap("meta");
      meta.set("updatedAt", Date.now());
      meta.set("version", (meta.get("version") as number || 0) + 1);

      // Could persist to SQLite here for durability
      // For now, documents are ephemeral (lost on server restart)
    },

    // Store document (persistence hook)
    async onStoreDocument(data) {
      const { documentName } = data;
      console.log(`[Yjs] Storing document: ${documentName}`);

      // TODO: Persist to SQLite or file system
      // For MVP, documents are in-memory only
    },
  });

  return server;
}

/** Singleton instance */
let hocuspocusInstance: HocuspocusServer | null = null;

/**
 * Get the Hocuspocus server singleton
 */
export function getHocuspocusServer(): HocuspocusServer {
  if (!hocuspocusInstance) {
    hocuspocusInstance = createHocuspocusServer();
  }
  return hocuspocusInstance;
}
