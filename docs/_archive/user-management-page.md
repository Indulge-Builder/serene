# User Management Page — Full Intelligence Document

Last verified: 2026-06-09 (re-audited against `supabase/migrations/20260526000001_profiles.sql`, `20260526000002_agent_routing_config.sql`, `src/lib/services/profiles-service.ts`, `src/lib/actions/profiles.ts`, `src/lib/actions/agent-routing.ts`, `src/lib/validations/profile-schema.ts`, the three `admin/users` routes, and the four admin components — `UsersTable`, `NewUserClient`, `CreateUserForm`, `UserStatusControls`, `EditProfileForm`, `EditAuthorizationForm`).

---

## 1. Module Overview

### What this module owns

The user management module is the **authorization foundation of the entire Eia platform**. Every RLS policy in every table calls `get_user_role()` and/or `get_user_domain()`, which read exclusively from `public.profiles`. User creation, role/domain assignment, deactivation, and agent round-robin eligibility all flow through this module. If `profiles` or its policies are wrong, every module built on top is wrong.

### Three routes and their purposes

| Route | Purpose |
| ----- | ------- |
| `/admin/users` | Team list — browse all profiles, client-side filter/search, link to detail |
| `/admin/users/new` | Create a member — password path or magic-link invite |
| `/admin/users/[id]` | User detail — edit profile fields, authorization (privileged only), status/routing toggles |

**Source files:**

- `src/app/(dashboard)/admin/users/page.tsx`
- `src/app/(dashboard)/admin/users/new/page.tsx`
- `src/app/(dashboard)/admin/users/[id]/page.tsx`

### Access gates per route (asymmetry)

| Route | agent | manager | admin | founder |
| ----- | ----- | ------- | ----- | ------- |
| `/admin/users` (list) | redirect `/dashboard` | redirect `/dashboard` | allowed | allowed |
| `/admin/users/new` | redirect `/dashboard` | redirect `/dashboard` | allowed | allowed |
| `/admin/users/[id]` | redirect `/dashboard` | **view allowed** | full edit | full edit |

**Manager asymmetry on detail:** Managers may open `/admin/users/[id]` to inspect agents in their domain (operational need). They see `EditProfileForm` and can toggle **lead routing** for agent profiles. They do **not** see `EditAuthorizationForm` (absent from DOM when `caller.role` is not admin/founder). They cannot toggle **account active** (`is_active`) — `UserStatusControls` hides the account toggle unless `isPrivileged` (admin/founder only).

**List vs detail:** Only admin/founder reach the list and create routes. Managers reach detail only via direct URL or links (e.g. from Settings agent roster), not via the Team list page.

### Sidebar

- **Section:** `Admin` (rendered only when `profile.role` is `admin` or `founder`)
- **Icon:** `Shield` (lucide-react)
- **Label:** `User Management`
- **Href:** `/admin/users`
- **Source:** `src/components/layout/Sidebar.tsx` — `ADMIN_NAV`

There is no `src/app/(dashboard)/admin/CLAUDE.md` for this module; only `admin/ad-creatives/CLAUDE.md` exists under `admin/`.

---

## 2. The Core Authorization Principle

### Why profiles, not JWT claims

JWT claims can be **stale**. When an admin updates someone's `role` or `domain` in `profiles`, the user's JWT may still carry the old role until the token expires. If RLS trusted JWT metadata, that user could retain wrong permissions for hours.

Eia reads authorization from **`public.profiles` only** via `get_user_role()` and `get_user_domain()`. The moment a row is updated, the next query sees the new values. No token expiry lag. No security gap.

**Rule A-09:** Authorization in actions reads `getCurrentProfile()` from `profiles`, never JWT claims.

### Two axes: role + domain

**Role** — how much power (what actions).

| Value | Meaning |
| ----- | ------- |
| `founder` | Full access. All domains. All data. All actions. |
| `admin` | Full access. All domains. All data. All actions. |
| `manager` | Manage their domain. Full access within it. |
| `agent` | Work within own domain only. |
| `guest` | Read-only. Scoped. Reserved for future use. |

**Domain** — where they work (which records).

| Value | Typical use |
| ----- | ------------- |
| `concierge` | Concierge agents |
| `onboarding` | Onboarding agents |
| `finance` | Finance team |
| `marketing` | Marketing team |
| `tech` | Tech team |
| `shop` | Shop team |
| `b2b` | Business team |
| `house` | House (resort) team |
| `legacy` | Legacy team |

**One domain per user.** No grants table. No multi-domain assignment. Cross-domain visibility is handled operationally (admin temporarily changes `domain`), not via a second table.

Constants: `USER_ROLES` / `ROLE_LABELS` in `src/lib/constants/roles.ts`; `APP_DOMAINS` / `DOMAIN_LABELS` in `src/lib/constants/domains.ts`. Gia modules use the narrower `GIA_DOMAINS` subset — user management forms use full `APP_DOMAINS`.

### How a role change takes effect

