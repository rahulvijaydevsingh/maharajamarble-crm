# Plan — Fix & Verify Session

## Exploration summary

I read all referenced files. Most of Parts B and C are **already correctly implemented** from the prior session, and **A1 is already in place too**. Only A2, A3, and A4 still need action — and A4 has a subtlety worth flagging before I touch anything.

---

## PART A

### A1 — Tab clipping

**Already applied — no edit.**

- `LeadDetailView.tsx:502-503`: `<div className="border-b overflow-x-auto"><TabsList className="h-12 bg-transparent gap-2 w-max px-6">` ✅
- `CustomerDetailView.tsx:435-436`: same pattern, on the 2nd `DialogContent` (the one with `[&>button]:hidden`) ✅

I will visually re-verify at 1280px and 768px after the rest is done.

### A2 — KIT progress bar

Current `KitProgressIndicator.tsx`:

```ts
const progressPercent = totalSteps > 0 ? ((currentStep) / totalSteps) * 100 : 0;
```

and label `Step {currentStep + 1} of {totalSteps}`.

The label is 1-indexed (`currentStep + 1`) while the bar is 0-indexed → **Bug D, off-by-one against the label.** When `current_step = 0` you see "Step 1 of 4" but the bar is at 0% (and at the other end "Step 4 of 4" gives 75%, then the final completed bump hits 100% which can also display weirdly). The user's stated symptom ("Step 1 of 4 shows full") is the same off-by-one symptom from the opposite direction in a different sub.

**Fix** (single line + safety clamps, no other changes):

```ts
const safeTotal = Math.max(totalSteps, 0);
const safeCurrent = Math.min(Math.max(currentStep, 0), safeTotal);
const progressPercent = safeTotal > 0
  ? Math.min(((safeCurrent + 1) / safeTotal) * 100, 100)
  : 0;
```

shadcn `Progress` expects 0–100 (confirmed in `src/components/ui/progress.tsx`), so Bug E does not apply.

I will report the before/after line in the final output.

### A3 — Leads page freeze after multiple reminder clicks

**Audit findings:**

- `useReminders.ts` already uses the shared `RemindersProvider` channel (mounted in `App.tsx`); fallback channel is only created when the provider is absent — not the leak path.
- `RemindersWidget` and `NotificationDropdown` both `navigate('/leads?view=…&tab=reminders&highlightReminder=…')` per click. Each navigation mounts a fresh `LeadDetailView` → `LeadProfileTab` (dynamic channel `lead-activity-${lead.id}`) and `useActivityLog` (static channel `activity_log_changes`).
- **Suspect:** `useActivityLog.ts:225-244` creates a channel named `activity_log_changes` whose **filter** varies by `leadId/customerId/professionalId`. Supabase JS allows multiple channels with the same name only if cleanup is synchronous. Under rapid navigation (click reminder → unmount old → mount new before unsubscribe ACK), channels with the same name and different filters can collide and the realtime socket eventually stops dispatching → UI appears frozen.

**Fix (minimal, in `useActivityLog.ts` only):**

1. Make the channel name **unique per instance**:
  ```ts
   .channel(`activity_log_${leadId || customerId || professionalId}`)
  ```
2. Keep the existing `removeChannel(channel)` cleanup as-is.

This matches the "Session 7 thundering-herd" fix pattern (per-id channels with strict cleanup) without changing any subscription semantics. No new subscriptions added.

If after this change the freeze still reproduces, I will report ⚠️ and ask to add a teardown delay or to consolidate to a single global activity channel with client-side filtering — but I expect the unique-name fix to be sufficient.

### A4 — `last_follow_up` not updating

**The call sites are already correct** in `useTasks.ts:642-648`:

```ts
if (data.lead_id) void syncLeadFollowUpDates(data.lead_id);
if (data.related_entity_type === 'lead' && data.related_entity_id && data.related_entity_id !== data.lead_id) {
  void syncLeadFollowUpDates(data.related_entity_id);
}
if (data.related_entity_type === 'customer' && data.related_entity_id) {
  void syncCustomerFollowUpDates(data.related_entity_id);
}
```

Same pattern for `addTask` (507-513) and `deleteTask` (833-839).

**However**, the *internal* queries inside `syncLeadFollowUpDates` (`useTasks.ts:166-226`) only filter `eq('lead_id', leadId)`. A task that is linked **only** via `related_entity_type='lead' / related_entity_id=<lead>` (no `lead_id` set) will still be missed by the SELECT, so even though sync is called with the right id, the MAX(completed_at) returns nothing and `last_follow_up` does not advance.

The brief says **"do NOT touch the sync function's internal logic — only fix where it's called."** The call-side fix is already in place. To honor the constraint I will **not** modify the sync internals.

**Status I will report:** ✅ already wired at call site, with a note that the residual symptom (if it still occurs) traces to the internal `lead_id`-only filter — please confirm whether to extend the sync's SELECT or to also stamp `lead_id` when creating related-entity tasks. No code edit until you decide.

No professional sync function exists; adding one is out of scope per the brief.

---

## PART B — Verifications (read-only)


