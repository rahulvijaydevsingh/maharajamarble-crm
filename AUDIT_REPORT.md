# Maharaja Marble CRM — Code Audit Report
Generated: 2025-05-14

## Summary
| Severity | Count |
|----------|-------|
| BLOCKER  | 11    |
| WARN     | 18    |
| INFO     | 20    |

## Area 1 — Silent Error Swallows
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/hooks/useTasks.ts | ~206 / `addTask` | INFO | Log operation `logToStaffActivity` silently suppressed with empty catch block. |
| src/hooks/useTasks.ts | ~272 / `updateTask` | INFO | Log operation `logToStaffActivity` silently suppressed with empty catch block. |
| src/hooks/useTasks.ts | ~363 / `snoozeTask` | BLOCKER | Supabase INSERT to `task_activity_log` suppresses error with `console.warn`. |
| src/hooks/useTasks.ts | ~378 / `snoozeTask` | BLOCKER | Supabase INSERT to `activity_log` suppresses error with `console.warn`. |
| src/hooks/useTasks.ts | ~431 / `deleteTask` | INFO | Log operation `logToStaffActivity` silently suppressed with empty catch block. |
| src/components/tasks/TaskCompletionDialog.tsx | ~189 / `logTaskActivity` | BLOCKER | Supabase INSERT to `task_activity_log` suppresses error with `console.warn`. |
| src/components/tasks/TaskCompletionDialog.tsx | ~206 / `logLeadActivity` | BLOCKER | Supabase INSERT to `activity_log` suppresses error with `console.warn`. |
| src/components/tasks/TaskCompletionDialog.tsx | ~347 / `handleSubmit` | BLOCKER | Supabase INSERT to `activity_log` suppresses error with `console.warn` (follow-up creation). |
| src/components/tasks/TaskCompletionDialog.tsx | ~368 / `handleSubmit` | INFO | Log operation `logToStaffActivity` silently suppressed with empty catch block. |

## Area 2 — TypeScript Safety
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/hooks/useApiKeys.ts | 60 | WARN | TypeScript safety bypassed with `as any` on `api_keys` table. |
| src/hooks/useStaffActivityLog.ts | 34 | WARN | TypeScript safety bypassed with `as any` on `staff_activity_log` table. |
| src/hooks/useStaffActivityLog.ts | 60 | WARN | TypeScript safety bypassed with `as any` on `staff_activity_log` table select. |
| src/hooks/useTasks.ts | 458 | WARN | TypeScript safety bypassed with `as any` on `task_activity_log` table. |
| src/hooks/usePerformanceMetrics.ts | 117 | WARN | TypeScript safety bypassed with `as any` on `staff_activity_log` table. |
| src/hooks/usePerformanceMetrics.ts | 281 | WARN | TypeScript safety bypassed with `as any` on `staff_activity_log` table. |
| src/components/tasks/EditTaskDialog.tsx | 374 | WARN | TypeScript safety bypassed with `as any` on `task_activity_log` table. |
| src/components/tasks/TaskCompletionDialog.tsx | 210 | WARN | TypeScript safety bypassed with `as any` on `task_activity_log` table. |
| src/components/leads/LeadDetailView.tsx | 284 | WARN | TypeScript safety bypassed with `as any` on `tasks` table update. |

## Area 3 — Data Field Consistency
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/pages/Leads.tsx | 65 / `handleAddLead` | INFO | `assigned_to` stores `staffMembers.find(...).name` (Full Name). |
| src/pages/Leads.tsx | 151 / `handleAddLead` | INFO | `created_by` stores `profile?.full_name \|\| user?.email \|\| "unknown"`. |
| src/components/leads/BulkUploadDialog.tsx | 521 / `handleImport` | INFO | `assigned_to` stores `lead.assigned_to` (Full Name from parsed Excel). |
| src/hooks/useTasks.ts | 200 / `addTask` | INFO | `created_by` stores `profile?.full_name \|\| user?.email \|\| "unknown"`. |
| src/hooks/useKitSubscriptions.ts | 120 / `activateMutation` | INFO | `created_by` stores `profile?.full_name \|\| user?.email \|\| 'system'`. |
| src/hooks/useKitSubscriptions.ts | 134 / `activateMutation` | INFO | `assigned_to` (touches) stores `assignedTo` (variable). |
| src/hooks/useKitPresets.ts | 48 / `createPresetMutation` | INFO | `created_by` stores `profile?.full_name \|\| user?.email \|\| 'system'`. |
| src/components/kit/KitProfileTab.tsx | 224 / `handleActivate` | INFO | `assigned_to` (reminders) stores `touch.assigned_to \|\| assignedTo`. |
| src/components/calendar/AddCalendarEventDialog.tsx | 114 / `onSubmit` | INFO | `assigned_to` (tasks) stores `data.assignedTo` (Full Name/Email from form). |
| src/components/calendar/AddCalendarEventDialog.tsx | 115 / `onSubmit` | INFO | `created_by` (tasks) stores `profile?.full_name \|\| user?.email \|\| "System"`. |
| src/components/calendar/AddCalendarEventDialog.tsx | 138 / `onSubmit` | INFO | `assigned_to` (reminders) stores `data.assignedTo`. |
| src/components/calendar/AddCalendarEventDialog.tsx | 139 / `onSubmit` | INFO | `created_by` (reminders) stores `profile?.full_name \|\| user?.email \|\| "System"`. |
| src/components/calendar/AddCalendarEventDialog.tsx | 78 | INFO | `assignedTo` default value in form is `user?.email`. |
| src/components/leads/BulkUploadDialog.tsx | 797 | INFO | `created_by` (tasks) stores `profile?.full_name \|\| user?.email \|\| "Photo Upload"`. |

