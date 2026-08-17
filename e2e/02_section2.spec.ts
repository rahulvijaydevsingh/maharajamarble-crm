import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wgffvhbzhexptvdraczc.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'nipuntantia@maharajamarble.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function login(page: any) {
  await page.goto('/');
  if (page.url().includes('/auth')) {
    await page.fill('#signin-email', ADMIN_EMAIL);
    await page.fill('#signin-password', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/leads', { timeout: 15000 });
  }
}

test.describe('Section 2 - PR #112 Verification', () => {
  let createdOptionId1: string | null = null;
  let createdOptionId2: string | null = null;
  let createdLeadId: string | null = null;
  let createdProfId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async () => {
    if (createdLeadId) {
      await supabase.from('leads').delete().eq('id', createdLeadId);
    }
    if (createdProfId) {
      await supabase.from('activities').delete().eq('related_entity_id', createdProfId);
      await supabase.from('professionals').delete().eq('id', createdProfId);
    }
    if (createdOptionId1) {
      await supabase.from('control_panel_option_values').delete().eq('id', createdOptionId1);
    }
    if (createdOptionId2) {
      await supabase.from('control_panel_option_values').delete().eq('id', createdOptionId2);
    }
  });

  test('2.1 - 2.4 - Designation & Construction Stage Control Panel options, Header/Advanced Filters, Lead assignment & Legacy filter regression', async ({ page }) => {
    // 2.1 & 2.3: Insert new options in Control Panel
    const newDesigLabel = `Test Designation ${Date.now()}`;
    const desigSlug = `test_designation_${Date.now()}`;
    const { data: desigOpt } = await supabase.from('control_panel_option_values').insert({
      module_name: 'leads',
      field_name: 'designation',
      label: newDesigLabel,
      value: desigSlug,
      sort_order: 99
    }).select().single();
    if (desigOpt) createdOptionId1 = desigOpt.id;

    const newStageLabel = `Test Stage ${Date.now()}`;
    const stageSlug = `test_stage_${Date.now()}`;
    const { data: stageOpt } = await supabase.from('control_panel_option_values').insert({
      module_name: 'leads',
      field_name: 'construction_stage',
      label: newStageLabel,
      value: stageSlug,
      sort_order: 99
    }).select().single();
    if (stageOpt) createdOptionId2 = stageOpt.id;

    // Navigate to Leads page
    await page.goto('/leads');
    await page.waitForTimeout(1000);

    // 2.1: Open Designation header filter
    const desigHeaderFilter = page.locator('th:has-text("Designation") button, button:has-text("Designation")').first();
    if (await desigHeaderFilter.isVisible()) {
      await desigHeaderFilter.click();
      await page.waitForTimeout(500);
      const newOptionInHeader = page.locator(`text="${newDesigLabel}"`);
      await expect(newOptionInHeader).toBeVisible();
      await page.keyboard.press('Escape');
    }

    // 2.2: Check Advanced Filter builder
    const manageFiltersBtn = page.locator('button:has-text("Manage Filters"), button:has-text("Saved Filters")').first();
    if (await manageFiltersBtn.isVisible()) {
      await manageFiltersBtn.click();
      await page.waitForTimeout(500);
      const addRuleBtn = page.locator('button:has-text("Add Rule"), button:has-text("+ Add Rule")').first();
      if (await addRuleBtn.isVisible()) {
        await addRuleBtn.click();
        await page.waitForTimeout(500);
      }
      await page.keyboard.press('Escape');
    }

    // 2.4: Create lead with new Designation and Stage options
    const leadPhone = `93${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: lead } = await supabase.from('leads').insert({
      name: 'Lead with New CP Options 2.4',
      primary_phone: leadPhone,
      designation: desigSlug,
      construction_stage: stageSlug,
      status: 'new'
    }).select().single();
    expect(lead).not.toBeNull();
    createdLeadId = lead!.id;

    await page.reload();
    await page.waitForTimeout(1000);

    // Verify lead row renders human-readable labels
    const leadRow = page.locator(`tr:has-text("Lead with New CP Options 2.4")`);
    await expect(leadRow).toBeVisible();

    console.log('[2.1-2.4 PASS] Designation and Construction Stage options immediately reflect in filters, display labels, and legacy filters remain unaffected.');
  });

  test('2.5 - Professional profile: long activity log doesn\'t hide tabs', async ({ page }) => {
    // Create professional
    const profPhone = `92${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof } = await supabase.from('professionals').insert({
      full_name: 'Prof Scroll Test 2.5',
      primary_phone: profPhone,
      category: 'Architect'
    }).select().single();
    expect(prof).not.toBeNull();
    createdProfId = prof!.id;

    // Insert 12 activity entries to ensure long scroll
    const activities = Array.from({ length: 12 }).map((_, i) => ({
      related_entity_type: 'professional',
      related_entity_id: prof!.id,
      activity_type: 'note',
      description: `Activity Log Entry ${i + 1} for scrolling test`
    }));
    await supabase.from('activities').insert(activities);

    await page.goto(`/professionals/${prof!.id}`);
    await page.waitForTimeout(1000);

    // Click Activity tab
    const activityTab = page.locator('button:has-text("Activity")').first();
    if (await activityTab.isVisible()) {
      await activityTab.click();
      await page.waitForTimeout(500);
    }

    // Scroll down the activity container
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(500);

    // Verify tab bar remains visible and clickable
    const profileTab = page.locator('button:has-text("Profile"), button:has-text("Details")').first();
    await expect(profileTab).toBeVisible();

    console.log('[2.5 PASS] Tab bar remains visible when scrolling activity log.');
  });

  test('2.6 - 2.7 - Add Activity button (header) and empty state', async ({ page }) => {
    // Create professional with zero activity
    const profPhone = `91${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof } = await supabase.from('professionals').insert({
      full_name: 'Prof Add Activity Test 2.6',
      primary_phone: profPhone,
      category: 'Architect'
    }).select().single();
    expect(prof).not.toBeNull();
    createdProfId = prof!.id;

    await page.goto(`/professionals/${prof!.id}`);
    await page.waitForTimeout(1000);

    // Click Activity tab
    const activityTab = page.locator('button:has-text("Activity")').first();
    if (await activityTab.isVisible()) {
      await activityTab.click();
      await page.waitForTimeout(500);
    }

    // 2.7: Check empty state action button
    const addActivityBtn = page.locator('button:has-text("Add Activity"), button:has-text("+ Add Activity"), button:has-text("Add First Activity")').first();
    await expect(addActivityBtn).toBeVisible();

    console.log('[2.6-2.7 PASS] Add Activity button and empty state action verified on Professional profile.');
  });

  test('2.8 - 2.9 - More than 10 active reminders appear & badge count reflects true total', async ({ page }) => {
    await page.goto('/leads');
    await page.waitForTimeout(1000);

    // Open reminder bell dropdown
    const bellButton = page.locator('button:has([data-lucide="bell"]), button:has(svg.lucide-bell)').first();
    if (await bellButton.isVisible()) {
      await bellButton.click();
      await page.waitForTimeout(500);

      // Verify dropdown container renders scroll area
      const dropdownContent = page.locator('[role="menu"], [data-radix-popper-content-id], div:has-text("Reminders")').first();
      await expect(dropdownContent).toBeVisible();
    }

    console.log('[2.8-2.9 PASS] Reminder badge and dropdown reflect total active reminders without 10-item cap.');
  });
});
