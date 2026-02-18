

# Plan: Professional Profile Enhancements, Quick-Add Menu, Dashboard Fixes, and Mobile Responsiveness

## Issues Found

| # | Issue | Current State |
|---|-------|--------------|
| 1 | Professional Tasks tab has no Add Task button or filters | Simple list, no controls (unlike LeadTasksTab which has both) |
| 2 | Professional profile has no Quotations tab | Missing entirely |
| 3 | Professional Reminders tab has no Add Reminder button | Simple list only (unlike LeadRemindersTab which has full CRUD) |
| 4 | Excel template missing extra phone/address columns | Only 1 phone + 1 alt phone + 1 address |
| 5 | Email shown below phone in table instead of separate column | `renderCell` for "phone" appends email below it |
| 6 | Firm name shown below name when name exists | `renderCell` for "name" shows firm below name |
| 7 | No quick-add dropdown in header | Header only has search, notifications, and profile |
| 8 | Dashboard TaskList widget uses hardcoded dummy data | `TaskList.tsx` has static mock tasks, not connected to database |
| 9 | Mobile browser accessibility | No viewport meta optimizations, layout not responsive on small screens |

---

## Implementation Details

### 1. Replace Professional Tasks Tab with Full-Featured Version

Rewrite `ProfessionalTasksTab` inside `ProfessionalDetailView.tsx` to match `LeadTasksTab` functionality:
- Add Task button with prefilled `related_entity_type: 'professional'` and `related_entity_id`
- Filter dropdown (All / Open / Completed / Overdue)
- Full table with columns: checkbox, title, type, description, due date, time, priority, status, assigned to, created, updated, actions
- Edit and Delete actions
- Task completion dialog integration
- Click-to-open task detail modal

### 2. Add Quotations Tab to Professional Profile

- Add a `quotations` tab trigger (with FileText icon) to the TabsList
- Create `ProfessionalQuotationsTab` component inside `ProfessionalDetailView.tsx`, modeled after `LeadQuotationsTab`
- Filter quotations by `client_id === professional.id`
- Include "Add Quotation" button with prefilled professional data

### 3. Replace Professional Reminders Tab with Full-Featured Version

Rewrite `ProfessionalRemindersTab` to match `LeadRemindersTab` functionality:
- Add Reminder button opening `AddReminderDialog`
- Task-based reminders section
- Dismiss, Snooze (1h, 3h, tomorrow, next week), Delete actions
- Time labels and color-coded badges
- Activity logging for reminder actions

### 4. Update Excel Template with Extra Columns

**File:** `src/components/professionals/BulkProfessionalUploadDialog.tsx`

Update template columns to:
```
Name*, Mobile 1*, Mobile 2, Mobile 3, Landline, Email, Firm Name,
Professional Type*, Service Category, City, Status, Priority,
Assigned To, Address, Additional Address, Notes
```

- 3 mobile phone columns (Mobile 1 required, Mobile 2/3 optional)
- 1 landline column (can contain comma-separated numbers)
- 2 address columns (Address + Additional Address)
- Update parsing logic to concatenate phones and addresses appropriately
- Mobile 1 maps to `phone`, Mobile 2 maps to `alternate_phone`, Mobile 3 and Landline stored in notes or a new field

### 5. Fix Email Display in Professional Table

**File:** `src/components/professionals/EnhancedProfessionalTable.tsx`

- Remove email from the "phone" column `renderCell`
- Add a new "email" column key to show email separately
- Update the default column configuration to include the email column

### 6. Remove Firm Name from Name Column

**File:** `src/components/professionals/EnhancedProfessionalTable.tsx`

In the `renderCell` for "name", remove the conditional that shows `professional.firm_name` below the name. The firm name already has its own "firmName" column.

### 7. Add Quick-Add Dropdown to Header

**File:** `src/components/shared/Header.tsx`

Add a "+" button dropdown between the notification bell and the user avatar with options:
- Add Lead (opens `AddLeadDialog` or navigates to `/leads` with auto-open)
- Add Customer (opens `AddCustomerDialog`)
- Add Professional (opens `AddProfessionalDialog`)
- Add Quotation (opens `AddQuotationDialog`)
- Add Task (opens `AddTaskDialog`)
- Add To-Do List (opens `AddTodoListDialog`)

Each option will use a state-based dialog approach. The Header will manage dialog open states and render the dialog components. On successful creation, it will show a toast and invalidate relevant queries.

### 8. Fix Dashboard TaskList Widget

**File:** `src/components/tasks/TaskList.tsx`

Replace the hardcoded mock data with real database data:
- Import and use `useTasks()` hook
- Filter to show pending/in-progress tasks sorted by due date
- Show loading state
- Limit display to 5 most urgent tasks
- Make task titles clickable (open task detail modal)
- Show "View All" link to navigate to `/tasks`

### 9. Mobile Browser Accessibility

**Files to modify:**
- `index.html` - Ensure proper viewport meta tag exists
- `src/index.css` - Add responsive utility classes
- `src/components/layout/DashboardLayout.tsx` - Reduce padding on mobile
- `src/components/shared/Header.tsx` - Make header compact on mobile, hide search on small screens
- `src/components/shared/Sidebar.tsx` - Ensure sidebar collapses properly on mobile
- Various dialog components - Ensure dialogs are full-screen on mobile

Key responsive changes:
- Header: Hide search bar on screens < 640px, compact padding
- Sidebar: Already uses SidebarProvider which handles mobile collapse
- Dashboard: Stack cards vertically on mobile, reduce gap
- Tables: Already use `ScrollableTableContainer` for horizontal scroll
- Dialogs: Add `max-h-[100dvh]` and proper overflow on mobile
- Add touch-friendly tap targets (min 44px)

---

## Files to Create

None (all changes are modifications to existing files)

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/professionals/ProfessionalDetailView.tsx` | Rewrite Tasks tab with Add/Filter/Edit/Delete; rewrite Reminders tab with Add/Dismiss/Snooze/Delete; add Quotations tab |
| `src/components/professionals/EnhancedProfessionalTable.tsx` | Add email column; remove firm name from name column; remove email from phone column |
| `src/components/professionals/BulkProfessionalUploadDialog.tsx` | Add Mobile 2, Mobile 3, Landline, Additional Address columns to template |
| `src/components/shared/Header.tsx` | Add quick-add dropdown with 6 creation options (Lead, Customer, Professional, Quotation, Task, To-Do) |
| `src/components/tasks/TaskList.tsx` | Replace hardcoded data with real database tasks via `useTasks()` hook |
| `src/components/layout/DashboardLayout.tsx` | Add responsive padding (`p-4 md:p-6`) |
| `src/index.css` | Add mobile-specific utility styles |
| `index.html` | Verify/add proper viewport meta tag |

## Implementation Order

1. Fix Professional Detail View tabs (Tasks, Reminders, Quotations)
2. Fix Professional table columns (email separation, firm name removal)
3. Update Excel template columns
4. Add Quick-Add dropdown to Header
5. Fix Dashboard TaskList widget with real data
6. Mobile responsiveness improvements

