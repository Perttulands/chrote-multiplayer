/**
 * Permission System Tests
 *
 * Tests for role-based access control.
 * See docs/PERMISSIONS.md for the full specification.
 */

import { describe, it, expect } from "vitest";
import {
  hasMinRole,
  hasPermission,
  getRequiredRole,
  canSendKeys,
  canClaim,
  canCreateSession,
  canDeleteSession,
  canManageUsers,
  canCreateInvite,
  canModifySettings,
  canDeleteWorkspace,
  canTransferOwnership,
  canOverrideClaim,
  type Role,
  type Permission,
} from "../../src/permissions";
import {
  canChangeRole,
  canRemoveUser,
  canTransferOwnershipTo,
} from "../../src/permissions/roles";

describe("Permission Functions", () => {
  describe("hasMinRole", () => {
    it("owner has all roles", () => {
      expect(hasMinRole("owner", "owner")).toBe(true);
      expect(hasMinRole("owner", "admin")).toBe(true);
      expect(hasMinRole("owner", "operator")).toBe(true);
      expect(hasMinRole("owner", "viewer")).toBe(true);
    });

    it("admin has admin and below", () => {
      expect(hasMinRole("admin", "owner")).toBe(false);
      expect(hasMinRole("admin", "admin")).toBe(true);
      expect(hasMinRole("admin", "operator")).toBe(true);
      expect(hasMinRole("admin", "viewer")).toBe(true);
    });

    it("operator has operator and below", () => {
      expect(hasMinRole("operator", "owner")).toBe(false);
      expect(hasMinRole("operator", "admin")).toBe(false);
      expect(hasMinRole("operator", "operator")).toBe(true);
      expect(hasMinRole("operator", "viewer")).toBe(true);
    });

    it("viewer has only viewer", () => {
      expect(hasMinRole("viewer", "owner")).toBe(false);
      expect(hasMinRole("viewer", "admin")).toBe(false);
      expect(hasMinRole("viewer", "operator")).toBe(false);
      expect(hasMinRole("viewer", "viewer")).toBe(true);
    });
  });

  describe("canSendKeys", () => {
    it("returns true for owner", () => {
      expect(canSendKeys("owner")).toBe(true);
    });

    it("returns true for admin", () => {
      expect(canSendKeys("admin")).toBe(true);
    });

    it("returns true for operator", () => {
      expect(canSendKeys("operator")).toBe(true);
    });

    it("returns false for viewer", () => {
      expect(canSendKeys("viewer")).toBe(false);
    });
  });

  describe("canClaim", () => {
    it("returns true for operator+", () => {
      expect(canClaim("owner")).toBe(true);
      expect(canClaim("admin")).toBe(true);
      expect(canClaim("operator")).toBe(true);
    });

    it("returns false for viewer", () => {
      expect(canClaim("viewer")).toBe(false);
    });
  });

  describe("canManageUsers", () => {
    it("returns true for admin+", () => {
      expect(canManageUsers("owner")).toBe(true);
      expect(canManageUsers("admin")).toBe(true);
    });

    it("returns false for operator and below", () => {
      expect(canManageUsers("operator")).toBe(false);
      expect(canManageUsers("viewer")).toBe(false);
    });
  });

  describe("canCreateInvite", () => {
    it("returns true for admin+", () => {
      expect(canCreateInvite("owner")).toBe(true);
      expect(canCreateInvite("admin")).toBe(true);
    });

    it("returns false for operator and below", () => {
      expect(canCreateInvite("operator")).toBe(false);
      expect(canCreateInvite("viewer")).toBe(false);
    });
  });

  describe("canDeleteWorkspace", () => {
    it("returns true only for owner", () => {
      expect(canDeleteWorkspace("owner")).toBe(true);
    });

    it("returns false for everyone else", () => {
      expect(canDeleteWorkspace("admin")).toBe(false);
      expect(canDeleteWorkspace("operator")).toBe(false);
      expect(canDeleteWorkspace("viewer")).toBe(false);
    });
  });

  describe("canTransferOwnership", () => {
    it("returns true only for owner", () => {
      expect(canTransferOwnership("owner")).toBe(true);
    });

    it("returns false for everyone else", () => {
      expect(canTransferOwnership("admin")).toBe(false);
      expect(canTransferOwnership("operator")).toBe(false);
      expect(canTransferOwnership("viewer")).toBe(false);
    });
  });

  describe("canOverrideClaim", () => {
    it("returns true for admin+", () => {
      expect(canOverrideClaim("owner")).toBe(true);
      expect(canOverrideClaim("admin")).toBe(true);
    });

    it("returns false for operator and below", () => {
      expect(canOverrideClaim("operator")).toBe(false);
      expect(canOverrideClaim("viewer")).toBe(false);
    });
  });

  describe("hasPermission", () => {
    const permissions: Permission[] = [
      "view",
      "sendKeys",
      "claim",
      "createSession",
      "deleteSession",
      "createInvite",
      "manageUsers",
      "modifySettings",
      "deleteWorkspace",
      "transferOwnership",
    ];

    it("viewer can only view", () => {
      expect(hasPermission("viewer", "view")).toBe(true);
      expect(hasPermission("viewer", "sendKeys")).toBe(false);
      expect(hasPermission("viewer", "claim")).toBe(false);
      expect(hasPermission("viewer", "manageUsers")).toBe(false);
    });

    it("operator can view, sendKeys, claim, createSession", () => {
      expect(hasPermission("operator", "view")).toBe(true);
      expect(hasPermission("operator", "sendKeys")).toBe(true);
      expect(hasPermission("operator", "claim")).toBe(true);
      expect(hasPermission("operator", "createSession")).toBe(true);
      expect(hasPermission("operator", "deleteSession")).toBe(false);
      expect(hasPermission("operator", "manageUsers")).toBe(false);
    });

    it("admin can do everything except workspace management", () => {
      expect(hasPermission("admin", "view")).toBe(true);
      expect(hasPermission("admin", "sendKeys")).toBe(true);
      expect(hasPermission("admin", "claim")).toBe(true);
      expect(hasPermission("admin", "createSession")).toBe(true);
      expect(hasPermission("admin", "deleteSession")).toBe(true);
      expect(hasPermission("admin", "manageUsers")).toBe(true);
      expect(hasPermission("admin", "createInvite")).toBe(true);
      expect(hasPermission("admin", "deleteWorkspace")).toBe(false);
      expect(hasPermission("admin", "transferOwnership")).toBe(false);
    });

    it("owner can do everything", () => {
      for (const permission of permissions) {
        expect(hasPermission("owner", permission)).toBe(true);
      }
    });
  });

  describe("getRequiredRole", () => {
    it("returns correct role for each permission", () => {
      expect(getRequiredRole("view")).toBe("viewer");
      expect(getRequiredRole("sendKeys")).toBe("operator");
      expect(getRequiredRole("claim")).toBe("operator");
      expect(getRequiredRole("createSession")).toBe("operator");
      expect(getRequiredRole("deleteSession")).toBe("admin");
      expect(getRequiredRole("createInvite")).toBe("admin");
      expect(getRequiredRole("manageUsers")).toBe("admin");
      expect(getRequiredRole("modifySettings")).toBe("admin");
      expect(getRequiredRole("deleteWorkspace")).toBe("owner");
      expect(getRequiredRole("transferOwnership")).toBe("owner");
    });
  });
});

