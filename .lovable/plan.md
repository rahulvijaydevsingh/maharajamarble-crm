
Goal
- Convert the current task detail experience from a full page into a floating “profile-style” window (modal) similar to Lead/Customer profile windows.
- Ensure the task window always shows the related record’s name + phone (customer/lead/professional):
  - Name opens the related profile window
  - Phone dials (via existing PhoneLink)
- Update all task entry points (Tasks table, Kanban cards, Lead/Customer task tabs, Calendar) to open this floating window instead of navigating away.
- Add a “Share” action inside the task window that copies a shareable link to the task (e.g. /tasks/:id), for pasting into internal messages.

What’s happening now (confirmed from code)
- Task detail currently exists as a routed page at /tasks/:id (TaskDetailPage).
- That page only joins lead data (tasks.select(`*, lead:leads(...)`)), so if a task is related to a customer/professional via related_entity_type/related_entity_id, those details are not fetched and therefore not shown.
- Lead/Customer “profile” experiences are implemented as Radix Dialog windows (LeadDetailView, CustomerDetailView) with custom headers and tabs.
- Many entry points currently do navigate(`/tasks/${task.id}`).

Design approach
A) Introduce a Task Detail Modal component (profile-style window)
- Create a new component (e.g. TaskDetailView.tsx) that mirrors the “modal shell” used by LeadDetailView/CustomerDetailView:
  - <Dialog open=… onOpenChange=…>
  - <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 [&>button]:hidden">
  - Custom header with:
    - Task title, status badges, priority, type
    - Related entity row: name (clickable) + phone (PhoneLink)
    - Actions: Complete, Snooze, Edit, Delete (existing permissions respected) + Share button + Close X
  - Body:
    - Reuse the existing Task detail sections you already have (Task Details, Completion Details, Attachments, Activity Timeline)

B) Make Task Detail openable from anywhere via a small global controller
- Add a lightweight “TaskDetailModalProvider” (React context) mounted once at app level (near App root or inside DashboardLayout):
  - API:
    - openTask(taskId: string, opts?: { initialTab?: string })
    - closeTask()
    - state: open, taskId
  - Provider renders TaskDetailView when open.
- This prevents duplicating modal state in every list/tab and ensures all entry points open the same window.

C) Keep /tasks/:id route for share links
- Since you want shareable links, we will keep /tasks/:id working.
- When someone opens a shared link directly, we’ll show the same modal-based UI.
  Two implementation options (we will implement the simplest, most reliable):
  1) “Route opens modal page”: Keep TaskDetailPage but convert its layout to a modal-like shell (DialogContent style) and include a Share button. This satisfies “floating window look”, but it’s still a route page.
  2) “True modal on top of background”: Use react-router “background location” pattern so opening a task sets location state and displays modal above the current page.
  
  Recommended for your requirement (“floating window from everywhere”):
  - Use the global provider for normal navigation clicks (no route change).
  - Keep /tasks/:id route to open the same TaskDetailView as a “standalone modal page” (it will look identical). Additionally, include a “Back”/Close behavior that goes to /tasks (or history back if available).
  
  This gives:
  - Everyday use: modal overlay without losing context
  - Share links: openable anywhere

D) Fix missing “Related customer details” in task detail
- Update task loading logic to fetch related entity details:
  - If task.lead exists → show lead name/phone
  - Else if related_entity_type === "customer" → fetch customers(id, name, phone, site_plus_code) by related_entity_id
  - Else if related_entity_type === "professional" → fetch professionals(id, name, phone, site_plus_code) by related_entity_id
- Display:
  - “Related to” section in header (preferred) and also in “Task Details” card (optional redundancy)
  - Name uses a clickable button:
    - lead → open LeadDetailView modal
    - customer → open CustomerDetailView modal
    - professional → navigate to Professionals page (or add a modal later; currently professionals use a route param in the table)
  - Phone uses PhoneLink (already dials and optionally logs activity)

E) Add Share button
- Add a “Share” button in the TaskDetailView header:
  - Copies `${window.location.origin}/tasks/${task.id}` to clipboard
  - Shows toast “Link copied”
