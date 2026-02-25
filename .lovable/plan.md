

# Fix Login Logging + REST API + Lead Capture Webhook

## Part 1: Fix Login Logging (Root Cause)

### Root Cause Identified

The login logging code in `Auth.tsx` (lines 79-94) inserts directly into `staff_activity_log` right after `signIn()`. The insert uses `(supabase.from("staff_activity_log" as any).insert as any)({...})` but **never checks the return `{ error }`**. If the insert fails (due to RLS timing or the SDK not having propagated the auth header yet), the error is silently discarded because:

- Supabase client does NOT throw on RLS/insert failures -- it returns `{ error }` in the response
- The `try/catch` block only catches thrown exceptions, not returned error objects
- The screenshot confirms: 4 logout entries, 0 login entries -- insert is failing silently

Meanwhile, logout works because the user has been fully authenticated for the entire session when `logStaffAction` runs.

### Fix: Move Login Logging to AuthContext

Move login logging into `onAuthStateChange` in `AuthContext.tsx` where the SDK has confirmed the session is valid. Use a ref flag to distinguish actual sign-ins from page-load session restores:

**File: `src/contexts/AuthContext.tsx`**
- Add a `loginPendingRef = useRef(false)`
- In `signIn()`, set `loginPendingRef.current = true` before calling `signInWithPassword`
- In `onAuthStateChange`, when `event === 'SIGNED_IN'` and `loginPendingRef.current === true`:
  - Clear the flag
  - Insert login activity via `setTimeout` (500ms delay for full propagation)
  - Check the `{ error }` return and log it if insertion fails

**File: `src/pages/Auth.tsx`**
- Remove the login logging code block (lines 77-94)

This approach is reliable because:
- The SDK is telling us the session is valid (via the event)
- The ref flag prevents logging session restores on page refresh
- The setTimeout ensures the client's auth headers are fully propagated

---

## Part 2: Lead Capture Webhook

### New Edge Function: `supabase/functions/webhook-lead-capture/index.ts`

A public endpoint that accepts POST requests from website contact forms and inserts leads directly.

**Security:**
- Validates a `webhook_secret` in the request body against a stored secret
- Sanitizes all input (strips HTML, limits string lengths)
- Only allows specific CORS origins (configurable)
- No JWT required (public endpoint)

**Flow:**
1. Receive POST with `name`, `phone`, optional `email`, `message`, `service`, `location`
2. Validate `webhook_secret` against `WEBHOOK_LEAD_SECRET` env variable
3. Validate required fields (name, phone)
4. Sanitize inputs
5. Insert into `leads` table using service role client with:
   - `source = 'website'`
   - `status = 'new'`
   - `assigned_to` based on round-robin from active staff
   - `notes` = message content
6. Log activity in `activity_log`
7. Return `{ success: true, lead_id }`

**Config:** Add `verify_jwt = false` for this function in `supabase/config.toml`

**Secret needed:** `WEBHOOK_LEAD_SECRET` -- user will need to set this

---

## Part 3: REST API System

### 3.1 Database: `api_keys` Table

```text
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Key',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

RLS Policies:
- SELECT: auth.uid() = user_id OR is_admin()
- INSERT: auth.uid() = user_id
- UPDATE: auth.uid() = user_id OR is_admin()
- DELETE: auth.uid() = user_id OR is_admin()
```

### 3.2 Edge Function: `supabase/functions/api/index.ts`

A single edge function that handles all API routes. It will:

1. **Auth:** Extract Bearer token, SHA-256 hash it, look up in `api_keys`, verify active
2. **Rate limiting:** Track requests per key per hour using an in-memory counter (persisted via `api_rate_limits` table)
3. **Routing:** Parse URL path and method to dispatch to handlers
4. **Response envelope:** `{ success, data, meta }` or `{ success: false, error, code }`

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/leads | List leads (paginated, filterable) |
| GET | /v1/leads/:id | Get single lead |
| POST | /v1/leads | Create lead |
| PUT | /v1/leads/:id | Update lead |
| DELETE | /v1/leads/:id | Delete lead |
| PATCH | /v1/leads/:id/status | Update lead status |
| GET | /v1/tasks | List tasks |
| POST | /v1/tasks | Create task |
| PUT | /v1/tasks/:id | Update task |
| DELETE | /v1/tasks/:id | Delete task |
| PATCH | /v1/tasks/:id/complete | Complete task |
| GET | /v1/reminders | List reminders |
| POST | /v1/reminders | Create reminder |
| PUT | /v1/reminders/:id | Update reminder |
| DELETE | /v1/reminders/:id | Delete reminder |
| GET | /v1/quotations | List quotations |
| GET | /v1/quotations/:id | Get quotation |
| POST | /v1/quotations | Create quotation |
| GET | /v1/activity | List activity log |
| POST | /v1/activity | Create activity entry |
| GET | /v1/staff | List active staff |
| GET | /v1/search | Search across entities |
| GET | /v1/stats | Dashboard summary |

**Rate limiting headers on every response:**
- `X-RateLimit-Limit: 200`
- `X-RateLimit-Remaining: N`
- `X-RateLimit-Reset: timestamp`

### 3.3 Database: `api_rate_limits` Table

```text
CREATE TABLE api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 0,
  UNIQUE(key_id, window_start)
);
```

### 3.4 Settings Page: "API Access" Tab

**File: `src/pages/Settings.tsx`**
- Add new tab trigger: "API Access"

**New component: `src/components/settings/ApiAccessPanel.tsx`**
- Shows existing API keys (prefix, name, created date, last used)
- "Generate New Key" button:
  - Generates `mmcrm_` + 32 random alphanumeric chars
  - SHA-256 hashes it and stores hash in `api_keys`
  - Shows full key ONCE with copy button and warning
- "Revoke" button per key (sets `is_active = false`)
- Copy base URL button
- Link to /api-docs
- Security warning about keeping keys secret

**New hook: `src/hooks/useApiKeys.ts`**
- CRUD operations for `api_keys` table
- Key generation logic (client-side SHA-256 via Web Crypto API)

### 3.5 API Documentation Page

**New page: `src/pages/ApiDocs.tsx`**
- Route: `/api-docs` (admin-only)
- Beautiful interactive documentation showing:
  - Authentication section (how to use Bearer token)
  - Each endpoint with method, URL, parameters table, example curl, example response
  - User's actual API base URL
  - "Quick Start" section for pasting into AI tools
  - Natural language to API mapping examples

---

## Part 4: Implementation Sequence

### Phase 1 -- Login Fix (immediate)
1. Fix `AuthContext.tsx` with ref-based login logging
2. Remove duplicate login code from `Auth.tsx`

### Phase 2 -- Database Setup
3. Create migration for `api_keys` and `api_rate_limits` tables with RLS

### Phase 3 -- Lead Capture Webhook
4. Create `webhook-lead-capture` edge function
5. Request `WEBHOOK_LEAD_SECRET` from user

### Phase 4 -- REST API Core
6. Create `api` edge function with auth, rate limiting, and routing
7. Implement all endpoint handlers

### Phase 5 -- Settings UI
8. Create `ApiAccessPanel` component
9. Create `useApiKeys` hook
10. Add "API Access" tab to Settings page

### Phase 6 -- Documentation
11. Create `ApiDocs` page
12. Add route to `App.tsx`

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/contexts/AuthContext.tsx` | Modify | Add login logging via onAuthStateChange with ref flag |
| `src/pages/Auth.tsx` | Modify | Remove redundant login logging code |
| `supabase/functions/webhook-lead-capture/index.ts` | Create | Public lead capture endpoint |
| `supabase/functions/api/index.ts` | Create | Main REST API router with 20+ endpoints |
| `supabase/config.toml` | Modify | Add function configs with verify_jwt = false |
| `src/components/settings/ApiAccessPanel.tsx` | Create | API key management UI |
| `src/hooks/useApiKeys.ts` | Create | API key CRUD hook |
| `src/pages/Settings.tsx` | Modify | Add "API Access" tab |
| `src/pages/ApiDocs.tsx` | Create | Interactive API documentation |
| `src/App.tsx` | Modify | Add /api-docs route |
| Migration SQL | Create | api_keys, api_rate_limits tables with RLS |