describe("Role Change Validation", () => {
  describe("canChangeRole", () => {
    it("operator cannot change roles", () => {
      const result = canChangeRole("operator", "viewer", "operator");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Only admins");
    });

    it("viewer cannot change roles", () => {
      const result = canChangeRole("viewer", "viewer", "operator");
      expect(result.allowed).toBe(false);
    });

    it("cannot modify owner", () => {
      const result = canChangeRole("admin", "owner", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("owner");
    });

    it("cannot set to owner directly", () => {
      const result = canChangeRole("owner", "admin", "owner");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("transfer");
    });

    it("owner can promote viewer to admin", () => {
      const result = canChangeRole("owner", "viewer", "admin");
      expect(result.allowed).toBe(true);
    });

    it("owner can demote admin to viewer", () => {
      const result = canChangeRole("owner", "admin", "viewer");
      expect(result.allowed).toBe(true);
    });

    it("admin can promote viewer to operator", () => {
      const result = canChangeRole("admin", "viewer", "operator");
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
      expect(result.reason).toContain("other admins");
    });

    it("no-op change is allowed", () => {
      const result = canChangeRole("admin", "operator", "operator");
      expect(result.allowed).toBe(true);
    });
  });

  describe("canRemoveUser", () => {
    it("operator cannot remove users", () => {
      const result = canRemoveUser("operator", "viewer");
      expect(result.allowed).toBe(false);
    });

    it("viewer cannot remove users", () => {
      const result = canRemoveUser("viewer", "viewer");
      expect(result.allowed).toBe(false);
    });

    it("cannot remove owner", () => {
      const result = canRemoveUser("admin", "owner");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("owner");
    });

    it("owner can remove anyone except owner", () => {
      expect(canRemoveUser("owner", "admin").allowed).toBe(true);
      expect(canRemoveUser("owner", "operator").allowed).toBe(true);
      expect(canRemoveUser("owner", "viewer").allowed).toBe(true);
    });

    it("admin can remove operator and viewer", () => {
      expect(canRemoveUser("admin", "operator").allowed).toBe(true);
      expect(canRemoveUser("admin", "viewer").allowed).toBe(true);
    });

    it("admin cannot remove other admins", () => {
      const result = canRemoveUser("admin", "admin");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("other admins");
    });
  });

  describe("canTransferOwnershipTo", () => {
    it("only owner can transfer", () => {
      expect(canTransferOwnershipTo("admin", "admin").allowed).toBe(false);
      expect(canTransferOwnershipTo("operator", "admin").allowed).toBe(false);
      expect(canTransferOwnershipTo("viewer", "admin").allowed).toBe(false);
    });

    it("can only transfer to admin", () => {
      expect(canTransferOwnershipTo("owner", "operator").allowed).toBe(false);
      expect(canTransferOwnershipTo("owner", "viewer").allowed).toBe(false);
    });

    it("owner can transfer to admin", () => {
      const result = canTransferOwnershipTo("owner", "admin");
      expect(result.allowed).toBe(true);
    });
  });
});
