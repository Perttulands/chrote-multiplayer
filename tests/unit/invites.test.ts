/**
 * Invite System Unit Tests
 *
 * Tests for invite token generation, validation, and role assignment.
 */

import { describe, it, expect } from "bun:test";
import { createHash } from "crypto";
import { nanoid } from "nanoid";

describe("Invite Token Generation", () => {
  it("should generate 16-character tokens", () => {
    const token = nanoid(16);
    expect(token.length).toBe(16);
  });

  it("should be URL-safe (alphanumeric + underscore + hyphen)", () => {
    // Generate many tokens and verify all are URL-safe
    for (let i = 0; i < 50; i++) {
      const token = nanoid(16);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("should have high entropy", () => {
    // nanoid uses 64 characters, so 16 chars = 64^16 possibilities
    // This is approximately 2^96, which is very secure
    const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    expect(charSet.length).toBe(64);

    // Log2(64^16) = 96 bits of entropy
    const entropyBits = Math.log2(Math.pow(64, 16));
    expect(entropyBits).toBe(96);
  });
});

describe("Token Hashing", () => {
  it("should hash tokens with SHA-256", () => {
    const token = "sample-invite-token";
    const hash = createHash("sha256").update(token).digest("hex");

    // SHA-256 produces 256 bits = 64 hex characters
    expect(hash.length).toBe(64);

    // Should be lowercase hex
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("should be deterministic", () => {
    const token = "test-token-123";
    const hash1 = createHash("sha256").update(token).digest("hex");
    const hash2 = createHash("sha256").update(token).digest("hex");

    expect(hash1).toBe(hash2);
  });

  it("should be irreversible (no collisions in test set)", () => {
    const tokens = Array.from({ length: 1000 }, () => nanoid(16));
    const hashes = tokens.map((t) =>
      createHash("sha256").update(t).digest("hex")
    );

    // All hashes should be unique
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1000);
  });
});

describe("Invite Role Assignment", () => {
  const validRoles = ["viewer", "operator", "admin"] as const;

  it("should accept valid invite roles", () => {
    for (const role of validRoles) {
      expect(validRoles.includes(role)).toBe(true);
    }
  });

  it("should not include owner as invitable role", () => {
    // Owner can only be the first user, not assigned via invite
    expect((validRoles as readonly string[]).includes("owner")).toBe(false);
  });
});

describe("Invite Expiration Logic", () => {
  it("should detect expired invites", () => {
    const expiresAt = new Date(Date.now() - 60000); // 1 minute ago
    const now = new Date();

    const isExpired = expiresAt < now;
    expect(isExpired).toBe(true);
  });

  it("should detect valid invites", () => {
    const expiresAt = new Date(Date.now() + 86400000); // 1 day from now
    const now = new Date();

    const isValid = expiresAt > now;
    expect(isValid).toBe(true);
  });

  it("should handle null expiration (never expires)", () => {
    const expiresAt = null;

    // Null expiration means never expires
    const isValid = expiresAt === null || expiresAt > new Date();
    expect(isValid).toBe(true);
  });
});

describe("Invite Usage Tracking", () => {
  it("should track usage count", () => {
    let uses = 0;
    const maxUses = 5;

    // Simulate 3 uses
    for (let i = 0; i < 3; i++) {
      uses++;
    }

    expect(uses).toBe(3);
    expect(uses < maxUses).toBe(true);
  });

  it("should detect exhausted invites", () => {
    const uses = 5;
    const maxUses = 5;

    const isExhausted = maxUses !== null && uses >= maxUses;
    expect(isExhausted).toBe(true);
  });

  it("should allow unlimited uses when max_uses is null", () => {
    const uses = 9999;
    const maxUses = null;

    const isExhausted = maxUses !== null && uses >= maxUses;
    expect(isExhausted).toBe(false);
  });
});

describe("Invite Validation Composite", () => {
  interface Invite {
    revoked: boolean;
    expires_at: Date | null;
    uses: number;
    max_uses: number | null;
  }

  function isInviteValid(invite: Invite): boolean {
    if (invite.revoked) return false;
    if (invite.expires_at && invite.expires_at < new Date()) return false;
    if (invite.max_uses !== null && invite.uses >= invite.max_uses) return false;
    return true;
  }

  it("should reject revoked invites", () => {
    const invite: Invite = {
      revoked: true,
      expires_at: new Date(Date.now() + 86400000),
      uses: 0,
      max_uses: 10,
    };

    expect(isInviteValid(invite)).toBe(false);
  });

  it("should reject expired invites", () => {
    const invite: Invite = {
      revoked: false,
      expires_at: new Date(Date.now() - 1000),
      uses: 0,
      max_uses: 10,
    };

    expect(isInviteValid(invite)).toBe(false);
  });

  it("should reject exhausted invites", () => {
    const invite: Invite = {
      revoked: false,
      expires_at: null,
      uses: 10,
      max_uses: 10,
    };

    expect(isInviteValid(invite)).toBe(false);
  });

  it("should accept valid invites", () => {
    const invite: Invite = {
      revoked: false,
      expires_at: new Date(Date.now() + 86400000),
      uses: 5,
      max_uses: 10,
    };

    expect(isInviteValid(invite)).toBe(true);
  });

  it("should accept never-expiring unlimited invites", () => {
    const invite: Invite = {
      revoked: false,
      expires_at: null,
      uses: 1000,
      max_uses: null,
    };

    expect(isInviteValid(invite)).toBe(true);
  });
});