**Immediate.** RLS policies call `get_user_role()` on each statement; that function `SELECT role FROM profiles WHERE id = auth.uid()`. No cache. `updateUserAuthorization` + `profiles_update` RLS apply on commit; `log_profile_changes()` writes audit rows for `role` and `domain`.

---

## 3. Data Model

### 3a. profiles table

Defined in `supabase/migrations/20260526000001_profiles.sql`.

| Column | Type | Nullable | Default | Notes |
| ------ | ---- | -------- | ------- | ----- |
| `id` | `uuid` | NO | — | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | `text` | NO | — | CHECK length 1–100 |
| `username` | `text` | YES | — | UNIQUE; CHECK length 3–30 when set |
| `email` | `text` | NO | — | UNIQUE; copied from auth on create; not editable in UI |
| `phone` | `text` | YES | — | E.164; `normalizeToE164()` on every write |
| `avatar_url` | `text` | YES | — | CHECK length &lt; 500; Supabase Storage public URL |
| `role` | `user_role` | NO | `'agent'` | Authorization axis 1 |
| `domain` | `app_domain` | NO | `'concierge'` | Authorization axis 2 |
| `job_title` | `text` | YES | — | CHECK length &lt; 100 |
| `reports_to` | `uuid` | YES | — | FK → `profiles(id)` ON DELETE SET NULL; no UI yet |
| `is_active` | `boolean` | NO | `true` | Soft deactivate; never hard-delete profile |
| `is_on_leave` | `boolean` | NO | `false` | Availability display |
| `theme` | `text` | NO | `'earth'` | CHECK ∈ earth, air, water, fire, cosmos |
| `timezone` | `text` | NO | `'Asia/Kolkata'` | |
| `last_seen_at` | `timestamptz` | YES | — | Spec: middleware, max once/min (see §13) |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Maintained by trigger |

**Indexes:**

| Name | Columns | Partial condition |
| ---- | ------- | ----------------- |
| `idx_profiles_role` | `role` | — |
| `idx_profiles_domain` | `domain` | — |
| `idx_profiles_domain_active` | `domain` | `WHERE is_active = true` |

**Triggers on profiles:**

| Trigger | Event | Function |
| ------- | ----- | -------- |
| `profiles_updated_at` | BEFORE UPDATE | `update_updated_at()` — sets `NEW.updated_at = now()` |
| `on_auth_user_created` | AFTER INSERT on `auth.users` | `handle_new_user()` — inserts `profiles` row (see §3d) |
| `profiles_audit` | AFTER UPDATE | `log_profile_changes()` — append-only audit (see §3e) |
| `on_agent_profile_created` | AFTER INSERT OR UPDATE on `profiles` | `handle_agent_routing_config()` (migration 0002; see §3f) |

**Application rule:** Never `INSERT` into `profiles` from app code. Rows are created only by `on_auth_user_created`.

---

### 3b. RLS policies on profiles (migration 0001)

RLS enabled: `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`.

#### `profiles_select`

- **Command:** SELECT
- **USING:** `auth.uid() IS NOT NULL`
- **WITH CHECK:** (none)

**Why all authenticated users can read all profiles:** Assignee pickers, agent names on leads, task assignees, WhatsApp sender labels, and `reports_to` resolution all need cross-user reads. Domain scoping for *sensitive* data lives on `leads`, `tasks`, etc., not on hiding profile names.

**Implication for Team list:** `getAllProfiles()` uses the session client; RLS does **not** limit rows to admin/founder. The **page gate** on `/admin/users` is what restricts the UI to admin/founder.

#### `profiles_update`

- **Command:** UPDATE
- **USING:**

```sql
auth.uid() = id
OR get_user_role() IN ('admin', 'founder')
```

- **WITH CHECK:**

```sql
(get_user_role() IN ('admin', 'founder'))
OR
(
  auth.uid() = id
  AND role   = (SELECT role   FROM profiles WHERE id = auth.uid())
  AND domain = (SELECT domain FROM profiles WHERE id = auth.uid())
)
```

**Privilege-escalation block — exact mechanism:**

The `WITH CHECK` clause is evaluated on the **new row** after UPDATE. It has two branches joined by `OR`:

1. **Admin/founder branch:** If `get_user_role()` is `admin` or `founder`, the check passes unconditionally. They may set any user's `role` and `domain` (subject to action-layer auth on `updateUserAuthorization`).

2. **Self-edit branch:** If the caller is updating their own row (`auth.uid() = id` in USING already allowed the attempt), the new `role` and `domain` must **exactly equal** the caller's **current** values as read from `profiles` via subselect:
   - `role = (SELECT role FROM profiles WHERE id = auth.uid())`
   - `domain = (SELECT domain FROM profiles WHERE id = auth.uid())`

A user cannot POST `role = 'admin'` on their own row: the subselect returns their existing role (e.g. `agent`), which does not match the attempted new value — **WITH CHECK fails**, UPDATE rejected.

The subselect reads the live row in `profiles`, not JWT. Escalation via stale token is impossible.

