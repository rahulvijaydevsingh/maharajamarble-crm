# Maharaja Marble CRM

Internal CRM for Maharaja Marble & Granites — manages the sales lifecycle from lead to quotation to customer, along with the operational tooling that keeps it running.

## Features

- **Leads & pipeline** — capture, qualify, and track leads through status, priority, and source, with site details, material interests, and construction stage.
- **Professionals & Architects** — a linked network of architects and contractors tied to the leads and projects they're involved in.
- **Customers** — converted leads carry their history forward as customers.
- **Quotations** — line-item quotations with GST and freight handling, editable terms & conditions, file attachments, and PDF export.
- **Tasks** — assignable tasks with reminders, completion notes, reschedule tracking, and a contextual brief showing the linked lead or professional.
- **Activity logging** — an audit trail across leads, tasks, and staff actions.
- **Backup & disaster recovery** — automated nightly backups with GFS-style retention, integrity verification, and admin controls to pin or delete backups.
- **Configurable options** — dropdown fields (status, designation, construction stage, and similar) are managed from an in-app Control Panel rather than hardcoded.

## Tech stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query) for data fetching, [React Router](https://reactrouter.com/) for routing
- [Supabase](https://supabase.com/) — Postgres database, authentication, file storage, and edge functions

## Getting started

Requires Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating) if you don't have them.

```sh
# Clone the repository
git clone https://github.com/rahulvijaydevsingh/maharajamarble-crm.git

# Navigate into the project directory
cd maharajamarble-crm

# Install dependencies
npm i

# Start the development server
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in a `.env` file to point the app at a specific Supabase project — development should generally use the mirror/preview project, not production.

## Editing the code

- **Locally** — clone the repo, make changes in your editor of choice, commit and push.
- **Directly on GitHub** — open the file, click the pencil (edit) icon, make your changes, and commit.
- **GitHub Codespaces** — from the repo's Code button, open a Codespace and edit in the browser.

## Deployment

This project is deployed on [Vercel](https://vercel.com/), connected directly to this GitHub repository. Pushes to `main` deploy to production; pull requests get their own preview deployment automatically.