## Area 4 — Duplicate Constants
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/constants/professionalConstants.ts<br>src/constants/customerConstants.ts | 36<br>51 | WARN | `CITIES` defined in both files with identical values. |
| src/constants/leadConstants.ts<br>src/components/leads/UnifiedLeadForm.tsx | 3<br>50 | BLOCKER | `MATERIAL_INTERESTS` diverged: leadConstants uses snake_case keys (italian_marble, etc), while UnifiedLeadForm uses title case strings (Marble Flooring, etc). |
| src/constants/leadConstants.ts<br>src/components/leads/filters/SavedFilterDialog.tsx | 29<br>157 | WARN | `CONSTRUCTION_STAGES` defined in both files with identical values. |
| src/constants/leadConstants.ts<br>src/components/leads/UnifiedLeadForm.tsx | 20<br>45 | BLOCKER | `LEAD_SOURCES` diverged: leadConstants defines 5 sources (walk_in, etc), while UnifiedLeadForm defines 8 different sources (Website, Social Media, etc). |

## Area 5 — Mock Data in Production
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/constants/leadConstants.ts | 106 | WARN | `MOCK_PROFESSIONALS` present in production constant file. |
| src/constants/leadConstants.ts | 150 | WARN | `MOCK_EXISTING_RECORDS` present in production constant file. |
| src/constants/leadConstants.ts | 167-191 | WARN | Hardcoded phone numbers starting with 9876543 found in `MOCK_PROFESSIONALS`. |
| src/constants/leadConstants.ts | 197-199 | WARN | Hardcoded phone numbers starting with 9876543 found in `MOCK_EXISTING_RECORDS`. |

## Area 6 — Performance
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/hooks/useDashboardStats.ts | 46, 85, 106, 126 | WARN | Sequential awaits for `leads`, `tasks`, `customers`, and `reminders` queries. These are independent and should use `Promise.all`. |

## Area 7 — Automation Engine
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| supabase/functions/run-automations/index.ts | 148 / `resolveProfileByNameOrEmail` | INFO | Correct: dual lookup by `full_name` or `email` implemented. |
| supabase/functions/run-automations/index.ts | 223 / `executeAction` | BLOCKER | Notification `user_id` set to `p.email` instead of UUID. |
| supabase/functions/run-automations/index.ts | N/A | WARN | Missing infinite loop protection: No check to see if automation was triggered by another automation. |
| supabase/functions/run-automations/index.ts | 365 / `executeAction` | WARN | Template variable sanitization missing: `resolvedNote` uses raw `.replace()` without escaping. |

## Area 8 — Component Complexity
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| src/components/tasks/EnhancedTaskTable.tsx | 1760 lines | BLOCKER | 1760 lines, 30 useState hooks. Excessive complexity. |
| src/components/leads/EnhancedLeadTable.tsx | 1359 lines | BLOCKER | 1359 lines, 35 useState hooks. Excessive complexity. |
| src/components/leads/BulkUploadDialog.tsx | 1407 lines | BLOCKER | 1407 lines, 18 useState hooks. Excessive complexity. |

## Area 9 — RLS Compatibility
| File | Line / Function | Severity | Issue Summary |
|------|----------------|----------|---------------|
| supabase/migrations/20260221080321_625be088-2305-47f7-90c2-44ba90b1252a.sql | 3 | INFO | `is_assigned_to_me` correctly matches both `full_name` and `email`. Function body:<br>```sql<br>CREATE OR REPLACE FUNCTION public.is_assigned_to_me(assigned_to_value text)<br>RETURNS boolean<br>LANGUAGE sql<br>STABLE<br>SECURITY DEFINER<br>SET search_path = 'public'<br>AS $$<br>  SELECT EXISTS (<br>    SELECT 1 FROM public.profiles<br>    WHERE id = auth.uid()<br>    AND (full_name = assigned_to_value OR email = assigned_to_value)<br>  );<br>$$;<br>``` |

## Top Priority Issues
1. **Component Complexity (Area 8):** `EnhancedTaskTable.tsx` and `EnhancedLeadTable.tsx` have exceeded 1000 lines (up to 1760) and 30+ useState hooks, creating significant maintenance risk and potential for regressions.
2. **Broken Automation Notifications (Area 7):** Automation engine sets `user_id` to an email string instead of a UUID in the `notifications` table, likely causing silent failures or foreign key violations in production.
3. **Diverged Business Logic (Area 4):** `LEAD_SOURCES` and `MATERIAL_INTERESTS` have diverged between the constants file and the `UnifiedLeadForm`, leading to inconsistent UI options and potential data integrity issues.
4. **Silent Write Failures (Area 1):** Multiple Supabase INSERT operations in `useTasks.ts` and `TaskCompletionDialog.tsx` suppress errors with `console.warn`, leading to silent data loss for activity logs.
5. **Security/Performance (Area 2 & 6):** Extensive use of `as any` bypasses TypeScript safety on critical DB operations, and sequential awaits in `useDashboardStats` significantly slow down the initial dashboard load.