**What this does not block:** Admins/founders changing anyone's role/domain (first branch). Managers have no UPDATE path on others' profiles via RLS unless they are admin/founder.

#### No INSERT / No DELETE

- **INSERT:** No policy. Only `handle_new_user()` trigger inserts.
- **DELETE:** No policy. Deactivate via `is_active = false` only.

---

### 3c. Authorization helper functions

#### `get_user_role()`

```sql
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;
```

#### `get_user_domain()`

```sql
CREATE OR REPLACE FUNCTION get_user_domain()
RETURNS app_domain
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT domain FROM profiles WHERE id = auth.uid();
$$;
```

**Why SECURITY DEFINER:** An RLS policy on `profiles` that calls `get_user_role()` would otherwise query `profiles` under the caller's RLS — circular dependency. `SECURITY DEFINER` runs as the function owner (postgres), bypassing RLS for that inner SELECT only.

**Why `SET search_path = public`:** Prevents search-path injection on SECURITY DEFINER functions. Mandatory on all such functions (Rule A-10).

**Casting rule:** `get_user_domain()` returns `app_domain` (enum). Comparing to a `text` column without cast causes PostgreSQL error **`42883`** (`operator does not exist: app_domain = text`).

**Always:** `get_user_domain()::text` when the other side is `text`.

**Migrations where 42883 bit the project (post domain normalization):**

| Migration | Function / area | Fix |
| --------- | --------------- | --- |
| `20260530000042_fix_group_task_summaries_domain_type.sql` | `get_group_task_summaries` | Removed erroneous `::text` compare after `task_groups.domain` became `app_domain` |
| `20260530000043_fix_dashboard_summary_domain_type.sql` | `get_dashboard_summary` | `p_domain` parameter typed `app_domain` |
| `20260530000044_fix_campaign_metrics_domain_type.sql` | `get_campaign_metrics` | `p_domain` parameter typed `app_domain` |

---

### 3d. on_auth_user_created trigger

**Trigger:** `on_auth_user_created` — `AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()`.

**Function (full SQL):**

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, domain)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'agent'::user_role
    ),
    COALESCE(
      (NEW.raw_user_meta_data->>'domain')::app_domain,
      'concierge'::app_domain
    )
  );
  RETURN NEW;
