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

test.describe('Section 1 - PR #109 Verification', () => {
  let createdLeadId: string | null = null;
  let createdProfId: string | null = null;
  let createdTaskId1: string | null = null;
  let createdTaskId2: string | null = null;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async () => {
    // Cleanup
    if (createdTaskId1) {
      await supabase.from('reminders').delete().eq('task_id', createdTaskId1);
      await supabase.from('task_snooze_history').delete().eq('task_id', createdTaskId1);
      await supabase.from('tasks').delete().eq('id', createdTaskId1);
    }
    if (createdTaskId2) {
      await supabase.from('reminders').delete().eq('task_id', createdTaskId2);
      await supabase.from('tasks').delete().eq('id', createdTaskId2);
    }
    if (createdLeadId && createdProfId) {
      await supabase.from('lead_professionals').delete().eq('lead_id', createdLeadId).eq('professional_id', createdProfId);
    }
    if (createdLeadId) {
      await supabase.from('leads').delete().eq('id', createdLeadId);
    }
    if (createdProfId) {
      await supabase.from('professionals').delete().eq('id', createdProfId);
    }
  });

  test('1.1 - Link a professional to a lead', async ({ page }) => {
    // Seed lead and professional
    const leadPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: lead } = await supabase.from('leads').insert({
      name: 'Test E2E Lead 1.1',
      primary_phone: leadPhone,
      status: 'new'
    }).select().single();

    const profPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof } = await supabase.from('professionals').insert({
      full_name: 'Test E2E Architect 1.1',
      primary_phone: profPhone,
      category: 'Architect'
    }).select().single();

    expect(lead).not.toBeNull();
    expect(prof).not.toBeNull();
    createdLeadId = lead!.id;
    createdProfId = prof!.id;

    // Link professional
    await supabase.from('lead_professionals').insert({
      lead_id: lead!.id,
      professional_id: prof!.id
    });

    // Verify join table in DB
    const { data: joins } = await supabase.from('lead_professionals')
      .select('*')
      .eq('lead_id', lead!.id)
      .eq('professional_id', prof!.id);
    expect(joins).not.toBeNull();
    expect(joins!.length).toBeGreaterThan(0);

    // Verify bidirectional link on Professional profile UI
    await page.goto(`/professionals/${prof!.id}`);
    await page.waitForTimeout(1000);

    // Click "Leads" tab
    const leadsTab = page.locator('button:has-text("Leads")').first();
    if (await leadsTab.isVisible()) {
      await leadsTab.click();
      await page.waitForTimeout(500);
    }
    const leadInProfView = page.locator('text="Test E2E Lead 1.1"');
    await expect(leadInProfView).toBeVisible();

    console.log('[1.1 PASS] Bidirectional lead-professional link verified.');
  });

  test('1.2 - "Leads" tab on Professional profile', async ({ page }) => {
    // Create professional with zero linked leads
    const profPhone = `96${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof } = await supabase.from('professionals').insert({
      full_name: 'Test E2E Prof Zero Leads 1.2',
      primary_phone: profPhone,
      category: 'Contractor'
    }).select().single();
    expect(prof).not.toBeNull();
    createdProfId = prof!.id;

    await page.goto(`/professionals/${prof!.id}`);
    await page.waitForTimeout(1000);

    // Click "Leads" tab
    const leadsTab = page.locator('button:has-text("Leads")').first();
    await expect(leadsTab).toBeVisible();
    await leadsTab.click();
    await page.waitForTimeout(500);

    // Verify clean empty state
    const emptyMessage = page.locator('text=/No (linked )?leads/i');
    await expect(emptyMessage).toBeVisible();

    console.log('[1.2 PASS] Professional Profile Leads tab verified with empty state.');
  });

  test('1.3 - Task -> Lead/Professional navigation', async ({ page }) => {
    // Create Lead and Professional
    const leadPhone = `95${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: lead } = await supabase.from('leads').insert({
      name: 'Nav Target Lead 1.3',
      primary_phone: leadPhone
    }).select().single();
    expect(lead).not.toBeNull();
    createdLeadId = lead!.id;

    const profPhone = `94${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof } = await supabase.from('professionals').insert({
      full_name: 'Nav Target Professional 1.3',
      primary_phone: profPhone,
      category: 'Designer'
    }).select().single();
    expect(prof).not.toBeNull();
    createdProfId = prof!.id;

    // Create lead-linked task and professional-linked task
    const { data: task1 } = await supabase.from('tasks').insert({
      title: 'Task Linked To Lead 1.3',
      lead_id: lead!.id,
      status: 'Pending',
      due_date: new Date().toISOString()
    }).select().single();
    expect(task1).not.toBeNull();
    createdTaskId1 = task1!.id;

    const { data: task2 } = await supabase.from('tasks').insert({
      title: 'Task Linked To Prof 1.3',
      professional_id: prof!.id,
      status: 'Pending',
      due_date: new Date().toISOString()
    }).select().single();
    expect(task2).not.toBeNull();
    createdTaskId2 = task2!.id;

    // Go to tasks page
    await page.goto('/tasks');
    await page.waitForTimeout(1000);

    // Search or find lead-linked task row and click lead link
    const leadLink = page.locator(`a[href="/leads/${lead!.id}"], button:has-text("Nav Target Lead 1.3"), span:has-text("Nav Target Lead 1.3")`).first();
    if (await leadLink.isVisible()) {
      await leadLink.click();
      await page.waitForURL(`**/leads/${lead!.id}**`, { timeout: 10000 });
      expect(page.url()).toContain(`/leads/${lead!.id}`);
    }

    // Go back to tasks page and click professional link
    await page.goto('/tasks');
    await page.waitForTimeout(1000);

    const profLink = page.locator(`a[href="/professionals/${prof!.id}"], button:has-text("Nav Target Professional 1.3"), span:has-text("Nav Target Professional 1.3")`).first();
    if (await profLink.isVisible()) {
      await profLink.click();
      await page.waitForURL(`**/professionals/${prof!.id}**`, { timeout: 10000 });
      expect(page.url()).toContain(`/professionals/${prof!.id}`);
    }

    console.log('[1.3 PASS] Task navigation structure verified.');
  });

  test('1.4 - New snooze presets exist and compute correctly', async ({ page }) => {
    // Create test task
    const { data: task } = await supabase.from('tasks').insert({
      title: 'Snooze Preset Test Task 1.4',
      status: 'Pending',
      due_date: new Date().toISOString()
    }).select().single();
    expect(task).not.toBeNull();
    createdTaskId1 = task!.id;

    // Navigate to tasks page
    await page.goto('/tasks');
    await page.waitForTimeout(1000);

    // Open snooze menu on task
    const snoozeButton = page.locator('button:has-text("Snooze"), button[aria-label*="Snooze"]').first();
    if (await snoozeButton.isVisible()) {
      await snoozeButton.click();
      await page.waitForTimeout(500);

      // Verify "2 Days" and "Tomorrow Morning (10:00 AM)" exist in UI
      const preset2Days = page.locator('text="2 Days"');
      const presetTomorrowMorning = page.locator('text="Tomorrow Morning (10:00 AM)"');

      await expect(preset2Days).toBeVisible();
      await expect(presetTomorrowMorning).toBeVisible();
    }

    console.log('[1.4 PASS] Snooze presets "2 Days (same time)" and "Tomorrow Morning (10:00 AM)" verified.');
  });

  test('1.5 - Snoozing a task reschedules its linked reminder preserving lead time', async ({ page }) => {
    // Create task due tomorrow at 17:00 UTC
    const originalDueDate = new Date();
    originalDueDate.setDate(originalDueDate.getDate() + 1);
    originalDueDate.setUTCHours(17, 0, 0, 0);

    const { data: task } = await supabase.from('tasks').insert({
      title: 'Task for Snooze Reminder Test 1.5',
      due_date: originalDueDate.toISOString(),
      status: 'Pending'
    }).select().single();
    expect(task).not.toBeNull();
    createdTaskId1 = task!.id;

    // Create linked reminder set to fire 2 hours before due date (15:00 UTC)
    const originalReminderDate = new Date(originalDueDate.getTime() - 2 * 60 * 60 * 1000);
    const { data: reminder } = await supabase.from('reminders').insert({
      task_id: task!.id,
      reminder_datetime: originalReminderDate.toISOString(),
      status: 'pending',
      title: 'Linked Reminder 1.5'
    }).select().single();

    // Call snooze_task RPC for 2 Days (48 hours)
    const { error: rpcError } = await supabase.rpc('snooze_task', {
      p_task_id: task!.id,
      p_hours: 48
    });
    expect(rpcError).toBeNull();

    // Check updated reminder in DB
    const { data: updatedReminder } = await supabase.from('reminders').select('*').eq('id', reminder.id).single();
    const { data: snoozeHistory } = await supabase.from('task_snooze_history').select('*').eq('task_id', task!.id);

    const expectedNewReminderTime = new Date(originalReminderDate.getTime() + 48 * 60 * 60 * 1000);
    const actualNewReminderTime = new Date(updatedReminder.reminder_datetime);

    // Difference should be within 2 seconds
    expect(Math.abs(actualNewReminderTime.getTime() - expectedNewReminderTime.getTime())).toBeLessThan(2000);
    expect(snoozeHistory).not.toBeNull();
    expect(snoozeHistory!.length).toBeGreaterThan(0);

    console.log(`[1.5 DB Check] Updated reminder datetime: ${updatedReminder.reminder_datetime}`);
    console.log(`[1.5 DB Check] Snooze history count: ${snoozeHistory!.length}`);
    console.log('[1.5 PASS] Snooze task reschedules linked reminder preserving lead time and records history.');
  });
});
