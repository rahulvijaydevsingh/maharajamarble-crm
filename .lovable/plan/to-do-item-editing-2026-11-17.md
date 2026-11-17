# To-do item editing

## What will change
- Add an **Edit item** option to each to-do item’s action menu wherever items are shown: list cards, expanded list rows, and the full-list side panel.
- Open a focused edit dialog that lets staff update the item title, notes, and due date while preserving completion, star, assignment, conversion, and audit data.
- Save through the existing item update flow so the revised item appears immediately in every open list view.
- Keep converted items protected from changes that could conflict with their linked task.

## Validation
- Add focused coverage for the edit payload and save behavior.
- Run the relevant to-do tests and TypeScript check, then verify the edit flow in the preview.

## Technical details
- Reuse `useTodoItems.updateItem`; no table, permission, or workflow changes are required.
- Create a small shared edit dialog and pass an edit action through the existing row component.
