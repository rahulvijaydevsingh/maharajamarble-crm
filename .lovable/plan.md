

## Plan: Login Page Theme + Mobile Responsiveness Audit

### 1. Login Page Redesign

The current login page is a plain white card on a neutral background. It needs to match the CRM's "Maharaja Marble" theme with the dark navy/gold color palette.

**Changes to `src/pages/Auth.tsx`:**
- Use the CRM's dark primary (`marble-primary` / `--sidebar-background`) as the background with a subtle marble pattern
- Add the "Maharaja CRM" brand header (gold accent + white text) above the card, matching the sidebar branding
- Style the sign-in button with the gold accent color (`marble-accent`)
- Add a decorative marble pattern overlay (reusing the existing `marble-pattern` CSS class)
- Ensure the card uses `marble-card` styling for consistency
- Mobile-friendly: already uses `max-w-md` with `p-4`, just needs touch-friendly input sizing

### 2. Mobile Responsiveness Fixes

The CRM already has some mobile patterns (sidebar collapses, header adapts). Key areas to audit and fix:

**A. `src/pages/Leads.tsx` (and similar pages with tab bars)**
- Tab triggers (`TabsList`) often overflow on mobile. Add `overflow-x-auto` and `flex-wrap` or horizontal scroll to tab bars
- Action buttons (Add Lead, Bulk Upload, etc.) should stack or use an overflow menu on small screens

**B. `src/components/layout/DashboardLayout.tsx`**
- Main content uses `p-4 md:p-6` which is good. No changes needed.

**C. `src/pages/Index.tsx` (Dashboard)**
- Grid already uses `md:grid-cols-2 lg:grid-cols-4`. Looks good.

**D. Key dialog components**
- Most dialogs already use `max-w-lg` or similar. On mobile, ensure they use `max-h-[90vh] overflow-y-auto` patterns.

**E. Pages with complex tab bars** (Leads, Tasks, Customers, Settings, Performance)
- Add consistent mobile-friendly tab styling: scrollable horizontal tabs instead of wrapping

### Files to Modify

| File | Change |
|---|---|
| `src/pages/Auth.tsx` | Full visual redesign with marble theme |
| `src/pages/Leads.tsx` | Mobile tab bar + action button layout |
| `src/pages/Tasks.tsx` | Mobile tab bar fix |
| `src/pages/Customers.tsx` | Mobile tab bar fix |
| `src/pages/Settings.tsx` | Mobile tab bar fix |
| `src/pages/PerformanceMatrix.tsx` | Mobile tab bar fix |
| `src/index.css` | Add utility class for scrollable tab bars if needed |

### Login Page Visual Design

```text
+----------------------------------+
|     (dark navy background)       |
|     marble pattern overlay       |
|                                  |
|     ★ Maharaja CRM ★            |
|     (gold + white branding)      |
|                                  |
|   +------------------------+     |
|   |   Welcome Back         |     |
|   |   Sign in to your CRM  |     |
|   |                        |     |
|   |   [Email input]        |     |
|   |   [Password input]     |     |
|   |   [ ] Remember me      |     |
|   |                        |     |
|   |   [=== Sign In ===]    |     |
|   |   (gold accent button) |     |
|   |                        |     |
|   |   Contact admin...     |     |
|   +------------------------+     |
+----------------------------------+
```

