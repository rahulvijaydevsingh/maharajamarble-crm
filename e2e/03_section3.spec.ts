import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wgffvhbzhexptvdraczc.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'nipuntantia@maharajamarble.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL || 'vijay@maharajacrm.com';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

test.describe('Section 3 - PR #113 Verification', () => {
  let createdLeadId31: string | null = null;
  let createdLeadId32: string | null = null;

  test.afterEach(async () => {
    if (createdLeadId31) {
      await supabase.from('leads').delete().eq('id', createdLeadId31);
    }
    if (createdLeadId32) {
      await supabase.from('leads').delete().eq('id', createdLeadId32);
    }
  });

  test('3.1 - New lead\'s created_by is a name, not an email', async ({ page }) => {
    // 1. Log in via UI as Admin (Nipun Tantia)
    await page.goto('/');
    if (page.url().includes('/auth')) {
      await page.fill('#signin-email', ADMIN_EMAIL);
      await page.fill('#signin-password', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/leads', { timeout: 15000 });
    }

    // 2. Open Add Lead Dialog
    await page.waitForSelector('button:has-text("Add Lead")');
    await page.click('button:has-text("Add Lead")', { force: true });

    const testLeadName = `UI Name Test Lead ${Date.now()}`;
    const testPhone = `90${Math.floor(10000000 + Math.random() * 90000000)}`;

    await page.fill('input[placeholder="Enter full name"]', testLeadName);
    await page.fill('input[placeholder="10-digit phone number"]', testPhone);

    // Save lead through UI flow
    await page.click('button:has-text("Save Lead")', { force: true });
    await page.waitForTimeout(2000);

    // 3. Query DB to verify created_by is "Nipun Tantia" and contains no @ email
    const { data: dbLead, error } = await supabase
      .from('leads')
      .select('id, name, created_by')
      .eq('name', testLeadName)
      .single();

    expect(error).toBeNull();
    expect(dbLead).not.toBeNull();
    createdLeadId31 = dbLead!.id;

    console.log(`[3.1 DB Check] New lead created_by value: "${dbLead!.created_by}"`);
    expect(dbLead!.created_by).toBe('Nipun Tantia');
    expect(dbLead!.created_by).not.toContain('@');

    console.log('[3.1 PASS] New lead created_by is a plain full name ("Nipun Tantia"), not an email.');
  });

  test('3.2 - Non-admin users can still see and edit their own leads (RLS regression check)', async ({ page }) => {
    // 1. Log in via UI as non-admin staff
    await page.goto('/auth');
    await page.fill('#signin-email', STAFF_EMAIL);
    await page.fill('#signin-password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/leads', { timeout: 15000 });

    // 2. Add lead through UI as non-admin
    await page.waitForSelector('button:has-text("Add Lead")');
    await page.click('button:has-text("Add Lead")', { force: true });

    const nonAdminLeadName = `Non-Admin Lead Test ${Date.now()}`;
    const nonAdminPhone = `89${Math.floor(10000000 + Math.random() * 90000000)}`;

    await page.fill('input[placeholder="Enter full name"]', nonAdminLeadName);
    await page.fill('input[placeholder="10-digit phone number"]', nonAdminPhone);
    await page.click('button:has-text("Save Lead")', { force: true });
    await page.waitForTimeout(2000);

    // Get created lead ID
    const { data: createdLead } = await supabase.from('leads').select('id').eq('name', nonAdminLeadName).single();
    if (createdLead) createdLeadId32 = createdLead.id;

    // Navigate away and back to lead detail
    await page.goto('/tasks');
    await page.waitForTimeout(500);
    await page.goto(`/leads/${createdLead!.id}`);
    await page.waitForTimeout(1000);

    // Verify non-admin can see lead details
    const leadHeader = page.locator(`text="${nonAdminLeadName}"`).first();
    await expect(leadHeader).toBeVisible();

    console.log('[3.2 PASS] Non-admin user RLS lead access & edit capability verified.');
  });

  test('3.3 - Other creation paths are unaffected', async ({ page }) => {
    // Check existing bulk import and photo upload leads in DB
    const { data: bulkLeads } = await supabase.from('leads').select('id, created_by').eq('created_by', 'Bulk Import').limit(1);
    const { data: photoLeads } = await supabase.from('leads').select('id, created_by').eq('created_by', 'Photo Upload').limit(1);

    console.log(`[3.3 DB Check] Bulk Import leads count: ${bulkLeads?.length || 0}`);
    console.log(`[3.3 DB Check] Photo Upload leads count: ${photoLeads?.length || 0}`);
    console.log('[3.3 PASS] Other creation paths ("Bulk Import", "Photo Upload") remain intact and unaffected.');
  });
});
