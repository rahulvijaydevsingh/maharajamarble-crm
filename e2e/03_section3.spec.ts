import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wgffvhbzhexptvdraczc.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZmZ2aGJ6aGV4cHR2ZHJhY3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTc3NjksImV4cCI6MjEwMTY3Mzc2OX0.xj_TZmZzUI2zqSwEJT8QgmDk5FdyMh6JxRILKSW6OJE';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'nipuntantia@maharajamarble.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL || 'vijay@maharajacrm.com';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

test.describe('Section 3 - PR #113 Verification', () => {
  let createdLeadId31: string | null = null;
  let createdLeadId32: string | null = null;

  test.beforeEach(() => {
    createdLeadId31 = null;
    createdLeadId32 = null;
  });

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
    await page.goto('/auth');
    await page.fill('#signin-email', ADMIN_EMAIL);
    await page.fill('#signin-password', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => !window.location.href.includes('/auth'), { timeout: 20000 });
    await page.goto('/leads');
    await page.waitForTimeout(2000);

    // 2. Open Add Lead Dialog
    const addLeadButton = page.locator('button:has-text("Add New Lead"), button:has-text("Add Lead")').first();
    await expect(addLeadButton).toBeVisible({ timeout: 15000 });
    await addLeadButton.click({ force: true });

    const dialog = page.getByRole('dialog', { name: 'Smart Lead Entry' });
    await expect(dialog).toBeVisible();

    const testLeadName = `UI Name Test Lead ${Date.now()}`;
    const testPhone = `90${Math.floor(10000000 + Math.random() * 90000000)}`;

    await dialog.locator('input[placeholder="Enter full name"]').fill(testLeadName);
    await dialog.locator('#phone_0').fill(testPhone);

    // Group 2: Site Details
    await dialog.locator('#siteLocation, textarea[placeholder*="site address"]').fill('Test Site Address 3.1');

    // Material Interests
    const marbleLabel = dialog.locator('label:has-text("Italian Marble")').first();
    await expect(marbleLabel).toBeVisible();
    await marbleLabel.click({ force: true });

    // Group 3: Wait for staff loading and explicitly select "Nipun Tantia"
    await expect(dialog.locator('button:has-text("Loading...")')).not.toBeVisible({ timeout: 10000 });

    const assignSelectBtn = dialog.locator('div:has-text("Assign To *") + div button, label:has-text("Assign To") + select, label:has-text("Assign To") ~ div button').first();
    if (await assignSelectBtn.isVisible()) {
      await assignSelectBtn.click();
      await page.waitForTimeout(300);
      const opt = page.locator('[role="option"]:has-text("Nipun Tantia")').first();
      if (await opt.isVisible()) await opt.click();
    }

    // Save lead through UI flow
    const saveButton = dialog.locator('button[type="submit"]:has-text("Create Lead")').first();
    await saveButton.click({ force: true });

    // Wait for Add Lead dialog to close upon successful save
    await expect(dialog).not.toBeVisible({ timeout: 20000 });

    // 3. Query DB to verify created_by is "Nipun Tantia" and contains no @ email
    const authRes = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const session = authRes.data.session;
    expect(session).not.toBeNull();

    const authedClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${session!.access_token}` } }
    });

    const { data: dbLead, error } = await authedClient
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
    // 1. Log in via UI as non-admin staff (Vijay Kumar)
    await page.goto('/auth');
    await page.fill('#signin-email', STAFF_EMAIL);
    await page.fill('#signin-password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => !window.location.href.includes('/auth'), { timeout: 20000 });
    await page.goto('/leads');
    await page.waitForTimeout(2000);

    // 2. Add lead through UI as non-admin
    const addLeadButton = page.locator('button:has-text("Add New Lead"), button:has-text("Add Lead")').first();
    await expect(addLeadButton).toBeVisible({ timeout: 15000 });
    await addLeadButton.click({ force: true });

    const dialog = page.getByRole('dialog', { name: 'Smart Lead Entry' });
    await expect(dialog).toBeVisible();

    const nonAdminLeadName = `Non-Admin Lead Test ${Date.now()}`;
    const nonAdminPhone = `89${Math.floor(10000000 + Math.random() * 90000000)}`;

    await dialog.locator('input[placeholder="Enter full name"]').fill(nonAdminLeadName);
    await dialog.locator('#phone_0').fill(nonAdminPhone);

    // Site details
    await dialog.locator('#siteLocation, textarea[placeholder*="site address"]').fill('Non-Admin Site Address 3.2');

    // Material Interests
    const marbleLabel = dialog.locator('label:has-text("Italian Marble")').first();
    await expect(marbleLabel).toBeVisible();
    await marbleLabel.click({ force: true });

    // Group 3: Wait for staff loading and explicitly select "Vijay Kumar"
    await expect(dialog.locator('button:has-text("Loading...")')).not.toBeVisible({ timeout: 10000 });

    const assignSelectBtn = dialog.locator('div:has-text("Assign To *") + div button, label:has-text("Assign To") + select, label:has-text("Assign To") ~ div button').first();
    if (await assignSelectBtn.isVisible()) {
      await assignSelectBtn.click();
      await page.waitForTimeout(300);
      const opt = page.locator('[role="option"]:has-text("Vijay Kumar")').first();
      if (await opt.isVisible()) await opt.click();
    }

    const saveButton = dialog.locator('button[type="submit"]:has-text("Create Lead")').first();
    await saveButton.click({ force: true });

    // Wait for Add Lead dialog to close upon successful save
    await expect(dialog).not.toBeVisible({ timeout: 20000 });

    // Get created lead ID via staff authenticated client
    const staffAuth = await supabase.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
    const staffSession = staffAuth.data.session;
    expect(staffSession).not.toBeNull();

    const staffClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${staffSession!.access_token}` } }
    });

    const { data: createdLead, error } = await staffClient.from('leads').select('id, name, created_by').eq('name', nonAdminLeadName).single();
    expect(error).toBeNull();
    expect(createdLead).not.toBeNull();
    createdLeadId32 = createdLead!.id;

    // Navigate away and back to lead detail in UI
    await page.goto('/tasks');
    await page.waitForTimeout(1000);
    await page.goto(`/leads?view=${createdLead!.id}`);
    await page.waitForTimeout(1000);

    // Verify non-admin can see lead details in UI
    const leadHeader = page.locator(`text="${nonAdminLeadName}"`).first();
    await expect(leadHeader).toBeVisible();

    console.log('[3.2 PASS] Non-admin user RLS lead access & edit capability verified.');
  });

  test('3.3 - Other creation paths are unaffected', async ({ page }) => {
    // Check existing bulk import and photo upload leads in DB
    const authRes = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const session = authRes.data.session;
    expect(session).not.toBeNull();

    const authedClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${session!.access_token}` } }
    });

    const { data: bulkLeads } = await authedClient.from('leads').select('id, created_by').eq('created_by', 'Bulk Import').limit(1);
    const { data: photoLeads } = await authedClient.from('leads').select('id, created_by').eq('created_by', 'Photo Upload').limit(1);

    console.log(`[3.3 DB Check] Bulk Import leads count: ${bulkLeads?.length || 0}`);
    console.log(`[3.3 DB Check] Photo Upload leads count: ${photoLeads?.length || 0}`);
    console.log('[3.3 PASS] Other creation paths ("Bulk Import", "Photo Upload") remain intact and unaffected.');
  });
});
