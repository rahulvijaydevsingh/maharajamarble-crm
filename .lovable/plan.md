
Problem recap (based on your screenshot + request)
- On Leads table, you want to reach the right-side “Actions” column without having to scroll to the bottom to use the browser’s horizontal scrollbar.
- We already attempted a “sticky top horizontal scrollbar” inside `ScrollableTableContainer`, but it’s still not solving the problem reliably “once and for all”.

Root cause (in current implementation)
- The top scrollbar is currently rendered *inside* the same scrolling container (`overflow-auto`) and relies on `position: sticky`.
- On some layouts / heights / devices, it’s still easy to miss or it doesn’t feel like a “primary” scrollbar because it’s within the scrollable region and can visually blend with header content.
- Additionally, even with a top scrollbar, users still need horizontal scrolling just to access “Actions”, which is a frequent operation.

Proposed final solution (robust + ergonomic)
We’ll implement two complementary improvements:

1) Make the top horizontal scrollbar always accessible (true “top scrollbar”, not dependent on table scroll position)
- Change `ScrollableTableContainer` so the “pill” scrollbar sits in a dedicated top area *outside* the scrollable region.
- This makes it always visible and usable, no matter how far down the user has scrolled in the table vertically.
- Keep the synchronized scrolling behavior:
  - Moving the top pill scrolls the table horizontally
  - Scrolling the table horizontally updates the pill position

(2) Make the Leads “Actions” column sticky to the right (so you often don’t need horizontal scroll at all)
- In `LeadsTableContainer.tsx`, add sticky positioning to:
  - The header cell for the `actions` column
  - The body cells for the `actions` column
- This keeps “Actions” visible at all times, even when the table is scrolled horizontally.
- Add a subtle left shadow + solid background so it looks intentional and readable.

This combination is “once and for all” because:
- If you need to reach far-right data columns, you can use the always-available top scrollbar.
- If you only need to use Actions (the most common case), you won’t need horizontal scrolling at all.)----DONT need the actions column to be sticky as we might have to move it to the middle or front some times. we want the freedom of movement for this

Implementation steps (exact files + what changes)

A) Update the shared container so the top scrollbar is always available
File: `src/components/shared/ScrollableTableContainer.tsx`

Changes:
1. Restructure markup from:
   - One `overflow-auto` wrapper containing both scrollbar + table
   to:
   - A fixed “top scrollbar bar” section (outside scroll region)
   - A separate `overflow-auto` table content section

2. Update refs & syncing logic:
- Keep:
  - `topScrollRef` (pill)
  - `tableContainerRef` (scrollable table viewport)
- `handleTopScroll` sets `tableContainerRef.current.scrollLeft`
- `handleTableScroll` sets `topScrollRef.current.scrollLeft`

3. `showScrollbar` logic remains based on `scrollWidth > clientWidth`.
4. Remove the current `hidden lg:block` restriction so it appears wherever overflow exists (desktop + smaller screens).
   - If you prefer hiding only on very small phones, we can change to `hidden sm:block`, but default should be “always show when needed”.

Expected outcome:
- The “pill” scrollbar becomes a permanent control at the top of the table frame.

B) Sticky right Actions column for Leads table
File: `src/components/leads/LeadsTableContainer.tsx`

Changes:
1. When rendering headers:
- If `column.key === "actions"`:
  - Add classes like:
    - `sticky right-0 z-30 bg-background`
    - `shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.35)]` (or a Tailwind-friendly equivalent)
  - Also ensure the header’s sticky background matches the table background.

2. When rendering body cells:
- For the `actions` column cell, apply:
  - `sticky right-0 z-20 bg-background`
  - Matching shadow to separate it from scrolled content

3. Ensure width:
- Give actions column a consistent width (e.g. `w-[64px]` / `min-w-[64px]`) so it doesn’t collapse and remains easy to tap.

Expected outcome:
- “Actions” is always visible at the far right, reducing horizontal scroll needs dramatically.

C) Verify the previous “professional auto-create” implementation (no errors)
We will validate in three ways:

1) Runtime verification (browser console + network)
- Open preview, reproduce lead creation with:
  - One professional contact (and one customer contact)
  - Two professional contacts (two new professionals expected)
  - A professional contact with a phone that already exists in Professionals (lead should still create; professional insert should be skipped)
- Confirm:
  - No console errors
  - Requests succeed (lead insert, optional professional inserts)

2) Code-level review for obvious risks
- Confirm:
  - `useEntityPhoneDuplicateCheck` is imported/used correctly
  - `ContactDetailsSection` correctly splits Individual vs Professional options
  - `SmartLeadForm` “blocking duplicates” logic blocks only leads/customers and not professionals
  - `Leads.tsx` professional creation loop normalizes phone and avoids duplicates within same submission

3) Edge cases
- When designation lists change in control panel, dropdown options should update immediately (already using `getFieldOptions`).
- If professional types list is empty, lead form should still function (fallback behavior stays intact because individual list remains).

Test checklist (what you should verify after I implement)
1) Leads table:
- Without scrolling down, you can use the top pill scrollbar to move the table left/right.
- “Actions” stays visible on the right while scrolling horizontally.
2) Leads create → Professionals auto-create:
- Create lead with 2 professional contacts → 2 new Professionals appear.
- Create lead with existing professional phone → lead created; professional not duplicated.
3) Mobile/tablet:
- Top scrollbar appears only when horizontal overflow exists.
- Sticky actions does not overlap content (we’ll tune z-index/background if needed).

Notes / small design decision
- If you want the “Actions” column sticky in Customers/Tasks/Professionals too, we can generalize this pattern across tables after confirming Leads feels perfect. For now, we’ll fix Leads first as requested.

Scope of work summary
- Modify `ScrollableTableContainer` to make the top scrollbar always accessible.
- Make Leads “Actions” sticky-right.
- Verify the previous lead→professional auto-create feature via UI flows and logs, and patch any errors we find during validation.
