import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_VAULT_PRIVACY_NOTICE,
  canBulkImportAttachments,
  canUploadAttachments,
  canViewAttachmentList,
  resolveCustomerVaultAccess,
} from '@/mobile/lib/vaultAccess';

describe('customer vault access', () => {
  it('stays in the loading state while the permission RPC is in flight', () => {
    expect(resolveCustomerVaultAccess({ canManage: false, isLoading: true })).toBe('loading');
    expect(resolveCustomerVaultAccess({ canManage: true, isLoading: true })).toBe('loading');
  });

  it('grants manage access only when the RPC returned true', () => {
    expect(resolveCustomerVaultAccess({ canManage: true, isLoading: false })).toBe('manage');
  });

  it('shows a privacy notice to everyone else', () => {
    expect(resolveCustomerVaultAccess({ canManage: false, isLoading: false })).toBe(
      'privacy_notice',
    );
  });

  it('never lists uploaded files for staff without manage access', () => {
    expect(canViewAttachmentList('privacy_notice')).toBe(false);
    expect(canViewAttachmentList('loading')).toBe(false);
    expect(canViewAttachmentList('manage')).toBe(true);
  });

  it('never offers the uploader to staff without manage access', () => {
    expect(canUploadAttachments('privacy_notice')).toBe(false);
    expect(canUploadAttachments('loading')).toBe(false);
    expect(canUploadAttachments('manage')).toBe(true);
  });

  it('never exposes the bulk import flow in Release 1', () => {
    expect(canBulkImportAttachments('manage')).toBe(false);
    expect(canBulkImportAttachments('privacy_notice')).toBe(false);
    expect(canBulkImportAttachments('loading')).toBe(false);
  });

  it('provides a privacy notice message', () => {
    expect(CUSTOMER_VAULT_PRIVACY_NOTICE.length).toBeGreaterThan(0);
    expect(CUSTOMER_VAULT_PRIVACY_NOTICE).toMatch(/restricted/i);
  });
});
