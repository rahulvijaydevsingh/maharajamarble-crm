

# Fix Plan: Staff Creation Auth, Control Panel Alignment, and Form Integration

## Issues Identified

| # | Issue | Root Cause |
|---|-------|-----------|
| 1 | Staff creation fails with "Only admins can create staff" even for admin/super_admin users | The edge function uses a **service role** Supabase client to call `get_user_role` RPC. This RPC function uses `auth.uid()` internally, which is NULL when called via service role client. So the WHERE clause `_user_id = auth.uid() OR public.is_admin()` always evaluates to false, returning no role. |
| 2 | Materials: Control panel has 6 options, lead form has 10 | Control panel defaults have Italian Marble, Indian Marble, Granite, Quartz, Tiles, Onyx. The lead form (`MATERIAL_INTERESTS` constant) has Italian Marble, Granite (South), Granite (North), Quartz, Sandstone, Tiles, Onyx, Engineered Marble, Cladding Stone, Wooden Flooring. The form reads from the hardcoded constant, not from the control panel. |
| 3 | Lead form material options not managed by control panel | `SiteDetailsSection.tsx` imports `MATERIAL_INTERESTS` from constants instead of using `getFieldOptions("materials", "materials")`. |
| 4 | Lead form source/construction stage not managed by control panel | `SourceRelationshipSection.tsx` uses `LEAD_SOURCES` from constants. `SiteDetailsSection.tsx` uses `CONSTRUCTION_STAGES` from constants. Both have corresponding control panel fields but forms don't read from them. |
| 5 | Task form not managed by control panel | `AddTaskDialog.tsx` uses `TASK_TYPES`, `KIT_TASK_TYPES`, `TASK_PRIORITIES` from `taskConstants.ts` instead of `getFieldOptions`. |
| 6 | Customer form not managed by control panel | `AddCustomerDialog.tsx` uses constants from `customerConstants.ts`. Also, customer control panel is missing: source, city, and priority fields. |

## Technical Changes

### Fix 1: Edge Function Auth Fix

**Root cause detail:** The `get_user_role` SQL function has:
```sql
WHERE user_id = _user_id AND (_user_id = auth.uid() OR public.is_admin())
```
When called via service role client, `auth.uid()` is NULL. Even though service role bypasses RLS, `SECURITY DEFINER` functions still evaluate `auth.uid()` as NULL.

**Fix:** In `create-staff-user/index.ts` (and all similar edge functions), replace the RPC call with a direct query to `user_roles` table. The service role client bypasses RLS, so this works:

```typescript
// Instead of: supabase.rpc("get_user_role", { _user_id: requestingUser.id })
// Use direct query:
const { data: roleRow } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', requestingUser.id)
  .single();
const roleData = roleRow?.role;
```

Apply this fix to all edge functions that check admin roles:
- `create-staff-user/index.ts`
- `reset-staff-password/index.ts`
- `update-staff-profile/index.ts`
- `update-staff-role/index.ts`

### Fix 2: Update Control Panel Material Defaults

Update the `defaultSystemOptions` in `useControlPanelSettings.ts` to match the 10 materials in the lead form:

```
Italian Marble, Granite (South), Granite (North), Quartz, Sandstone,
Tiles, Onyx, Engineered Marble, Cladding Stone, Wooden Flooring
```

### Fix 3: Connect Lead Form to Control Panel

**Files to modify:**

**`SiteDetailsSection.tsx`:**
- Import `useControlPanelSettings`
- Replace `MATERIAL_INTERESTS` constant usage with `getFieldOptions("materials", "materials")`
- Replace `CONSTRUCTION_STAGES` constant usage with `getFieldOptions("leads", "construction_stage")`

**`SourceRelationshipSection.tsx`:**
- Import `useControlPanelSettings`
- Replace `LEAD_SOURCES` constant usage with `getFieldOptions("leads", "source")`

### Fix 4: Connect Task Form to Control Panel

**`AddTaskDialog.tsx`:**
- Import `useControlPanelSettings`
- Replace `TASK_TYPES` and `KIT_TASK_TYPES` with `getFieldOptions("tasks", "type")`
- Replace `TASK_PRIORITIES` with `getFieldOptions("tasks", "priority")`

**`EditTaskDialog.tsx`:**
- Same changes as AddTaskDialog

### Fix 5: Connect Customer Form to Control Panel

**`AddCustomerDialog.tsx`:**
- Import `useControlPanelSettings`
- Replace `CUSTOMER_TYPES` with `getFieldOptions("customers", "customer_type")`
- Replace `INDUSTRIES` with `getFieldOptions("customers", "industry")`
- Replace `CUSTOMER_SOURCES` with `getFieldOptions("customers", "customer_source")`
- Replace `CITIES` with `getFieldOptions("customers", "city")`
- Replace `PRIORITY_LEVELS` with `getFieldOptions("customers", "priority")`

### Fix 6: Add Missing Customer Control Panel Fields

Add to `defaultSystemOptions` in `useControlPanelSettings.ts` under the "customers" module:

- **customer_source**: Direct, Referral, Lead Conversion, Website, Social Media, Trade Show
- **city**: Same as professionals (Jaipur, Delhi, Mumbai, etc.)
- **priority**: Same 5-level priority as leads/professionals

### Fix 7: Add KIT Task Types to Control Panel

The control panel already has some KIT types (KIT Follow-up, KIT Relationship Check, KIT Touch Reminder) but the form uses different ones (KIT Call, KIT WhatsApp, KIT Visit, KIT Email, KIT Meeting). Update the control panel defaults to include all KIT task types from the form constants.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/create-staff-user/index.ts` | Replace `rpc("get_user_role")` with direct `user_roles` query |
| `supabase/functions/reset-staff-password/index.ts` | Same auth fix |
| `supabase/functions/update-staff-profile/index.ts` | Same auth fix |
| `supabase/functions/update-staff-role/index.ts` | Same auth fix |
| `src/hooks/useControlPanelSettings.ts` | Update material defaults (10 items); add customer source/city/priority fields; update KIT task types |
| `src/components/leads/smart-form/SiteDetailsSection.tsx` | Use control panel for materials and construction stages |
| `src/components/leads/smart-form/SourceRelationshipSection.tsx` | Use control panel for lead sources |
| `src/components/tasks/AddTaskDialog.tsx` | Use control panel for task types and priorities |
| `src/components/tasks/EditTaskDialog.tsx` | Use control panel for task types and priorities |
| `src/components/customers/AddCustomerDialog.tsx` | Use control panel for all dropdown options |

## Implementation Order

1. Fix edge function auth (direct query instead of RPC) and deploy
2. Update control panel defaults (materials, customer fields, KIT types)
3. Connect lead form to control panel (materials, sources, construction stages)
4. Connect task form to control panel (types, priorities)
5. Connect customer form to control panel (types, industries, sources, cities, priorities)

