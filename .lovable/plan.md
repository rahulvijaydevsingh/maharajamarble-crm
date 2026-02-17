# Plan: Bulk Professional Upload, Control Panel Default Verification, and Professional Profile View

## Summary of Findings

### Staff Creation

The edge function is working correctly (tested - returns 200). The fix from the previous plan (direct `user_roles` query) is in place. The error the user saw was likely a cached state or the client-side `isAdmin()` check in `useStaffManagement.ts` not detecting the role correctly. The client-side `AuthContext` still uses `supabase.rpc("get_user_role")` which could fail silently. I'll add a fallback direct query for role detection in `AuthContext`.

### Bulk Professional Upload

Currently, bulk upload only exists for Leads (`BulkUploadDialog.tsx`). We need a similar component for Professionals with:

- Excel template download with options reference sheet
- File upload, validation, duplicate phone checking
- Import with progress tracking

### Excel Template Options Sync

The Lead bulk upload template (`BulkUploadDialog.tsx` lines 300-320) uses **hardcoded constants** (`LEAD_SOURCES`, `CONSTRUCTION_STAGES`, `MATERIAL_INTERESTS`) instead of control panel options. This means if options are changed in the control panel, the Excel template won't reflect them. Same issue needs to be prevented for the new Professional template.

### Control Panel Default Values

The `isDefault` flag exists in the control panel options. Forms currently don't check for defaults when initializing. Need to verify and wire up default detection so that when a field has a default option, the form pre-selects it.

### Professional Name as Clickable Profile Link

The Lead table uses `LeadDetailView` opened via `selectedLead` state. The Professional table currently shows the name as plain text. Need to make it clickable to open a profile view(same tabs and option as for a lead), with fallback to firm name, then to phone number.

---

## Implementation Details

### 1. Fix AuthContext Role Detection Fallback

**File:** `src/contexts/AuthContext.tsx`

The `fetchUserData` function calls `supabase.rpc("get_user_role")` which can fail silently. Add a fallback direct query to `user_roles` table:

```typescript
// Try RPC first, fallback to direct query
const { data: roleData } = await supabase.rpc("get_user_role", { _user_id: userId });
if (roleData) {
  setRole(roleData as AppRole);
} else {
  // Fallback: direct query
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  if (roleRow?.role) setRole(roleRow.role as AppRole);
}
```

### 2. Create Bulk Professional Upload Dialog

**New file:** `src/components/professionals/BulkProfessionalUploadDialog.tsx`

Modeled after `BulkUploadDialog.tsx` (leads), adapted for professionals:

- **Template columns:** Name*, Phone*, Alternate Phone, Email, Firm Name, Professional Type*, Service Category, City, Status, Priority, Assigned To, Address, Notes
- **Options sheet:** Dynamically pulled from control panel via `useControlPanelSettings().getFieldOptions()`
- **Validation:** Phone format (10 digits, starts with 6-9), duplicate check against `professionals` table, required fields (Name, Phone, Professional Type)
- **Import:** Insert into `professionals` table with progress tracking

### 3. Update Lead Bulk Upload Template to Use Control Panel Options

**File:** `src/components/leads/BulkUploadDialog.tsx`

Currently at lines 56-63, it imports hardcoded constants:

```typescript
import { CONSTRUCTION_STAGES, MATERIAL_INTERESTS, LEAD_SOURCES, ... } from "@/constants/leadConstants";
```

And uses them directly in the template options sheet (lines 300-320).

**Fix:** Import `useControlPanelSettings` and use `getFieldOptions()` to build the options sheet dynamically:

```typescript
const { getFieldOptions } = useControlPanelSettings();

// In downloadTemplate():
const sourceOptions = getFieldOptions("leads", "source").map(o => o.label);
const stageOptions = getFieldOptions("leads", "construction_stage").map(o => o.label);
const materialOptions = getFieldOptions("materials", "materials").map(o => o.label);
```

### 4. Wire Up Control Panel Default Values in Forms

**Files to check/update:**

- `AddProfessionalDialog.tsx` - Initial `formData.professional_type` is hardcoded to `"contractor"`. Should find the default from control panel.
- `SmartLeadForm.tsx` / form sections - Check if defaults are used.

Add a helper to find default values:

```typescript
const getDefaultValue = (moduleName: string, fieldName: string): string => {
  const options = getFieldOptions(moduleName, fieldName);
  const defaultOpt = options.find(o => o.isDefault);
  return defaultOpt?.value || options[0]?.value || "";
};
```

### 5. Professional Name as Clickable Profile Link

**New file:** `src/components/professionals/ProfessionalDetailView.tsx`

Create a detail view dialog similar to `LeadDetailView.tsx` with tabs:

- Profile tab (view/edit professional info)
- Activity tab
- Notes tab
- Attachments tab

**File:** `src/components/professionals/EnhancedProfessionalTable.tsx`

Update the `renderCell` for `"name"` column to make it clickable:

```typescript
case "name":
  const displayName = professional.name || professional.firm_name || professional.phone;
  return (
    <div 
      className="cursor-pointer hover:text-primary"
      onClick={() => handleSelectProfessional(professional)}
    >
      <div className="font-medium">{displayName}</div>
      {professional.name && professional.firm_name && (
        <div className="text-xs text-muted-foreground">{professional.firm_name}</div>
      )}
    </div>
  );
```

**File:** `src/pages/Professionals.tsx`

Add state for selected professional and the detail view dialog. Support URL deep-linking via `?selected={id}&tab={tab}` query params (matching the lead/customer pattern).

### 6. Add Bulk Upload Button to Professionals Page

**File:** `src/pages/Professionals.tsx` or `EnhancedProfessionalTable.tsx`

Add an "Upload" button next to "Add Professional" that opens the bulk upload dialog.

---

## Files to Create


| File                                                            | Purpose                             |
| --------------------------------------------------------------- | ----------------------------------- |
| `src/components/professionals/BulkProfessionalUploadDialog.tsx` | Excel bulk upload for professionals |
| `src/components/professionals/ProfessionalDetailView.tsx`       | Profile detail view with tabs       |


## Files to Modify


| File                                                         | Changes                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `src/contexts/AuthContext.tsx`                               | Add fallback direct query for role detection                          |
| `src/components/leads/BulkUploadDialog.tsx`                  | Use control panel options for template instead of hardcoded constants |
| `src/components/professionals/EnhancedProfessionalTable.tsx` | Make name clickable, add bulk upload button, add detail view state    |
| `src/components/professionals/AddProfessionalDialog.tsx`     | Use control panel defaults for initial form values                    |
| `src/pages/Professionals.tsx`                                | Add detail view, bulk upload dialog, URL deep-linking                 |


## Implementation Order

1. Fix AuthContext role detection fallback
2. Create ProfessionalDetailView with profile tab and clickable name
3. Create BulkProfessionalUploadDialog with dynamic control panel options
4. Update Lead BulkUploadDialog to use control panel options
5. Wire up control panel default values in forms
6. Add URL deep-linking for professionals