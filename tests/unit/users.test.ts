/**
 * User Management Tests
 *
 * CMP-gjl.1: Test promotion/demotion rules and user management
 */

import { describe, it, expect } from "bun:test";
import {
  canChangeRole,
  canRemoveUser,
  canTransferOwnershipTo,
} from "../../src/permissions/roles";
import type { Role } from "../../src/permissions";

describe("Role Change Rules", () => {
  describe("canChangeRole", () => {
    // === Owner Permissions ===

    it("owner can promote viewer to operator", () => {
      const result = canChangeRole("owner", "viewer", "operator");
      expect(result.allowed).toBe(true);
    });

    it("owner can promote viewer to admin", () => {
      const result = canChangeRole("owner", "viewer", "admin");
      expect(result.allowed).toBe(true);
    });

    it("owner can promote operator to admin", () => {
      const result = canChangeRole("owner", "operator", "admin");
      expect(result.allowed).toBe(true);
    });

    it("owner can demote admin to operator", () => {
      const result = canChangeRole("owner", "admin", "operator");
      expect(result.allowed).toBe(true);
    });

    it("owner can demote admin to viewer", () => {
      const result = canChangeRole("owner", "admin", "viewer");
      expect(result.allowed).toBe(true);
    });

    it("owner can demote operator to viewer", () => {
      const result = canChangeRole("owner", "operator", "viewer");
      expect(result.allowed).toBe(true);
    });

    it("owner cannot change owner role", () => {
      const result = canChangeRole("owner", "owner", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Cannot modify owner role");
    });

    it("owner cannot promote to owner", () => {
      const result = canChangeRole("owner", "admin", "owner");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Use ownership transfer instead");
    });

    // === Admin Permissions ===

    it("admin can promote viewer to operator", () => {
      const result = canChangeRole("admin", "viewer", "operator");
      expect(result.allowed).toBe(true);
    });

    it("admin can promote viewer to admin", () => {
      const result = canChangeRole("admin", "viewer", "admin");
      expect(result.allowed).toBe(true);
    });

    it("admin can promote operator to admin", () => {
      const result = canChangeRole("admin", "operator", "admin");
      expect(result.allowed).toBe(true);
    });

    it("admin can demote operator to viewer", () => {
      const result = canChangeRole("admin", "operator", "viewer");
      expect(result.allowed).toBe(true);
    });

    it("admin cannot demote other admins", () => {
      const result = canChangeRole("admin", "admin", "operator");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Admins cannot modify other admins");
    });

    it("admin cannot modify owner", () => {
      const result = canChangeRole("admin", "owner", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Cannot modify owner role");
    });

    // === Operator/Viewer Cannot Change Roles ===

    it("operator cannot change roles", () => {
      const result = canChangeRole("operator", "viewer", "operator");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Only admins can change user roles");
    });

    it("viewer cannot change roles", () => {
      const result = canChangeRole("viewer", "viewer", "operator");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Only admins can change user roles");
    });

    // === No-op Changes ===

    it("allows no-op role changes", () => {
      const result = canChangeRole("admin", "viewer", "viewer");
      expect(result.allowed).toBe(true);
    });
  });

  describe("canRemoveUser", () => {
    // === Owner Permissions ===

    it("owner can remove admin", () => {
      const result = canRemoveUser("owner", "admin");
      expect(result.allowed).toBe(true);
    });

    it("owner can remove operator", () => {
      const result = canRemoveUser("owner", "operator");
      expect(result.allowed).toBe(true);
    });

    it("owner can remove viewer", () => {
      const result = canRemoveUser("owner", "viewer");
      expect(result.allowed).toBe(true);
    });

    it("owner cannot remove owner", () => {
      const result = canRemoveUser("owner", "owner");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Cannot remove workspace owner");
    });

    // === Admin Permissions ===

    it("admin can remove operator", () => {
      const result = canRemoveUser("admin", "operator");
      expect(result.allowed).toBe(true);
    });

    it("admin can remove viewer", () => {
      const result = canRemoveUser("admin", "viewer");
      expect(result.allowed).toBe(true);
    });

    it("admin cannot remove other admins", () => {
      const result = canRemoveUser("admin", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Admins cannot remove other admins");
    });

    it("admin cannot remove owner", () => {
      const result = canRemoveUser("admin", "owner");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Cannot remove workspace owner");
    });

    // === Operator/Viewer Cannot Remove ===

    it("operator cannot remove users", () => {
      const result = canRemoveUser("operator", "viewer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Only admins can remove users");
    });

    it("viewer cannot remove users", () => {
      const result = canRemoveUser("viewer", "viewer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Only admins can remove users");
    });
  });

  describe("canTransferOwnershipTo", () => {
    it("owner can transfer to admin", () => {
      const result = canTransferOwnershipTo("owner", "admin");
      expect(result.allowed).toBe(true);
    });

    it("owner cannot transfer to operator", () => {
      const result = canTransferOwnershipTo("owner", "operator");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Can only transfer ownership to an admin");
    });

    it("owner cannot transfer to viewer", () => {
      const result = canTransferOwnershipTo("owner", "viewer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Can only transfer ownership to an admin");
    });

    it("admin cannot transfer ownership", () => {
      const result = canTransferOwnershipTo("admin", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Only owner can transfer ownership");
    });

    it("operator cannot transfer ownership", () => {
      const result = canTransferOwnershipTo("operator", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Only owner can transfer ownership");
    });
  });
});
