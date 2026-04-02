# Supabase Database Access & Migration Guide

## Current Setup

- Project ID: ehuxwzbdnpyelmtckoac
- Owner: Lovable (project was scaffolded via Lovable's account)
- Credentials are currently managed by Lovable

## Step 1 — Transfer Project Ownership to Your Own Account

1. Go to https://supabase.com/dashboard and log in with the Lovable-linked account
2. Open the project → Settings → General
3. Under "Transfer Project" enter your own Supabase account email
4. Accept the transfer invitation from your inbox
5. After transfer, you own all credentials and billing

## Step 2 — Get Connection Credentials (after transfer)

- Dashboard → Settings → Database → Connection string (URI format)
- Dashboard → Settings → API → service_role key (for migrations and scripts)
- Dashboard → Settings → API → anon key (already in Vercel env vars)

## Step 3 — Export the Database (full backup)

Option A — Supabase CLI (recommended):

```
npm install -g supabase
supabase login
supabase db dump --project-ref ehuxwzbdnpyelmtckoac -f maharaja_full_backup.sql
```

Option B — pg_dump via direct connection:

```
pg_dump "postgresql://postgres:[YOUR_DB_PASSWORD]@db.ehuxwzbdnpyelmtckoac.supabase.co:5432/postgres" \
  --no-owner --no-privileges -F c -f maharaja_backup.dump
```

Option C — Dashboard (Pro plan only):

Database → Backups → Download latest daily backup

## Step 4 — Restore to a New Supabase Project

```
# Via Supabase CLI:
supabase db push --project-ref [NEW_PROJECT_REF]

# Via psql:
psql [NEW_CONNECTION_STRING] < maharaja_full_backup.sql
```

## Step 5 — Update Vercel After Migration

In Vercel dashboard → Project → Settings → Environment Variables, update:

```
VITE_SUPABASE_URL = https://[NEW_PROJECT_REF].supabase.co
VITE_SUPABASE_ANON_KEY = [new anon key from new project]
```

Then redeploy.

## What Lovable Can Do Without Direct Access

- Add SQL files to supabase/migrations/ → auto-run on next deploy
- For data fixes or diagnostics: provide SQL and Lovable runs it as a migration
