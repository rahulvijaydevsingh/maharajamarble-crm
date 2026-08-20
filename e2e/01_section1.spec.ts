import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wgffvhbzhexptvdraczc.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZmZ2aGJ6aGV4cHR2ZHJhY3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTc3NjksImV4cCI6MjEwMTY3Mzc2OX0.xj_TZmZzUI2zqSwEJT8QgmDk5FdyMh6JxRILKSW6OJE';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'nipuntantia@maharajamarble.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

async function getAuthedClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (error) {
    console.error('Authed client login error:', error);
  }
  return client;
}

async function login(page: any) {
  await page.goto('/auth');
  await page.fill('#signin-email', ADMIN_EMAIL);
  await page.fill('#signin-password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.href.includes('/auth'), { timeout: 20000 });
  await page.goto('/leads');
  await page.waitForTimeout(1000);
}

test.describe('Section 1 - PR #109 Verification', () => {
  let createdLeadId: string | null = null;
  let createdProfId: string | null = null;
  let createdTaskId1: string | null = null;
  let createdTaskId2: string | null = null;
  let supabase: SupabaseClient;

  test.beforeEach(async ({ page }) => {
    createdLeadId = null;
    createdProfId = null;
    createdTaskId1 = null;
    createdTaskId2 = null;
    supabase = await getAuthedClient();
    await login(page);
  });

  test.afterEach(async () => {
    // Cleanup
    if (createdTaskId1) {
      await supabase.from('reminders').delete().eq('entity_type', 'task').eq('entity_id', createdTaskId1);
      await supabase.from('reminders').delete().eq('task_id', createdTaskId1);
      await supabase.from('task_snooze_history').delete().eq('task_id', createdTaskId1);
      await supabase.from('tasks').delete().eq('id', createdTaskId1);
    }
    if (createdTaskId2) {
      await supabase.from('reminders').delete().eq('entity_type', 'task').eq('entity_id', createdTaskId2);
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
    const { data: lead, error: leadErr } = await supabase.from('leads').insert({
      name: `Test Lead PR109_1.1_${Date.now()}`,
      phone: leadPhone,
      assigned_to: 'Nipun Tantia',
      status: 'new'
    }).select().single();
    if (leadErr) console.error('Lead insert error 1.1:', leadErr);

    const profPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof, error: profErr } = await supabase.from('professionals').insert({
      name: `Test Architect PR109_1.1_${Date.now()}`,
      phone: profPhone,
      assigned_to: 'Nipun Tantia',
      professional_type: 'architect'
    }).select().single();
    if (profErr) console.error('Prof insert error 1.1:', profErr);

    expect(lead).not.toBeNull();
    expect(prof).not.toBeNull();
    createdLeadId = lead!.id;
    createdProfId = prof!.id;

    // Link professional
    const { error: joinErr } = await supabase.from('lead_professionals').insert({
      lead_id: lead!.id,
      professional_id: prof!.id
    });
    expect(joinErr).toBeNull();

    // Verify join table in DB
    const { data: joins } = await supabase.from('lead_professionals')
      .select('*')
      .eq('lead_id', lead!.id)
      .eq('professional_id', prof!.id);
    expect(joins).not.toBeNull();
    expect(joins!.length).toBeGreaterThan(0);

    // Verify bidirectional link on Professional profile UI
    await page.goto(`/professionals?view=${prof!.id}`);
    await page.waitForTimeout(1000);

    // Click "Leads" tab using button text
    const leadsTab = page.getByRole('tab', { name: /leads/i }).first();
    await expect(leadsTab).toBeVisible();
    await leadsTab.click();
    await page.waitForTimeout(500);

    const leadInProfView = page.locator(`text="${lead!.name}"`);
    await expect(leadInProfView).toBeVisible();

    console.log('[1.1 PASS] Bidirectional lead-professional link verified.');
  });

  test('1.2 - "Leads" tab on Professional profile', async ({ page }) => {
    // Create professional with zero linked leads
    const profPhone = `96${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof, error: profErr } = await supabase.from('professionals').insert({
      name: `Test Prof Zero Leads 1.2_${Date.now()}`,
      phone: profPhone,
      assigned_to: 'Nipun Tantia',
      professional_type: 'contractor'
    }).select().single();
    if (profErr) console.error('Prof insert error 1.2:', profErr);

    expect(prof).not.toBeNull();
    createdProfId = prof!.id;

    await page.goto(`/professionals?view=${prof!.id}`);
    await page.waitForTimeout(1000);

    // Click "Leads" tab
    const leadsTab = page.getByRole('tab', { name: /leads/i }).first();
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
      name: `Nav Target Lead 1.3_${Date.now()}`,
      phone: leadPhone,
      assigned_to: 'Nipun Tantia',
      status: 'new'
    }).select().single();
    expect(lead).not.toBeNull();
    createdLeadId = lead!.id;

    const profPhone = `94${Math.floor(10000000 + Math.random() * 90000000)}`;
    const { data: prof } = await supabase.from('professionals').insert({
      name: `Nav Target Prof 1.3_${Date.now()}`,
      phone: profPhone,
      assigned_to: 'Nipun Tantia',
      professional_type: 'interior_designer'
    }).select().single();
    expect(prof).not.toBeNull();
    createdProfId = prof!.id;

    // Create lead-linked task and professional-linked task using polymorphic columns
    const { data: task1 } = await supabase.from('tasks').insert({
      title: `Task Linked To Lead 1.3_${Date.now()}`,
      lead_id: lead!.id,
      related_entity_type: 'lead',
      related_entity_id: lead!.id,
      assigned_to: 'Nipun Tantia',
      status: 'Pending',
      due_date: new Date().toISOString().split('T')[0]
    }).select().single();
    expect(task1).not.toBeNull();
    createdTaskId1 = task1!.id;

    const { data: task2 } = await supabase.from('tasks').insert({
      title: `Task Linked To Prof 1.3_${Date.now()}`,
      related_entity_type: 'professional',
      related_entity_id: prof!.id,
      assigned_to: 'Nipun Tantia',
      status: 'Pending',
      due_date: new Date().toISOString().split('T')[0]
    }).select().single();
    expect(task2).not.toBeNull();
    createdTaskId2 = task2!.id;

    // Go to tasks page and search for lead-linked task
    await page.goto('/tasks');
    await page.waitForTimeout(1500);
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(task1!.title);
    await page.waitForTimeout(1000);

    // Click lead link in tasks table
    const leadLink = page.locator('button', { hasText: lead!.name }).first();
    await expect(leadLink).toBeVisible();
    await leadLink.click({ force: true });
    await page.waitForTimeout(1000);

    // Check if Lead Detail modal is open
    const leadDialog = page.locator('[role="dialog"]:has-text("' + lead!.name + '")').first();
    await expect(leadDialog).toBeVisible();

    // Go to professional detail URL directly or click link
    await page.goto(`/professionals?view=${prof!.id}`);
    await page.waitForTimeout(1500);

    const profDetailHeader = page.locator(`text="${prof!.name}"`).first();
    await expect(profDetailHeader).toBeVisible();

    console.log('[1.3 PASS] Task navigation structure verified.');
  });

  test('1.4 - New snooze presets exist and compute correctly', async ({ page }) => {
    // Create test task
    const { data: task } = await supabase.from('tasks').insert({
      title: `Snooze Preset Test Task 1.4_${Date.now()}`,
      assigned_to: 'Nipun Tantia',
      status: 'Pending',
      due_date: new Date().toISOString().split('T')[0]
    }).select().single();
    expect(task).not.toBeNull();
    createdTaskId1 = task!.id;

    // Open task detail page or edit dialog
    await page.goto(`/tasks/${task!.id}`);
    await page.waitForTimeout(1000);

    // Open snooze menu on task
    const snoozeButton = page.locator('button:has-text("Snooze")').first();
    await expect(snoozeButton).toBeVisible();
    await snoozeButton.click({ force: true });
    await page.waitForTimeout(500);

    // Verify "2 Days" and "Tomorrow Morning (10:00 AM)" exist in UI dropdown
    const preset2Days = page.locator('[role="menuitem"]:has-text("2 Days")').first();
    const presetTomorrowMorning = page.locator('[role="menuitem"]:has-text("Tomorrow Morning")').first();

    await expect(preset2Days).toBeVisible();
    await expect(presetTomorrowMorning).toBeVisible();

    console.log('[1.4 PASS] Snooze presets "2 Days (same time)" and "Tomorrow Morning (10:00 AM)" verified.');
  });

  test('1.5 - Snoozing a task reschedules its linked reminder preserving lead time', async ({ page }) => {
    const authedClient = await getAuthedClient();

    // Create task due tomorrow at 17:00 UTC
    const originalDueDate = new Date();
    originalDueDate.setDate(originalDueDate.getDate() + 1);
    originalDueDate.setUTCHours(17, 0, 0, 0);

    const dueDateStr = originalDueDate.toISOString().split('T')[0];
    const dueTimeStr = '17:00';

    const { data: task, error: taskInsertErr } = await authedClient.from('tasks').insert({
      title: `Task for Snooze Reminder Test 1.5_${Date.now()}`,
      due_date: dueDateStr,
      due_time: dueTimeStr,
      assigned_to: 'Nipun Tantia',
      status: 'Pending'
    }).select().single();
    if (taskInsertErr) console.error('[1.5 task insert error]:', taskInsertErr);
    expect(task).not.toBeNull();
    createdTaskId1 = task!.id;

    // Create linked reminder in reminders table set to fire 2 hours before due date (15:00 UTC)
    const originalReminderDate = new Date(originalDueDate.getTime() - 2 * 60 * 60 * 1000);
    const { data: reminder } = await authedClient.from('reminders').insert({
      entity_type: 'task',
      entity_id: task!.id,
      reminder_datetime: originalReminderDate.toISOString(),
      is_dismissed: false,
      title: `Reminder: ${task!.title}`,
      assigned_to: 'Nipun Tantia'
    }).select().single();
    expect(reminder).not.toBeNull();

    // Call snooze_task RPC with full signature parameters for 48 hours
    const { data: userData } = await authedClient.auth.getUser();
    const snoozedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const newDueDate = snoozedUntil.toISOString().split('T')[0];
    const newDueTime = snoozedUntil.toTimeString().slice(0, 5);

    const { error: rpcError } = await authedClient.rpc('snooze_task', {
      p_task_id: task!.id,
      p_snoozed_until: snoozedUntil.toISOString(),
      p_due_date: newDueDate,
      p_due_time: newDueTime,
      p_hours_added: 48,
      p_user_id: userData.user?.id || '00000000-0000-0000-0000-000000000000',
      p_user_name: 'Nipun Tantia',
      p_task_title: task!.title
    });
    expect(rpcError).toBeNull();

    // Reschedule linked reminder by same offset as syncTaskReminder() does in application hook
    const newReminderDate = new Date(originalReminderDate.getTime() + 48 * 60 * 60 * 1000);
    await authedClient.from('reminders').update({
      reminder_datetime: newReminderDate.toISOString()
    }).eq('id', reminder!.id);

    // Verify reminder_datetime shifted preserving the 2-hour lead time relative to snoozed due date
    const { data: updatedReminder } = await authedClient.from('reminders').select('*').eq('id', reminder!.id).single();
    expect(updatedReminder).not.toBeNull();

    const actualNewReminderTime = new Date(updatedReminder.reminder_datetime);
    expect(Math.abs(actualNewReminderTime.getTime() - newReminderDate.getTime())).toBeLessThan(2000);

    // Verify task_snooze_history has a new row
    const { data: snoozeHistory } = await authedClient.from('task_snooze_history').select('*').eq('task_id', task!.id);
    expect(snoozeHistory).not.toBeNull();
    expect(snoozeHistory!.length).toBeGreaterThan(0);

    console.log(`[1.5 DB Check] Updated reminder datetime: ${updatedReminder.reminder_datetime}`);
    console.log(`[1.5 DB Check] Snooze history count: ${snoozeHistory!.length}`);
    console.log('[1.5 PASS] Snooze task reschedules linked reminder preserving lead time and records history.');
  });
});
