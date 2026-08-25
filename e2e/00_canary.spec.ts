import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wgffvhbzhexptvdraczc.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZmZ2aGJ6aGV4cHR2ZHJhY3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTc3NjksImV4cCI6MjEwMTY3Mzc2OX0.xj_TZmZzUI2zqSwEJT8QgmDk5FdyMh6JxRILKSW6OJE';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'nipuntantia@maharajamarble.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

test.describe('Canary Connection Verification', () => {
  test('verify login and canary lead creation on mirror DB', async ({ page }) => {
    // 1. Login via real UI form
    await page.goto('/auth');
    await page.fill('#signin-email', ADMIN_EMAIL);
    await page.fill('#signin-password', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for URL to leave /auth
    await page.waitForFunction(() => !window.location.href.includes('/auth'), { timeout: 20000 });
    await page.goto('/leads');
    await page.waitForTimeout(2000);

    // 2. Open Add Lead Dialog ("Add New Lead")
    const addLeadButton = page.locator('button:has-text("Add New Lead"), button:has-text("Add Lead")').first();
    await expect(addLeadButton).toBeVisible({ timeout: 15000 });
    await addLeadButton.click({ force: true });

    const dialog = page.getByRole('dialog', { name: 'Smart Lead Entry' });
    await expect(dialog).toBeVisible();

    const canaryName = `Canary DB Test ${Date.now()}`;
    const canaryPhone = `99${Math.floor(10000000 + Math.random() * 90000000)}`;

    // Group 1: Contacts
    await dialog.locator('input[placeholder="Enter full name"]').fill(canaryName);
    await dialog.locator('#phone_0').fill(canaryPhone);

    // Group 2: Site details (Site Location is REQUIRED)
    await dialog.locator('#siteLocation, textarea[placeholder*="site address"]').fill('Canary Site Location 123');

    // Material Interests (REQUIRED) - Click checkbox for Italian Marble
    const marbleCheckbox = dialog.locator('label:has-text("Italian Marble")').first();
    await expect(marbleCheckbox).toBeVisible();
    await marbleCheckbox.click({ force: true });

    // Group 3: Assign To selection (wait for staff loading to complete)
    await expect(dialog.locator('button:has-text("Loading...")')).not.toBeVisible({ timeout: 10000 });

    const assignSelectBtn = dialog.locator('div:has-text("Assign To *") + div button, label:has-text("Assign To") + select, label:has-text("Assign To") ~ div button').first();
    if (await assignSelectBtn.isVisible()) {
      await assignSelectBtn.click();
      await page.waitForTimeout(300);
      const opt = page.locator('[role="option"]:has-text("Nipun Tantia")').first();
      if (await opt.isVisible()) await opt.click();
    }

    // Submit dialog form
    const submitBtn = dialog.locator('button[type="submit"]:has-text("Create Lead")').first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click({ force: true });

    await expect(dialog).not.toBeVisible({ timeout: 20000 });

    // 3. Confirm via authenticated Supabase client that record exists in wgffvhbzhexptvdraczc mirror DB
    const authRes = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const session = authRes.data.session;
    expect(session).not.toBeNull();

    const authedClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${session!.access_token}` } }
    });

    const { data: dbLeads, error } = await authedClient
      .from('leads')
      .select('id, name, phone')
      .eq('name', canaryName);

    expect(error).toBeNull();
    expect(dbLeads).not.toBeNull();
    expect(dbLeads!.length).toBeGreaterThan(0);
    expect(dbLeads![0].name).toBe(canaryName);

    // Cleanup canary record
    if (dbLeads && dbLeads.length > 0) {
      await authedClient.from('leads').delete().eq('id', dbLeads[0].id);
    }

    console.log(`[Canary Success] Created and verified lead '${canaryName}' in UI on DB wgffvhbzhexptvdraczc.`);
  });
});
