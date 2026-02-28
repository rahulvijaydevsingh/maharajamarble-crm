

## Plan: Add Consistent Date Range Filters Across All Tables

### Problem
The Leads table has inline date range filter pickers (From/To calendar popovers) on date columns, but:
- **Customers table**: Has date range state and filtering logic but no UI (no calendar pickers on `createdAt` column header)
- **Professionals table**: Has no date filtering at all -- no state, no logic, no UI on the `createdAt` column

### Reference Pattern (Leads Page)
The leads page uses a `DateRangeFilter` component: a small calendar icon button that opens a popover with two nested calendar popovers (From / To) and a Clear button. This is the pattern to replicate.

### Changes

#### 1. Customers Table (`src/components/customers/EnhancedCustomerTable.tsx`)
- Add a `DateRangeFilter` inline component (matching the leads page pattern with From/To calendar popovers and Clear button)
- Update the `createdAt` case in `renderTableHeader` to include the `DateRangeFilter` alongside the existing `SortableHeader`
- The date range state (`createdDateRange`) and filtering logic already exist -- only the UI trigger is missing

#### 2. Professionals Table (`src/components/professionals/EnhancedProfessionalTable.tsx`)
- Add date range state: `createdDateRange` with `{ from: undefined, to: undefined }`
- Add a `DateRangeFilter` inline component (same pattern as leads/customers)
- Add date filtering logic to `filteredProfessionals` memo
- Update the column header rendering for `createdAt` to include a `SortableHeader` (for sorting by `created_at`) plus the `DateRangeFilter`
- Include `createdDateRange` in the active filters check and clear-all logic
- Add `SortableHeader` rendering for `createdAt` column (currently just renders plain label)

#### 3. Tasks Table (`src/components/tasks/EnhancedTaskTable.tsx`)
- Already has date range filters on both `dueDate` and `createdAt` columns with a working `DateRangeFilter` component
- **No changes needed** -- already consistent in functionality (uses a slightly different prop API but same UX)

### Design Consistency
All date range filters will follow the same visual pattern:
- Small calendar icon button inline with the column header
- Popover with "From" and "To" sub-popovers containing `Calendar` components
- Active filter indicator (badge showing "1" when a date is set)
- Clear button to reset

### Technical Details

**Customers (`EnhancedCustomerTable.tsx`)**:
- Add `DateRangeFilter` component definition (~30 lines, matching leads pattern)
- Modify `renderTableHeader` `createdAt` case: wrap `SortableHeader` + `DateRangeFilter` in a flex container
- Add necessary imports: `Calendar`, `Popover/PopoverContent/PopoverTrigger`, `CalendarIcon`

**Professionals (`EnhancedProfessionalTable.tsx`)**:
- Add `createdDateRange` state
- Add `DateRangeFilter` component definition
- Update `filteredProfessionals` memo to include date range check
- Update column header rendering for `createdAt` to use `SortableHeader` + `DateRangeFilter`
- Add `createdDateRange` to dependency array of the filtered memo
- Add necessary imports: `Calendar`, `Popover/PopoverContent/PopoverTrigger`, `Calendar as CalendarIcon`, `X`

