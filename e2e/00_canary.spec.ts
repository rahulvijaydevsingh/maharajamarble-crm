import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wgffvhbzhexptvdraczc.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'nipuntantia@maharajamarble.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

test.describe('Canary Connection Verification', () => {
  test('verify login and canary lead creation on mirror DB', async ({ page }) => {
    await page.goto('/');

    // Login if on auth page
    if (page.url().includes('/auth')) {
      await page.fill('#signin-email', ADMIN_EMAIL);
      await page.fill('#signin-password', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/leads', { timeout: 15000 });
    }

    // 2. Open Add Lead Dialog
    await page.waitForSelector('button:has-text("Add Lead")');
    await page.click('button:has-text("Add Lead")', { force: true });

    const canaryName = `Canary DB Test ${Date.now()}`;
    const canaryPhone = `99${Math.floor(10000000 + Math.random() * 90000000)}`;

    await page.fill('input[placeholder="Enter full name"]', canaryName);
    await page.fill('input[placeholder="10-digit phone number"]', canaryPhone);

    // Save lead
    await page.click('button:has-text("Save Lead")', { force: true });
    await page.waitForTimeout(2000);

    // 3. Confirm via Supabase client that record exists in wgffvhbzhexptvdraczc mirror DB
    const { data: dbLeads, error } = await supabase
      .from('leads')
      .select('id, name, primary_phone')
      .eq('name', canaryName);

    expect(error).toBeNull();
    expect(dbLeads).not.toBeNull();
    expect(dbLeads!.length).toBeGreaterThan(0);
    expect(dbLeads![0].name).toBe(canaryName);

    // Cleanup canary record
    if (dbLeads && dbLeads.length > 0) {
      await supabase.from('leads').delete().eq('id', dbLeads[0].id);
    }

    console.log(`[Canary Success] Created and verified lead '${canaryName}' in UI on DB wgffvhbzhexptvdraczc.`);
  });
});