| Item | Result    | Evidence                                                                                                                                                                                                                                                      |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | ✅ Correct | Both tabs import `TaskDetailView`, use `detailTaskId` + `detailOpen` two-state pattern; no `useTaskDetailModal`.                                                                                                                                              |
| B2   | ✅ Correct | Picker block at `TaskCompletionDialog.tsx:1134` precedes form block at 1236; `hideDueDateTime={true}` at 1308; `TaskFormFields.tsx:203` wraps with `{!hideDueDateTime && (...)}`; `followUpMinTime` caps `"23:30"` (line 366); errors go to `followUpErrors`. |
| B3   | ✅ Correct | `TaskDetailView.tsx`: imports `ProfessionalDetailView` (38), `useProfessionals` store-first (81), `openProfessionalDetailById` (383), rendered locally (835). No `navigate('/professionals…')`.                                                               |
| B4   | ✅ Correct | `useTasks.ts:617-622` spreads `completion_*` fields from `data`; description prefers `data.completion_notes` (601); `ActivityLogItem.tsx:251` has dedicated outcome block.                                                                                    |
| B5   | ✅ Correct | `useActivityLog(leadId?, customerId?, professionalId?)`; `professionalId` branch at lines 80-83; `ProfessionalDetailView.tsx:326` calls with `(undefined, undefined, professional?.id)`; Load-more wired at 394-396.                                          |
| B6   | ✅ Correct | `Quotations.tsx:197-199` scopes color-adjust to `#pdf-print-container, #pdf-print-container *`, no `px-6`; `QuotationPDFTemplate.tsx:69-70` sets both inline styles.                                                                                          |


## PART C — AddCustomer

All four points ✅ Correct in `AddCustomerDialog.tsx:203-232`:

- (1) `onOpenChange(false)` + `resetForm()` after `await addTask(...)`.
- (2) `related_entity_type: "customer"`, `related_entity_id: newCustomer.id`, `priority: "Medium"`, `status: "Pending"`, `assigned_to: formData.assigned_to` (full_name from staff dropdown).
- (3) Follow-up section gated on `!editingCustomer` (line 381).
- (4) Title auto-fills to `Follow-up: ${formData.name}` on first check only (line 390).

---

## Files I will edit

1. `src/components/kit/KitProgressIndicator.tsx` — fix off-by-one + clamp (A2).
2. `src/hooks/useActivityLog.ts` — make realtime channel name unique per entity id (A3).

No edits to schema, edge functions, packages, `index.html`, z-index/ZLayer, tab labels, or anything in A1/B*/C*.

## Output

I will return the exact status block requested, including A2 before/after, A3 root cause, and the A4 note asking for your decision on the sync-internal-query question.  
  
  
**New Issue A5 — Secure** `run-automations` **Edge Function (Step 2.1 only)**

**File:** `supabase/functions/run-automations/index.ts`

Add dual-mode auth at the very top of the request handler, before any other logic:

ts

```ts
const REQUIRE_SECRET = Deno.env.get("AUTOMATION_REQUIRE_SECRET") === "true";
const EXPECTED_SECRET = Deno.env.get("AUTOMATION_INTERNAL_SECRET");
const providedSecret = req.headers.get("x-internal-secret");
const secretValid = !!(EXPECTED_SECRET && providedSecret === EXPECTED_SECRET);

console.log(`[Automation] secret_provided=${!!providedSecret} secret_valid=${secretValid} require=${REQUIRE_SECRET}`);

if (REQUIRE_SECRET && !secretValid) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Critical constraints:**

- Deploy with `AUTOMATION_REQUIRE_SECRET` env var NOT SET (defaults to `false`) — this means zero behavior change on deploy. Nothing breaks.
- Do NOT set `AUTOMATION_REQUIRE_SECRET=true` in code — that env var is set manually in the Supabase dashboard AFTER verifying all webhooks send the secret header.
- Do NOT change any other logic in the function.
- Do NOT add CORS changes or any other modifications.

**After Lovable deploys this code**, you (Nipun) must manually do two steps in the Supabase dashboard before the security is actually enforced:

1. Go to Database → Webhooks → edit each webhook → add header `x-internal-secret: <your-chosen-secret>`. Set the same secret as `AUTOMATION_INTERNAL_SECRET` env var in the function.
2. Watch function logs for 24 hours. Every call should show `secret_provided=true secret_valid=true`. Only after a clean 24h, set `AUTOMATION_REQUIRE_SECRET=true` in the function env vars.

**Acceptance criteria for this code change only:** Function deploys successfully. Automations continue firing exactly as before (since `REQUIRE_SECRET` defaults to false). Logs show the new audit line on each invocation.  
  
**On A2:** Before applying the fix, confirm: what is the value of `currentStep` when a KIT program is just activated and zero touches have been completed? If it is `0`, use `safeCurrent / safeTotal` (not `safeCurrent + 1`). If the first active step is always `1`, use `safeCurrent / safeTotal` still. Only use `(safeCurrent + 1)` if `currentStep` is 0-indexed AND the label correctly shows it as 1-indexed. Report the raw data value before fixing.

**On A4:** Override the "do not touch sync internals" constraint. In `syncLeadFollowUpDates` inside `useTasks.ts`, the internal Supabase SELECT queries tasks only with `.eq('lead_id', leadId)`. Change this to also include tasks linked via `related_entity_type='lead'` and `related_entity_id=leadId`. The correct filter should be:

ts

```ts
.or(`lead_id.eq.${leadId},and(related_entity_type.eq.lead,related_entity_id.eq.${leadId})`)
```

Apply the equivalent fix inside `syncCustomerFollowUpDates` for customer-linked tasks. This is the actual root cause — without it, completing a task linked via `related_entity_type` will never update `last_follow_up` regardless of how the call sites are wired.