- Optional: If clipboard API fails, show a small dialog with the link selectable.

Files likely to change (high-level)
1) New UI + provider
- src/components/tasks/TaskDetailView.tsx (new): Dialog-based task detail window shell using existing content sections
- src/contexts/TaskDetailModalContext.tsx (new) or src/contexts/TaskDetailContext.tsx (new): provider + hook (useTaskDetailModal)

2) Reuse/refactor existing task page
- src/pages/TaskDetailPage.tsx:
  - Convert it to render TaskDetailView in “standalone” mode OR reuse shared “TaskDetailContent” component.
  - Ensure it loads related entity details (customer/professional) as described.
  - Add Share button (if not already provided by shared component).

3) Update all entry points to open modal instead of navigate
- src/components/tasks/EnhancedTaskTable.tsx
  - Replace navigate(`/tasks/${task.id}`) on title click with openTask(task.id)
- src/components/tasks/TaskKanbanView.tsx
  - Replace navigate(`/tasks/${task.id}`) on card click with openTask(task.id)
- src/components/leads/detail-tabs/LeadTasksTab.tsx
  - Replace navigation with openTask(task.id)
- src/components/customers/detail-tabs/CustomerTasksTab.tsx
  - Replace navigation with openTask(task.id)
- src/pages/CalendarPage.tsx (or wherever tasks are clicked from calendar task events)
  - Replace navigation with openTask(taskId)

4) Mount provider
- src/App.tsx or src/components/layout/DashboardLayout.tsx
  - Wrap authenticated app layout with TaskDetailModalProvider so it’s available everywhere.

UI details inside Task window (what will be visible after changes)
- Header (top bar)
  - Title: “Collect feedback from rahul”
  - Badges: type, priority, status
  - Related record strip:
    - “Customer: Rahul Sharma” (click opens Customer profile window)
    - Phone link (click to dial)
  - Buttons: Complete, Snooze, Edit, Delete, Share, Close

- Main body (same content you already built)
  - Task Details card (assigned to, due, created, description, etc.)
  - Completion Details card (status/outcome/notes/next action)
  - Attachments (EntityAttachmentsTab entityType="task")
  - Activity timeline (TaskActivityTimeline)

Edge cases and handling
- Task has both lead_id and related_entity_type:
  - Prefer showing lead (because it’s already joined) but also show “Related entity” if different; or show one “Related to” chosen by precedence:
    1) related_entity_type+id if present
    2) else lead
  - We’ll implement explicit precedence so it’s consistent.
- Related entity not found (deleted):
  - Show “Related record not found” (muted) but still render task details.
- Clicking phone/name inside modal should not close modal:
  - Ensure stopPropagation where needed.
- Permissions:
  - Reuse existing usePermissions checks for edit/delete.
- Current route /tasks/:id (you’re on it now)
  - After implementing modal-first, this route will still be supported and will display the same UI.
  - Share links will work regardless of where opened.

Implementation sequence (safe, incremental)
1) Create TaskDetailView modal component that can render task data (initially reuse current TaskDetailPage UI blocks).
2) Add related entity fetching to the task loader (customer/professional minimal fetch).
3) Add Share button + toast.
4) Add TaskDetailModalProvider + useTaskDetailModal hook.
5) Update all entry points to call openTask(task.id) instead of navigate.
6) Adjust /tasks/:id route behavior:
   - Keep route working and show the same UI (either by rendering TaskDetailView in standalone mode or by leaving TaskDetailPage but visually matching modal).
7) Quick regression check list:
   - Open task from Tasks list, Kanban, Lead tasks tab, Customer tasks tab, Calendar
   - Verify related customer/lead/professional name + phone appear and work
   - Verify share copies link and link opens task detail correctly
   - Verify complete/snooze/edit/delete still function and timeline updates

What I need from you (only if you want a specific behavior)
- For “Share to staff in messages internally”: should “Share” only copy the link, or should it also open an in-app “Send in Messages” dialog?
  - In this phase I will implement “Copy link” first (fast and reliable). We can add “Send in Messages” as a follow-up enhancement once you confirm what exact message workflow you want.
