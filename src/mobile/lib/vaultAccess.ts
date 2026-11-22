/**
 * Customer Vault access rules.
 *
 * The live `useCanManageCustomerAttachments()` hook answers a Postgres RPC
 * (`can_manage_customer_attachments`), which is stricter than the plain
 * `customers.manage_attachments` permission string. These helpers turn that
 * boolean into the two states the mobile UI can render, so the rule is
 * testable in isolation and identical everywhere it is used.
 */

/** What the mobile Customer Vault is allowed to show. */
export type CustomerVaultAccess =
  /** Privileged staff: the uploader and the existing attachment list. */
  | 'manage'
  /** Everyone else: a privacy notice only. */
  | 'privacy_notice'
  /** Still resolving — render a neutral placeholder. */
  | 'loading';

export interface CustomerVaultPermissions {
  canManage: boolean;
  isLoading: boolean;
}

/**
 * Resolves the vault access state.
 *
 * While the RPC is still in flight the state is `loading`; once it resolves,
 * only a truthy `canManage` grants the `manage` state.
 */
export function resolveCustomerVaultAccess(
  permissions: CustomerVaultPermissions,
): CustomerVaultAccess {
  if (permissions.isLoading) return 'loading';
  return permissions.canManage ? 'manage' : 'privacy_notice';
}

/**
 * True when the staff member may see the list of already-uploaded files.
 * Only privileged staff ever see it.
 */
export function canViewAttachmentList(access: CustomerVaultAccess): boolean {
  return access === 'manage';
}

/**
 * True when the staff member may upload new files.
 * Only privileged staff ever see the uploader.
 */
export function canUploadAttachments(access: CustomerVaultAccess): boolean {
  return access === 'manage';
}

/**
 * Bulk import of spreadsheet attachments is not exposed in Release 1 — the
 * mobile surface never offers the `imports/*.xlsx` flow, regardless of role.
 */
export function canBulkImportAttachments(_access: CustomerVaultAccess): boolean {
  return false;
}

/** The message shown to staff who are not allowed to see customer files. */
export const CUSTOMER_VAULT_PRIVACY_NOTICE =
  'Customer files are restricted. Ask an administrator if you need access to the documents attached to this customer.';
