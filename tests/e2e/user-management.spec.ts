/**
 * E2E tests for user management.
 *
 * Tests admin promoting/demoting users and role changes.
 */

import { test, expect } from './fixtures';

test.describe('User List', () => {
  test('admin can view user list', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    // Should show user list
    await expect(adminPage.getByTestId('user-list')).toBeVisible();

    // Should show all users with roles
    await expect(adminPage.getByText(/owner/i)).toBeVisible();
    await expect(adminPage.getByText(/admin/i)).toBeVisible();
  });

  test('user list shows avatars and names', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    // Each user row should have avatar and name
    const userRows = adminPage.getByTestId('user-row');
    const firstRow = userRows.first();

    await expect(firstRow.getByTestId('user-avatar')).toBeVisible();
    await expect(firstRow.getByTestId('user-name')).toBeVisible();
    await expect(firstRow.getByTestId('user-role')).toBeVisible();
  });

  test('current user is highlighted', async ({ adminPage, testUsers }) => {
    await adminPage.goto('/settings/users');

    // Find current user row
    const currentUserRow = adminPage.getByTestId('user-row').filter({
      hasText: testUsers.admin.name,
    });

    // Should have highlight class
    await expect(currentUserRow).toHaveClass(/current|highlight|self/);
  });

  test('can search/filter users', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    // Type in search
    await adminPage.getByPlaceholder(/search/i).fill('operator');

    // Should filter results
    const userRows = adminPage.getByTestId('user-row');
    await expect(userRows).toHaveCount(1);
    await expect(userRows.first()).toContainText(/operator/i);
  });

  test('operator cannot access user management', async ({ operatorPage }) => {
    await operatorPage.goto('/settings/users');

    // Should redirect or show access denied
    await expect(operatorPage.getByText(/access denied|not authorized/i)).toBeVisible()
      .catch(() => expect(operatorPage).not.toHaveURL('/settings/users'));
  });

  test('viewer cannot access user management', async ({ viewerPage }) => {
    await viewerPage.goto('/settings/users');

    // Should redirect or show access denied
    await expect(viewerPage.getByText(/access denied|not authorized/i)).toBeVisible()
      .catch(() => expect(viewerPage).not.toHaveURL('/settings/users'));
  });
});

test.describe('Role Changes', () => {
  test('admin can promote viewer to operator', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    // Find viewer row
    const viewerRow = adminPage.getByTestId('user-row').filter({
      hasText: /viewer/i,
    });

    // Click role dropdown
    await viewerRow.getByTestId('role-dropdown').click();

    // Select operator
    await adminPage.getByRole('option', { name: /operator/i }).click();

    // Confirm change
    await adminPage.getByRole('button', { name: /confirm|save/i }).click();

    // Role should be updated
    await expect(viewerRow.getByTestId('user-role')).toHaveText(/operator/i);
  });

  test('admin can promote operator to admin', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const operatorRow = adminPage.getByTestId('user-row').filter({
      hasText: /operator/i,
    });

    await operatorRow.getByTestId('role-dropdown').click();
    await adminPage.getByRole('option', { name: /admin/i }).click();
    await adminPage.getByRole('button', { name: /confirm|save/i }).click();

    await expect(operatorRow.getByTestId('user-role')).toHaveText(/admin/i);
  });

  test('admin can demote operator to viewer', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const operatorRow = adminPage.getByTestId('user-row').filter({
      hasText: /operator/i,
    });

    await operatorRow.getByTestId('role-dropdown').click();
    await adminPage.getByRole('option', { name: /viewer/i }).click();
    await adminPage.getByRole('button', { name: /confirm|save/i }).click();

    await expect(operatorRow.getByTestId('user-role')).toHaveText(/viewer/i);
  });

  test('admin cannot demote other admins', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    // Find another admin (not self)
    const otherAdminRow = adminPage.getByTestId('user-row').filter({
      hasText: /admin/i,
    }).filter({
      hasNotText: adminPage.getByTestId('user-row.current'),
    });

    if (await otherAdminRow.isVisible()) {
      await otherAdminRow.getByTestId('role-dropdown').click();

      // Viewer/Operator options should be disabled
      const viewerOption = adminPage.getByRole('option', { name: /viewer/i });
      await expect(viewerOption).toBeDisabled();
    }
  });

  test('cannot change own role', async ({ adminPage, testUsers }) => {
    await adminPage.goto('/settings/users');

    const selfRow = adminPage.getByTestId('user-row').filter({
      hasText: testUsers.admin.name,
    });

    // Role dropdown should be disabled for self
    await expect(selfRow.getByTestId('role-dropdown')).toBeDisabled();
  });

  test('cannot change owner role', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const ownerRow = adminPage.getByTestId('user-row').filter({
      hasText: /owner/i,
    });

    // Owner role dropdown should be disabled
    await expect(ownerRow.getByTestId('role-dropdown')).toBeDisabled();
  });
});