END;
$$;
```

**`raw_user_meta_data` fields used on insert:** `full_name`, `role`, `domain` (as text cast to enums).

**COALESCE fallbacks if metadata absent:**

| Field | Fallback |
| ----- | -------- |
| `full_name` | `'Unknown'` |
| `role` | `'agent'` |
| `domain` | `'concierge'` |

#### Flow 1 — Set password (`createUser` action)

1. Admin/founder submits `CreateUserForm` → `createUser` server action.
2. Zod `createUserSchema` → `createAdminClient().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, role, domain, job_title, phone } })`.
3. Supabase inserts `auth.users` → **`on_auth_user_created` fires** → `profiles` row with `id`, `email`, `full_name`, `role`, `domain` from metadata (only those four columns in trigger).
4. If `phone` or `job_title` provided: **`updateProfileFields(id, { phone, job_title })`** second write via session/admin path after trigger completes.

**Why two steps for phone/job_title:** `handle_new_user()` only inserts five columns. Metadata may carry `phone`/`job_title`, but the trigger does not map them into `profiles`. Reliable persistence uses an explicit `UPDATE` after the row exists.

#### Flow 2 — Magic link invite (`inviteUser` action)

1. Admin/founder submits invite form → `inviteUser`.
2. `createAdminClient().auth.admin.inviteUserByEmail(email, { data: { full_name, role, domain, job_title } })`.
3. User receives email; **profile row does not exist until first sign-in.**
4. User clicks link → Supabase creates/completes `auth.users` → **`on_auth_user_created` fires** → profile with `role`/`domain` from invite `data` (stored in `raw_user_meta_data`).
5. `job_title` in invite metadata is **not** written by trigger; no second-step update in `inviteUser` today unless added later.

**Return shapes:** `createUser` / `inviteUser` return `ActionResult<{ id: string }>` — `{ data: { id }, error: null }` on success.

---

### 3e. profile_audit_log table

| Column | Type | Nullable | Default | Notes |
| ------ | ---- | -------- | ------- | ----- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `profile_id` | `uuid` | NO | — | FK → `profiles(id)` **ON DELETE RESTRICT** |
| `changed_by` | `uuid` | NO | — | Actor at write time |
| `changed_at` | `timestamptz` | NO | `now()` | |
| `field_name` | `text` | NO | — | Which field changed |
| `old_value` | `text` | YES | — | Prior value as text |
| `new_value` | `text` | YES | — | New value as text |

**Fields audited (exact):** `role`, `domain`, `is_active`, `is_on_leave`, `full_name`, `username`, `email`.

**Fields intentionally excluded:** `theme`, `timezone`, `phone`, `job_title`, `avatar_url`, `reports_to`, `last_seen_at` — not authorization-identity audit scope (preferences / contact).

**ON DELETE RESTRICT on `profile_id`:** A profile row **cannot be hard-deleted** while any audit row references it. Deactivation is `is_active = false`; historical integrity and compliance require the profile id to remain.

**`log_profile_changes()` trigger:**

- Fires: `AFTER UPDATE ON profiles FOR EACH ROW`
- `changed_by := COALESCE(auth.uid(), NEW.id)` — normal session updates use `auth.uid()`; service-role/migration writes with null `auth.uid()` attribute changes to the profile id itself so INSERT never fails.

**Append-only contract:**

- No INSERT policy for app users (trigger only).
- No UPDATE policy.
- No DELETE policy.

**RLS SELECT — `audit_log_select`:**

```sql
USING (get_user_role() IN ('admin', 'founder'))
```

No Team UI reads `profile_audit_log` today; access is DB/API only for admin/founder.

---

### 3f. agent_routing_config table

Migration: `supabase/migrations/20260526000002_agent_routing_config.sql`.

| Column | Type | Nullable | Default | Notes |
| ------ | ---- | -------- | ------- | ----- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `agent_id` | `uuid` | NO | — | UNIQUE FK → `profiles(id)` ON DELETE CASCADE |
| `is_active` | `boolean` | NO | `true` | On-duty / round-robin pool switch |
| `shift_start` | `time` | YES | — | Advisory |
| `shift_end` | `time` | YES | — | Advisory |
| `updated_at` | `timestamptz` | NO | `now()` | `update_updated_at()` trigger |

**Indexes:** `idx_agent_routing_config_agent_id`; `idx_agent_routing_config_active` on `(is_active) WHERE is_active = true`.

**RLS:**

| Policy | Command | USING / WITH CHECK |
| ------ | ------- | ------------------ |
| `routing_config_select` | SELECT | `auth.uid() IS NOT NULL` |
| `routing_config_update` | UPDATE | `get_user_role() IN ('manager', 'admin', 'founder')` (USING and WITH CHECK) |

No app-layer INSERT (trigger only). No DELETE.

**`handle_agent_routing_config()` trigger:**

- **Event:** `AFTER INSERT OR UPDATE ON profiles`
- **INSERT path:** `TG_OP = 'INSERT' AND NEW.role = 'agent'` → `INSERT INTO agent_routing_config (agent_id, is_active) VALUES (NEW.id, true) ON CONFLICT (agent_id) DO NOTHING`
- **UPDATE path:** `TG_OP = 'UPDATE' AND NEW.role = 'agent' AND OLD.role <> 'agent'` → same insert, idempotent
- **`ON CONFLICT DO NOTHING`:** Safe if row already exists (promotion back to agent, re-run).

**`is_active` semantics:** `false` removes agent from round-robin pool immediately (ingestion reads active configs). **`shift_start` / `shift_end`:** advisory; application may respect them; DB does not auto-enforce schedule.

---

## 4. Authorization Helper Functions — Callers

### Where they are called

| Layer | Calls `get_user_role()` / `get_user_domain()`? | Pattern |
| ----- | ---------------------------------------------- | ------- |
| **RLS policies** (all migrations) | Yes | Primary consumer — every domain/role gate |
| **`profiles-service.ts`** | No | Uses `createClient()` + direct `profiles` queries; auth via RLS + page/action gates |
| **Server actions** | No | `getCurrentProfile()` → `getProfileById(auth user id)` |
| **Client components** | **Must never** | Would bundle server-only code; use server actions |

`getCurrentProfile()` is the application-layer equivalent: reads `profiles` for `auth.uid()` once per action, never JWT role claims.

### Why never from client components

Helper functions are SQL executed in Postgres. Client components must not import `profiles-service` or call Supabase RPCs that embed authorization without re-validation. All mutations go through server actions that call `getCurrentProfile()` first (Rule A-09 two-layer: action check + RLS).

---

## 5. Services — profiles-service.ts

All use **`createClient()`** from `src/lib/supabase/server.ts` (session/cookie client) unless noted.

| Function | Parameters | Return | Client | Called by |
| -------- | ----------- | ------ | ------ | --------- |
| `getProfileById` | `id: string` | `Profile \| null` | session | Detail page, `getCurrentProfile`, others |
| `getAllProfiles` | — | `Profile[]` | session | `/admin/users` page |
| `getProfilesByDomain` | `domain: AppDomain` | `Profile[]` | session | Domain-scoped pickers (elsewhere) |
| `getProfilesByRole` | `role: UserRole` | `Profile[]` | session | Role filters (elsewhere) |
| `getActiveAgentsByDomain` | `domain: AppDomain` | `Profile[]` | session | Round-robin, agent lists |
| `isUsernameTaken` | `username`, `excludeId?` | `boolean` | session | `updateProfile` action |
| `getCurrentProfile` | — | `Profile \| null` | session | All profile actions, most pages |
| `updateProfileFields` | `id`, partial of `full_name \| username \| phone \| job_title \| theme \| timezone \| is_on_leave \| avatar_url` | `{ data, error }` | session | `updateProfile`, `updateProfileAvatar`, `createUser` (phone/job_title) |
| `updateAuthorization` | `id`, `role`, `domain` | `{ data, error }` | session | `updateUserAuthorization` |
| `setProfileActive` | `id`, `is_active` | `{ data, error }` | session | `toggleUserActive` |
| `getAssignableUsers` | `{ domain?, agentsOnly? }` | `AssignableUser[]` | session | THE assignable-users query (dry-audit M-11) — default all active non-guest users any domain (subtask/Gia pickers); `domain`/`agentsOnly` scope it for lead/deal assignment pools |

**Note on `updateProfileFields` allow-list:** the `Pick` includes `is_on_leave`, but no user-management UI writes it today (the `is_on_leave` flag is set elsewhere / reserved). The `updateProfile` action only maps `full_name`, `username`, `job_title`, `phone`, `theme`, `timezone` into the field set — never `is_on_leave`, `avatar_url` (avatar has its own action), or auth fields.

**No admin client in profiles-service.** User **creation** uses `createAdminClient()` only inside `src/lib/actions/profiles.ts` for Auth Admin API.

---

## 6. Actions — profiles.ts

Every action: Zod first (Rule 02) → `getCurrentProfile()` (Rule 09) → service → `{ data, error }` (Rule 10).

### createUser

- **Schema:** `createUserSchema` — `full_name`, `email`, `password` (8–72), `role`, `domain`, optional `job_title`, optional `phone`
- **Auth:** `ROLES_CAN_CREATE_USER` = `admin`, `founder` only
- **Steps:** Admin API `createUser` with `user_metadata` → trigger creates profile → optional `updateProfileFields` for phone/job_title
- **Sanitize:** `sanitizeText` on name/job_title; `normalizeToE164(phone, 'IN')` when present
- **Errors:** duplicate email → `formErrors.emailUnavailable`
- **Return:** `{ data: { id: authUser.user.id }, error: null }`; `revalidatePath('/admin/users')`

### inviteUser

- **Schema:** `inviteUserSchema` — `full_name`, `email`, `role`, `domain`, optional `job_title` (no password)
- **Auth:** admin, founder
- **Mechanism:** `inviteUserByEmail` with `data: { full_name, role, domain, job_title }` → magic link email → profile on **first sign-in** via trigger
- **Return:** `{ data: { id: inviteData.user.id }, error: null }` (auth user id reserved before completion)

### updateProfile

- **Who:** self (`caller.id === id`) OR admin/founder
- **Fields:** `full_name`, `username`, `phone`, `job_title`, `theme`, `timezone` (not `role`/`domain`)
- **Phone:** `normalizeToE164` when provided
- **Username:** `isUsernameTaken` pre-check
- **revalidatePath:** `/profile`, `/admin/users`, `/admin/users/${id}`

### updateUserAuthorization

- **Who:** admin, founder only (action); RLS first branch allows DB UPDATE
- **Fields:** `role`, `domain` via `updateAuthorization()`
- **Why safe despite self-edit WITH CHECK:** Admins pass `(get_user_role() IN ('admin', 'founder'))` branch — not the subselect branch
- **revalidatePath:** `/admin/users`, `/admin/users/${id}`

### toggleUserActive

- **Signature:** `toggleUserActive(formData)` — **single-arg**, not the `(prevState, formData)` `useActionState` shape used by `createUser`/`updateProfile`/`updateUserAuthorization`/`inviteUser`/`updateProfileAvatar`. It is called imperatively inside a `useTransition` in `UserStatusControls` (`await toggleUserActive(fd)`), not bound to a `<form action>`. Do not "normalise" it to the two-arg shape — it has no `_prevState`.
- **Who:** admin, founder
- **Sets:** `is_active` via `setProfileActive`
- **Soft deactivate:** user cannot log in meaningfully; row retained; audit logs `is_active` changes
- **revalidatePath:** `/admin/users`

### updateProfileAvatar

- **Who:** self OR admin/founder
- **Writes:** `avatar_url` only via `updateProfileFields`
- **Upload:** client-side in `ProfileAvatarSection` — Storage path `{user_id}` file key, bucket `avatars`, then action persists public URL
- **Validation today:** Zod `.url()` on `avatar_url`; **spec** also requires public URL under project `avatars` bucket prefix before write (enforce when hardening)
- **revalidatePath:** `/profile`

### signOutUser

- Any authenticated user; `signOut` + `redirect('/login')`

---

## 7. Validation Schemas — profile-schema.ts

| Schema | Fields | Key constraints |
| ------ | ------ | --------------- |
| `createUserSchema` | full_name, email, password, role, domain, job_title?, phone? | role/domain ∈ enums; empty strings → null for optional text |
| `updateProfileSchema` | id (uuid), optional full_name, username, job_title, phone, theme, timezone | username regex `^[a-z0-9_]+$`; theme enum |
| `updateAuthorizationSchema` | id, role, domain | both required enums |
| `toggleUserActiveSchema` | id, is_active (boolean) | |
| `inviteUserSchema` | full_name, email, role, domain, job_title? | no password |
| `updateProfileAvatarSchema` | id, avatar_url | must be valid URL |

**Cross-field rules:** None beyond enum membership and string transforms. No `.refine()` blocks.

---

## 8. /admin/users — List Page

### page.tsx

- **Gate:** `getCurrentProfile()`; redirect `/dashboard` if role ∉ `{ admin, founder }`
- **Fetch:** `getAllProfiles()` — ordered by `full_name` asc; session client; RLS allows read for any authenticated user but page gate limits UI
- **Tree:** `<main className="flex-1 p-8">` → header (`Team.` + page-title-dot) + `Add Member` link (inline accent `<Link>`, not a `Button`/`MotionButton`) → `<UsersTable users={users} />`
- **Loading:** route-level `src/app/(dashboard)/admin/users/loading.tsx` provides the skeleton (filter strip + card rows). The page itself awaits `getAllProfiles()` directly — there is **no** in-page `<Suspense>` boundary (the whole page is one fetch unit; the list page is small).
- **Note:** Filter bar lives **inside** `UsersTable`, not a separate page-level strip (differs from canonical leads template but same tokens)

### UsersTable

- **Filtering:** **Client-side** `useMemo` over full `users` prop — **not** server-side URL params (deliberate; team size is low, single `getAllProfiles()` fetch)
- **Controls:** `SearchBar` (name/email/job_title haystack); role `<select>` (single); domain `<select>` (single)
- **Filter bar chrome:** `SlidersHorizontal` + **active-count badge** (accent pill, `--theme-accent` bg / `--theme-accent-fg`) when search/role/domain active; trailing `N members` count (`marginLeft: auto`)
- **Display:** Card list — `UserCard` is a `motion.div` row, **not** `Table<T>`. (Note: the `src/components/CLAUDE.md` "Component Sweep — 2026-05-29" table lists UsersTable under "Raw `<table>` → `Table`"; that entry is stale for this file — the shipped component is the card-list pattern. `SearchBar` and `Avatar` adoption *are* accurate.) Each card links to `/admin/users/[id]` via a `Pencil` "Edit" link.
- **Role pill colours:** `getRolePillStyle()` — founder/admin → accent surface; manager → `--color-info-*`; agent → paper-subtle; guest → tertiary. Status dot: `--color-success` active / tertiary inactive; label shows "On leave" when `is_on_leave`.
- **Motion:** staggered Framer Motion `opacity 0→1, y 4→0`, delay `min(index * 80, 320) ms`, `EASE_OUT_EXPO`; hover `translateY(-1px)` + `--shadow-2`
- **Empty state:** Playfair italic — "No team members yet." / "No members match your filters." with tertiary subcopy (inline in component, not shared empty-state component)

---

## 9. /admin/users/new — Create User Page

### Why NewUserClient.tsx exists

`/admin/users/new/page.tsx` is a **Server Component** (auth gate, layout, `BackButton`, title). Onboarding mode (`"password" | "invite"`) must drive **both** the left form and the right `TabSelector` + tips panel. React state cannot live in the server page without splitting. **`NewUserClient`** is the `'use client'` boundary that owns `mode` state and passes it to **`CreateUserForm`** as a controlled prop (form has **no** internal mode state).

### Two-column layout

- **Max width:** `1280px` (Wide zone)
- **Grid:** `minmax(0, 1fr) 340px`; right column `position: sticky; top: var(--space-6)`
- **Left:** `SectionCard` "Member Details" → `CreateUserForm mode={mode}`
- **Right:** `SectionCard` "Onboarding Method" → `TabSelector` variant `connected` ("Set password" / "Send invite link") + mode-aware tips

**Password mode tips:**

1. **You set a temporary password** — Share securely; user can change after first login.
2. **Role & domain** — Permissions and data visibility; both audited.

**Invite mode tips:**

1. **Magic link sent by email** — User chooses password on first sign-in; no shared temp credential.
2. **Role & domain** — Same auditing note as password mode.

### CreateUserForm — password mode

- **Fields:** full_name, email, password, role, domain, job_title (optional), phone (optional)
- **Schema / action:** `createUserSchema` → `createUser`
- **Success:** `useEffect` redirects to `/admin/users` when `createState.data` or `inviteState.data` set

### CreateUserForm — invite mode

- **Fields:** full_name, email, role, domain, job_title (optional) — no password, no phone
- **Schema / action:** `inviteUserSchema` → `inviteUser`
- **User receives:** Supabase magic-link email
- **Profile created:** On link click / first auth completion, not on form submit

---

## 10. /admin/users/[id] — User Detail Page

### Access asymmetry

| Capability | manager | admin / founder |
| ---------- | ------- | ----------------- |
| View page | yes | yes |
| `EditProfileForm` | yes (RLS: only self-edit unless privileged — **managers editing others may fail at DB** unless admin/founder) | yes |
| `EditAuthorizationForm` | **not rendered** | yes |
| Account `is_active` toggle | hidden | yes |
| Routing toggle (agents) | yes | yes |

**Note:** Manager edit of another user's profile fields is not granted by `profiles_update` USING (only self or admin/founder). Manager detail view is primarily for **inspection** and **routing toggle**; privileged users perform profile edits.

### Wide two-column layout

- **maxWidth:** 1280px
- **Header:** `BackButton href="/admin/users" label="Back to Team"` inline with Playfair title (`user.full_name` + page-title-dot)
- **Left:** `EditProfileForm` in SectionCard; `EditAuthorizationForm` in SectionCard (privileged only)
- **Right (340px sticky):** `SectionCard` "Identity" `bodyPadding={false}` — avatar, name, email, job_title, role/domain pills; bottom zone `UserStatusControls` separated by top border

**Layout correction vs early spec:** `UserStatusControls` lives **inside** the Identity card, not a separate SectionCard.

### Identity SectionCard (right)

- `Avatar` size `xl` (not upload on admin detail — read-only; upload on `/profile` via `ProfileAvatarSection`)
- Name, email, optional job_title
- `ROLE_LABELS` + `DOMAIN_LABELS` pills
- Member-since strip: **on `/profile` only** (`formatDate(created_at, 'MMM yyyy')` on `--theme-paper-subtle`); admin detail page does not show member-since today

### EditProfileForm

- Fields (in DOM order): full_name, job_title, phone, username (each `name=` matches the Zod key; field ids are prefixed `edit_*`)
- Labels: `label-micro` style (`--text-2xs`, widest tracking, tertiary uppercase)
- Action: `updateProfile` via `useActionState` — `(prevState, formData)` shape, bound to `<form action>` (phone normalized server-side; username uniqueness pre-checked in the action)

### EditAuthorizationForm

- Fields: role (`USER_ROLES`), domain (`APP_DOMAINS`)
- DOM: only if `isPrivileged`
- Action: `updateUserAuthorization`
- Warning copy: changes immediate + audited

### UserStatusControls

- **Account toggle:** `toggleUserActive` — only if `isPrivileged`; flips `is_active`; copy explains login lockout
- **Routing toggle:** `toggleAgentRouting` — if `user.role === 'agent'` && `canToggleRouting` && `routingConfig` loaded; manager/admin/founder
- **Manager view-only strip:** if neither toggle shown, shows Active/Inactive + on-leave text

### ProfileAvatarSection (cross-reference — `/profile`)

- **Path:** `src/components/profile/ProfileAvatarSection.tsx`
- **Tile:** 96×96, `--radius-md`, hover camera overlay, spinner on upload
- **Validation:** image/* only; **2 MB** max client-side
- **Storage:** `createClient()` → `avatars` bucket, path `profile.id`, `upsert: true`
- **Persist:** `updateProfileAvatar` with `publicUrl?t={timestamp}` cache-bust
- **Bucket policy (operational):** public read, authenticated write, RLS object path `{user_id}` — configured in Supabase dashboard (not in SQL migrations; same pattern as `ad-creatives` bucket note in changelog)

---

## 11. SectionCard and BackButton — Shared Primitives

### SectionCard

**File:** `src/components/ui/SectionCard.tsx`

| Prop | Purpose |
| ---- | ------- |
| `title` | Header micro-label (`label-micro`) |
| `description?` | Tertiary subtitle under title |
| `headerRight?` | Right slot in header strip |
| `bodyPadding?` | Default `true` → body `padding: var(--space-6)`; `false` when child owns padding |
| `children` | Body content |

**Chrome:** `1px var(--theme-paper-border)`, `--shadow-1`, `--radius-lg` — **never** `--shadow-paper`.

**Consumers (non-exhaustive):**

- `src/app/(dashboard)/profile/page.tsx` — Personal Details, Appearance, Security, Notifications, Identity, Session
- `src/app/(dashboard)/admin/users/[id]/page.tsx` — Profile Details, Authorization, Identity
- `src/components/admin/NewUserClient.tsx` — Member Details, Onboarding Method
- `src/components/leads/LeadTasksCard.tsx`
- `src/components/campaigns/CampaignAdCard.tsx`
- `src/components/performance/AgentDetailPanel.tsx`

### BackButton

**File:** `src/components/ui/BackButton.tsx` (`'use client'`)

- 36×36 circular `motion(Link)` with `ArrowLeft`
- Props: `href`, `label` (`aria-label` + `title`)
- Placement: inline left of page `<h1>`, gap `var(--space-4)`

**Consumers:**

- `/admin/users/new`, `/admin/users/[id]`
- `/leads/[id]`, `/campaigns/[id]`
- `GroupTaskWorkspace` (tasks detail)

Detail pages use back + title; **no** page-title-dot on detail titles in admin user detail (title uses dot on name — yes: `<span className="page-title-dot">` is present).

---

## 12. Access Control Summary

| Action | agent | manager | admin | founder |
| ------ | ----- | ------- | ----- | ------- |
| View Team list (`/admin/users`) | — | — | yes | yes |
| Create user (`/admin/users/new`) | — | — | yes | yes |
| View user detail (`/admin/users/[id]`) | — | yes | yes | yes |
| Edit profile fields (others) | — | —* | yes | yes |
| Edit own profile (`/profile`) | yes | yes | yes | yes |
| Edit authorization (role/domain) | — | — | yes | yes |
| Toggle account active | — | — | yes | yes |
| Toggle agent routing | — | yes† | yes | yes |
| View audit log (DB) | — | — | yes | yes |

\*Manager: RLS blocks updating another user's profile unless admin/founder.  
†Agent profile only, with `routingConfig` loaded.

**agent_routing action:** `toggleAgentRouting` in `src/lib/actions/agent-routing.ts` — Zod `toggleRoutingSchema`; `setRoutingActive` in service; revalidates `/admin/users`, `/admin/users/[id]`, `/settings`.

---

## 13. Edge Cases and Rules (from The_Profile.md §15)

1. **Deactivating vs deleting:** Set `is_active = false`. Never delete the `profiles` row. Historical tables (tasks, lead activities, notes, remarks, audit) reference `profile_id`. `profile_audit_log.profile_id` ON DELETE RESTRICT blocks hard delete if audit rows exist.

2. **Role change is instant:** RLS reads live `profiles.role`. Change logged automatically to `profile_audit_log`.

3. **Cannot self-escalate:** `profiles_update` WITH CHECK subselect requires new `role`/`domain` equal current values for non-admin editors updating own row.

4. **Domain change is not retroactive:** New domain applies to visibility immediately; existing assigned leads/tasks stay assigned — no auto-reassign.

5. **username null fallback:** UI shows `full_name` wherever display name needed; never show null/undefined.

6. **Theme null safety:** App load uses profile `theme`; if null, default `earth` (layout inline script + profile page).

7. **last_seen_at:** Spec — middleware updates on authenticated requests, max once per minute per user, for online indicators. **Still not implemented as of 2026-06-09** — re-grepped `src/`: `last_seen_at` appears only in `src/lib/types/database.ts` (generated row type), never written by `src/proxy.ts` or any service/action. Column exists for future use.

8. **avatar_url validation:** DB length &lt; 500; spec requires Storage `avatars` bucket public URL prefix check before write (harden in action when added).

9. **Concurrent username inserts:** UNIQUE on `username` at DB; app `isUsernameTaken` is UX only.

10. **`app_domain` vs text:** Always `get_user_domain()::text` when comparing to text columns; error **42883** if omitted (see §3c).

11. **Service-role audit actor:** `COALESCE(auth.uid(), NEW.id)` for `changed_by` on migration/service writes.

---

## 14. Known Invariants (must never be violated)

1. **Profiles rows are ONLY created by `on_auth_user_created`** — no application `INSERT` into `profiles`.

2. **`profile_audit_log` is append-only** — no UPDATE or DELETE policies; ever.

3. **`ON DELETE RESTRICT` on `profile_audit_log.profile_id`** — profiles with audit history cannot be hard-deleted.

4. **`get_user_role()` and `get_user_domain()` read ONLY from `profiles`** — never JWT claims for authorization.

5. **`profiles_update` WITH CHECK** blocks non-admin users from changing their own `role` or `domain` via subselect equality to current values.

6. **`normalizeToE164()` on every phone write** in profile actions.

7. **`avatar_url`:** validate Storage bucket public URL prefix before DB write (spec invariant; add enforcement if missing in action).

8. **Two-layer security (A-09):** server action role check **and** RLS — never rely on one alone.

9. **`agent_routing_config` auto-created idempotently** — `ON CONFLICT (agent_id) DO NOTHING` on agent insert/role promotion.

10. **Never hard-delete a profile** — soft deactivate only; no DELETE policy on `profiles`.

11. **Admin/founder for user creation** — `ROLES_CAN_CREATE_USER`; invite and password paths both use Admin Auth API + trigger.

12. **Enum cast:** `get_user_domain()::text` when paired with text columns in SQL/RPC to avoid 42883.

---

## Related actions (outside profiles.ts)

| Action | File | Role gate |
| ------ | ---- | --------- |
| `toggleAgentRouting` | `src/lib/actions/agent-routing.ts` | manager, admin, founder |
| `setAgentShiftAction` | same | manager (domain-checked), admin, founder |

---

## Enums (migration 0001)

```sql
CREATE TYPE user_role  AS ENUM ('founder','admin','manager','agent','guest');
CREATE TYPE app_domain AS ENUM ('concierge','onboarding','finance','marketing','tech','shop','b2b','house','legacy');
```

TypeScript: `UserRole`, `AppDomain` from `src/lib/types/database.ts`; `Profile` extends row with narrowed `theme` union; `ActionResult<T>` from `src/lib/types/index.ts`.
