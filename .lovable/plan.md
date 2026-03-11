

## Audit Results & Fix Plan

After reviewing all modules, I found several gaps where modules are not fully connected. Here is the breakdown:

### Issue 1: Missing Staff Activity Logging in Customers & Professionals Hooks

**`useCustomers.ts`** has zero `logToStaffActivity` calls -- customer add/update/delete actions are invisible in Staff Activity.

**`useProfessionals.ts`** also has zero `logToStaffActivity` calls -- professional add/update/delete are untracked.

**Fix**: Add `logToStaffActivity` calls in `addCustomer`, `updateCustomer`, `deleteCustomer`, `addProfessional`, `updateProfessional`, `deleteProfessional` -- same pattern used in `useLeads.ts` and `useTasks.ts`.

### Issue 2: Staff Activity Panel Missing Action Labels

`StaffActivityPanel.tsx` is missing labels for several action types that are actually logged:
- `lead_assigned` 
- `restore_lead`
- `permanent_delete_lead`
- `quotation_status_changed`
- `update_professional`
- `delete_professional`
- `delete_customer`
- `create_customer` (exists but `delete_customer` missing)
- `task_snoozed` label exists but no matching key in some paths

**Fix**: Add all missing action type labels to `ACTION_TYPE_LABELS`.

### Issue 3: Backup Config Missing New Tables

The backup system (`crmBackupConfig.ts`) does not include tables added for newer modules:
- **WhatsApp**: `whatsapp_settings`, `whatsapp_sessions`, `whatsapp_messages`, `whatsapp_queue`
- **Performance**: `performance_targets`, `staff_performance_notes`, `performance_trigger_log`, `widget_preferences`
- **Staff Activity**: `staff_activity_log`
- **HR**: `attendance_records`, `leave_requests`, `salary_records`, `staff_hr_settings`
- **Notifications**: `notifications` is in delete/insert order but not mapped to any module

**Fix**: Add new backup module keys (`whatsapp`, `hr`, `performance`, `staff_logs`) or add tables to existing modules. Add to `MODULE_TO_TABLES`, `REPLACE_DELETE_ORDER`, `RESTORE_INSERT_ORDER`, and `UPSERT_CONFLICT_TARGET`.

### Issue 4: Quotation Creation Not Logged to Staff Activity

`useQuotations.ts` only logs `quotation_status_changed` -- the initial `addQuotation` and `deleteQuotation` calls have no staff activity logging.

**Fix**: Add `logToStaffActivity("create_quotation", ...)` in `addQuotation` and `logToStaffActivity("delete_quotation", ...)` in `deleteQuotation`.

### Files to Modify

| File | Changes |
|---|---|
| `src/hooks/useCustomers.ts` | Add staff activity logging to add/update/delete |
| `src/hooks/useProfessionals.ts` | Add staff activity logging to add/update/delete |
| `src/hooks/useQuotations.ts` | Add staff activity logging to create/delete |
| `src/components/settings/StaffActivityPanel.tsx` | Add all missing action type labels |
| `supabase/functions/_shared/crmBackupConfig.ts` | Add WhatsApp, HR, Performance, Staff Logs tables to backup config |

### Implementation Order
1. Staff activity logging in hooks (Customers, Professionals, Quotations)
2. Staff Activity Panel labels
3. Backup config update