test.describe('User Removal', () => {
  test('admin can remove viewer', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const viewerRow = adminPage.getByTestId('user-row').filter({
      hasText: /viewer/i,
    });

    // Click remove button
    await viewerRow.getByRole('button', { name: /remove|delete/i }).click();

    // Confirm removal
    await adminPage.getByRole('button', { name: /confirm|yes/i }).click();

    // User should be removed from list
    await expect(viewerRow).toBeHidden();
  });

  test('admin can remove operator', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const operatorRow = adminPage.getByTestId('user-row').filter({
      hasText: /operator/i,
    });

    await operatorRow.getByRole('button', { name: /remove|delete/i }).click();
    await adminPage.getByRole('button', { name: /confirm|yes/i }).click();

    await expect(operatorRow).toBeHidden();
  });

  test('admin cannot remove owner', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const ownerRow = adminPage.getByTestId('user-row').filter({
      hasText: /owner/i,
    });

    // Remove button should be hidden or disabled
    const removeButton = ownerRow.getByRole('button', { name: /remove|delete/i });
    await expect(removeButton).toBeHidden().catch(() =>
      expect(removeButton).toBeDisabled()
    );
  });

  test('admin cannot remove self', async ({ adminPage, testUsers }) => {
    await adminPage.goto('/settings/users');

    const selfRow = adminPage.getByTestId('user-row').filter({
      hasText: testUsers.admin.name,
    });

    // Remove button should be hidden or disabled for self
    const removeButton = selfRow.getByRole('button', { name: /remove|delete/i });
    await expect(removeButton).toBeHidden().catch(() =>
      expect(removeButton).toBeDisabled()
    );
  });

  test('removal confirmation shows user name', async ({ adminPage }) => {
    await adminPage.goto('/settings/users');

    const viewerRow = adminPage.getByTestId('user-row').filter({
      hasText: /viewer/i,
    });

    await viewerRow.getByRole('button', { name: /remove|delete/i }).click();

    // Confirmation dialog should mention the user
    await expect(adminPage.getByRole('dialog')).toContainText(/viewer/i);
    await expect(adminPage.getByRole('dialog')).toContainText(/remove|delete/i);

    // Cancel to not actually remove
    await adminPage.getByRole('button', { name: /cancel|no/i }).click();
  });
});

test.describe('Owner Privileges', () => {
  test('owner can demote admins', async ({ ownerPage }) => {
    await ownerPage.goto('/settings/users');

    const adminRow = ownerPage.getByTestId('user-row').filter({
      hasText: /admin/i,
    });

    await adminRow.getByTestId('role-dropdown').click();

    // Owner should be able to demote admin
    const viewerOption = ownerPage.getByRole('option', { name: /viewer/i });
    await expect(viewerOption).toBeEnabled();

    await viewerOption.click();
    await ownerPage.getByRole('button', { name: /confirm|save/i }).click();

    await expect(adminRow.getByTestId('user-role')).toHaveText(/viewer/i);
  });

  test('owner can remove admins', async ({ ownerPage }) => {
    await ownerPage.goto('/settings/users');

    const adminRow = ownerPage.getByTestId('user-row').filter({
      hasText: /admin/i,
    });

    await adminRow.getByRole('button', { name: /remove|delete/i }).click();
    await ownerPage.getByRole('button', { name: /confirm|yes/i }).click();

    await expect(adminRow).toBeHidden();
  });
});

test.describe('Real-time Updates', () => {
  test('user list updates when role changes', async ({ adminPage, ownerPage }) => {
    // Both viewing user list
    await adminPage.goto('/settings/users');
    await ownerPage.goto('/settings/users');

    // Owner changes a user's role
    const viewerRow = ownerPage.getByTestId('user-row').filter({
      hasText: /viewer/i,
    });
    await viewerRow.getByTestId('role-dropdown').click();
    await ownerPage.getByRole('option', { name: /operator/i }).click();
    await ownerPage.getByRole('button', { name: /confirm|save/i }).click();

    // Admin should see the update
    const adminViewerRow = adminPage.getByTestId('user-row').filter({
      hasText: /viewer|operator/i,
    });
    await expect(adminViewerRow.getByTestId('user-role')).toHaveText(/operator/i);
  });

  test('user list updates when user removed', async ({ adminPage, ownerPage }) => {
    await adminPage.goto('/settings/users');
    await ownerPage.goto('/settings/users');

    // Get initial count
    const initialCount = await adminPage.getByTestId('user-row').count();

    // Owner removes a user
    const viewerRow = ownerPage.getByTestId('user-row').filter({
      hasText: /viewer/i,
    });
    await viewerRow.getByRole('button', { name: /remove|delete/i }).click();
    await ownerPage.getByRole('button', { name: /confirm|yes/i }).click();

    // Admin should see updated list
    await expect(adminPage.getByTestId('user-row')).toHaveCount(initialCount - 1);
  });
});
