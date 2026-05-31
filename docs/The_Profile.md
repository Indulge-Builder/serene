# Eia — Profiles

### The identity and authorization foundation of the entire system.

> Every RLS policy in Eia reads from this table.
> Every role check reads from this table.
> Every domain check reads from this table.
> If this table is wrong, everything built on top of it is wrong.
>
> **Covers:**
>
> - Why profiles exists and what it owns
> - The core authorization principle
> - Complete table schema (as shipped)
> - All enums
> - RLS policies
> - Authorization helper functions
> - The on_auth_user_created trigger
> - Audit log table
> - agent_routing_config (Phase 2)
> - User creation flows (password vs invite)
> - Admin UI — Team page, user detail page
> - Profile page — self-edit layout
> - Service and action layer
> - Edge cases and rules
>
> **Referenced by:** Every module. Every migration after 0001.
> **Depends on:** Migration 0001 (enums)

---

## 1. The Core Principle

Authorization in Eia works like this:

When any RLS policy anywhere in the system needs to know
who the current user is, what role they have, or what
domain they belong to — it calls one of two helper
functions. Those functions read from ONE place only:
`public.profiles`.

Never from JWT claims.
Never from session metadata.
Never from any other table.
Always and only from `public.profiles`.

**Why:**
JWT claims can be stale. A user's role gets updated in
the database, but their JWT token still carries the old
role until it expires. If RLS trusted the JWT, that user
would have the wrong permissions for potentially hours.

Reading from `profiles` directly means the moment an
admin updates someone's role, that change is live
immediately. No token expiry. No lag. No security gap.

**This principle is set on day one and never changed.**

---

## 2. Two Axes of Access

Every user in Eia has exactly two access attributes:

**Role** — how much power you have.
Answers: what actions can you take?

**Domain** — where you work.
Answers: which records can you see and touch?

That is it. No department. No team. No group.
Two values. Everything else is derived from these two.

| Role      | What it means                                     |
| --------- | ------------------------------------------------- |
| `founder` | Full access. All domains. All data. All actions.  |
| `admin`   | Full access. All domains. All data. All actions.  |
| `manager` | Manage their domain. Full access within it.       |
| `agent`   | Work within their own domain only.                |
| `guest`   | Read-only. Scoped. Reserved for future use.       |

| Domain       | Who uses it          |
| ------------ | -------------------- |
| `concierge`  | Concierge Agents     |
| `onboarding` | Onboarding Agents    |
| `finance`    | Finance team         |
| `marketing`  | Marketing team       |
| `tech`       | Tech team            |
| `shop`       | Shop team            |
| `b2b`        | Business Team        |
| `house`      | House (resort) team  |
| `legacy`     | Legacy team          |

**One domain per user.** There is no grants table and no multi-domain assignment. If a user genuinely needs visibility across domains, that is handled operationally (admin temporarily changes their domain), not via a second table.

---

## 3. Enums

Created in migration 0001. Consumed by every subsequent migration.

```sql
CREATE TYPE user_role  AS ENUM ('founder','admin','manager','agent','guest');
CREATE TYPE app_domain AS ENUM ('concierge','onboarding','finance','marketing','tech','shop','b2b','house','legacy');
```

**`app_domain` cast rule:** `get_user_domain()` returns `app_domain` (enum). When comparing with a `text` column (e.g. `task_groups.domain`), always cast: `get_user_domain()::text`. Never compare enum directly to text — this causes PostgreSQL error 42883.

---

## 4. profiles Table (as shipped — migration 0001)

```sql
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY
                      REFERENCES auth.users(id)
                      ON DELETE CASCADE,

  -- Identity
  full_name           text NOT NULL
                      CHECK (char_length(full_name) BETWEEN 1 AND 100),

  username            text UNIQUE
                      CHECK (char_length(username) BETWEEN 3 AND 30),

  email               text NOT NULL UNIQUE,

  phone               text,              -- E.164 format

  -- Avatar
  avatar_url          text
                      CHECK (char_length(avatar_url) < 500),

  -- Authorization — the two axes
  role                user_role  NOT NULL DEFAULT 'agent',
  domain              app_domain NOT NULL DEFAULT 'concierge',

  -- Reporting structure
  job_title           text
                      CHECK (char_length(job_title) < 100),
  reports_to          uuid REFERENCES profiles(id)
                      ON DELETE SET NULL,

  -- Availability flags
  is_active           boolean NOT NULL DEFAULT true,
  is_on_leave         boolean NOT NULL DEFAULT false,

  -- Preferences
  theme               text NOT NULL DEFAULT 'earth'
                      CHECK (theme IN ('earth','air','water','fire','cosmos')),
  timezone            text NOT NULL DEFAULT 'Asia/Kolkata',

  -- Metadata
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role          ON profiles(role);
CREATE INDEX idx_profiles_domain        ON profiles(domain);
CREATE INDEX idx_profiles_domain_active ON profiles(domain) WHERE is_active = true;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Column rules:**

- `id` — always matches `auth.users.id`. Never create a profiles row manually — trigger only.
- `email` — copied from `auth.users` on creation. Not editable after creation. Unique at DB level. Source of truth is `auth.users`.
- `phone` — E.164. `normalizeToE164()` before any write.
- `username` — unique at DB level. 3–30 characters. UI falls back to `full_name` if null.
- `full_name` — 1–100 characters. Required.
- `avatar_url` — max 500 characters. Stored as a Supabase Storage public URL. Application layer validates bucket prefix before write.
- `theme` — stored in DB so it syncs across devices. Not localStorage. Profile is the source of truth. Default is `earth`.
- `last_seen_at` — updated by middleware on every authenticated request, max once per minute per user. Used for online indicators.
- `is_on_leave` — toggled by the user or their manager. Affects availability display.
- `role` and `domain` — never updatable by the user themselves. Admin and founder only, enforced by the `WITH CHECK` clause on the update RLS policy.
- `reports_to` — optional FK to another profile. No UI surface yet; reserved for org-chart features.

---

## 5. RLS Policies (migration 0001)

```sql
-- All authenticated users can read all profiles
-- (needed for displaying assigned agents, assignee pickers, etc.)
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can update their own non-authorization fields.
-- Admins and founders can update anyone.
-- WITH CHECK blocks privilege escalation.
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR get_user_role() IN ('admin', 'founder')
  )
  WITH CHECK (
    (get_user_role() IN ('admin', 'founder'))
    OR
    (
      auth.uid() = id
      AND role   = (SELECT role   FROM profiles WHERE id = auth.uid())
      AND domain = (SELECT domain FROM profiles WHERE id = auth.uid())
    )
  );

-- No INSERT from application layer — trigger only.
-- No DELETE — profiles are never deleted (soft-deactivate via is_active).
```

---

## 6. Authorization Helper Functions

Both are `SECURITY DEFINER` with `SET search_path = public`.
Both read ONLY from `profiles`. Never from JWT.
Called by every RLS policy in the entire system.

**Why SECURITY DEFINER:**
These functions run with postgres privileges, not the calling user's privileges. This breaks the circular dependency — an RLS policy on `profiles` needs to call `get_user_role()`, but without `SECURITY DEFINER`, RLS on `profiles` would block the query inside `get_user_role()` before it could return anything.

**Why SET search_path = public:**
Prevents search path injection attacks. Mandatory on all SECURITY DEFINER functions. No exceptions.

```sql
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_domain()
RETURNS app_domain
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT domain FROM profiles WHERE id = auth.uid();
$$;
```

**Casting rule:** `get_user_domain()` returns `app_domain` enum. Any comparison to a `text` column requires `get_user_domain()::text`. Direct enum-to-text comparison causes PostgreSQL error 42883 (operator does not exist). This was the root cause of bugs fixed in migrations 0042–0044.

---

## 7. on_auth_user_created Trigger

Fires when Supabase creates a new `auth.users` row.
Creates the corresponding `profiles` row automatically.
This is the ONLY way profiles rows are created.

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
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role,   'agent'::user_role),
    COALESCE((NEW.raw_user_meta_data->>'domain')::app_domain, 'concierge'::app_domain)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

**Two creation flows exist (both use this trigger):**

1. **Set password** — admin calls `createUser` action → Supabase Admin API `createUser()` → trigger fires → profile row created. `phone` and `job_title` are optionally written in a second `updateProfileFields` call if provided (these fields cannot be passed through `raw_user_meta_data` reliably).

2. **Magic link invite** — admin calls `inviteUser` action → Supabase Admin API `inviteUserByEmail()` → user receives email → user clicks link → trigger fires → profile row created with `role` and `domain` from `data` metadata.

---

## 8. Audit Log (migration 0001)

All changes to identity and authorization fields are written to an append-only audit log. Required for SOC 2 / ISO 27001 compliance. No rows are ever updated or deleted.

**Fields audited:** `role`, `domain`, `is_active`, `is_on_leave`, `full_name`, `email`, `username`.
**`attachments` and preference fields (`theme`, `timezone`) are intentionally excluded** — they are not authorization-relevant.

```sql
CREATE TABLE profile_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  changed_by    uuid NOT NULL,   -- auth.uid() at write time; falls back to NEW.id for service-role writes
  changed_at    timestamptz NOT NULL DEFAULT now(),
  field_name    text NOT NULL,
  old_value     text,
  new_value     text
);

-- Append-only
ALTER TABLE profile_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select"
  ON profile_audit_log FOR SELECT
  USING (get_user_role() IN ('admin', 'founder'));
-- No INSERT policy (trigger only), no UPDATE, no DELETE — ever.
```

**Audit trigger:** `log_profile_changes()` — fires `AFTER UPDATE ON profiles FOR EACH ROW`. Uses `COALESCE(auth.uid(), NEW.id)` as `changed_by` to handle both session-authenticated updates and service-role migration writes. `ON DELETE RESTRICT` on `profile_audit_log.profile_id` enforces that profiles with audit history cannot be hard-deleted.

---

## 9. agent_routing_config (migration 0002)

A separate table owned by the Gia module. Lives in the profiles foundation because it is auto-created alongside agent profiles.

```sql
CREATE TABLE agent_routing_config (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  is_active   boolean     NOT NULL DEFAULT true,
  shift_start time,       -- optional: '09:00'
  shift_end   time,       -- optional: '18:00'
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

**RLS:** SELECT for all authenticated users. INSERT via trigger only. UPDATE for `manager | admin | founder`. No DELETE.

**Auto-creation trigger:** `handle_agent_routing_config()` fires `AFTER INSERT OR UPDATE ON profiles`. Creates a row with `is_active = true` whenever a profile is created or updated with `role = 'agent'`. Uses `ON CONFLICT DO NOTHING` to be idempotent.

**`is_active`** — the on-duty switch. Set to `false` → agent leaves the round-robin pool instantly. `shift_start` / `shift_end` are advisory; the ingestion service reads them but the DB does not auto-enforce eligibility.

**Service:** `src/lib/services/agent-routing-service.ts`
- `getAgentRoutingConfig(agentId)` — single agent config
- `getRoutingConfigsByDomain(domain)` — domain roster
- `getActiveRoutingConfigs()` — full active pool
- `getAgentRosterByDomain(domain | '*')` — joined profiles + routing config; uses `adminClient` because RLS blocks manager cross-domain reads; caller must enforce domain at action level
- `setRoutingActive(agentId, isActive)` — toggle
- `setAgentShift(agentId, shiftStart, shiftEnd)` — update shift window

**Action:** `src/lib/actions/agent-routing.ts`
- `toggleAgentRouting` — manager/admin/founder only
- `setAgentShiftAction` — manager/admin/founder only

---

## 10. Service Layer

**File:** `src/lib/services/profiles-service.ts`

All queries go through this file. No raw Supabase calls in components or actions (Rule 03).

| Function | What it does |
| -------- | ------------ |
| `getProfileById(id)` | Fetch single profile by id |
| `getAllProfiles()` | All profiles — RLS restricts to admin/founder |
| `getProfilesByDomain(domain)` | Profiles in a given domain |
| `getProfilesByRole(role)` | Profiles by role |
| `getActiveAgentsByDomain(domain)` | Active agents for round-robin |
| `isUsernameTaken(username, excludeId?)` | Username uniqueness check |
| `getCurrentProfile()` | Caller's own profile via `auth.getUser()` |
| `updateProfileFields(id, fields)` | Non-authorization field update |
| `updateAuthorization(id, role, domain)` | Role + domain update — RLS enforces admin/founder |
| `setProfileActive(id, is_active)` | Activate / deactivate |

---

## 11. Action Layer

**File:** `src/lib/actions/profiles.ts`

Every action: Zod validation first (Rule 02), then `getCurrentProfile()` for authorization (Rule 09), then service call, then `revalidatePath`.

| Action | Who can call | What it does |
| ------ | ------------ | ------------ |
| `createUser` | admin, founder | Creates auth user + profile via trigger. Optional second write for phone/job_title. |
| `inviteUser` | admin, founder | Sends magic-link invite via `inviteUserByEmail`. Profile created on first sign-in. |
| `updateProfile` | self, admin, founder | Updates name, username, phone, job_title, theme, timezone. |
| `updateUserAuthorization` | admin, founder | Updates role + domain. RLS WITH CHECK enforces this at DB level too. |
| `toggleUserActive` | admin, founder | Sets `is_active`. |
| `updateProfileAvatar` | self, admin, founder | Persists a Supabase Storage URL after client-side upload. |
| `signOutUser` | any authenticated | Signs out and redirects to `/login`. |

**Validation schemas:** `src/lib/validations/profile-schema.ts` — `createUserSchema`, `updateProfileSchema`, `updateAuthorizationSchema`, `toggleUserActiveSchema`, `inviteUserSchema`, `updateProfileAvatarSchema`.

---

## 12. Admin UI — Team Page (`/admin/users`)

**Page:** `src/app/(dashboard)/admin/users/page.tsx`
**Access:** admin, founder only — non-admin redirected to `/dashboard`.

Layout follows the canonical list-page pattern: page header (`Team.`) + `+ Add Member` link top-right, filter bar below, `UsersTable` content area.

**`UsersTable`** (`src/components/admin/UsersTable.tsx`) — client-side filter (role, domain, search) over server-fetched `getAllProfiles()`. Card-list display mode (staggered Framer Motion entrance). Each row links to `/admin/users/[id]`.

**New User page** (`/admin/users/new`):
- `NewUserClient.tsx` — `'use client'` wrapper that owns `mode: "password" | "invite"` state. Required because the page is a Server Component but mode state is shared across columns.
- `CreateUserForm.tsx` — accepts `mode` prop; no internal `TabSelector`. Two columns: form left, tips panel right with `TabSelector` (connected variant) for mode switching.

---

## 13. User Detail Page (`/admin/users/[id]`)

**Page:** `src/app/(dashboard)/admin/users/[id]/page.tsx`
**Access:** admin, founder, manager (managers can view but not change authorization).

Layout: wide two-column grid (`minmax(0, 1fr) 340px`). Left column: `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`. Right sticky column: Identity `SectionCard` (avatar, name, role/domain pills, member-since) + routing config toggle (agents only).

**Components:**
- `EditProfileForm` — full_name, phone, job_title, username. Labels use `label-micro` style.
- `EditAuthorizationForm` — role + domain selects. Admin/founder only.
- `UserStatusControls` — `is_active` toggle + routing `is_active` toggle (agents only, manager/admin/founder).

Uses `BackButton` (shared primitive) and `SectionCard` (shared primitive) introduced in the admin redesign (2026-05-30).

---

## 14. Profile Page (`/profile`)

**Page:** `src/app/(dashboard)/profile/page.tsx`
**Access:** any authenticated user (own profile only).

Layout: wide two-column grid (`minmax(0, 1fr) 340px`). Matches `/admin/users/[id]` exactly.

Left column (editable sections, each wrapped in `SectionCard`):
- **Personal Details** — `ProfileDetailsForm`: full_name, phone, job_title, username.
- **Appearance** — `ThemeSelector`: 5 swatches using `data-theme` trick (preview tokens resolve without hardcoded hex). Theme change: instant DOM switch via `data-theme` attribute, then async `updateProfile` action via `useTransition`.
- **Security** — `PasswordChangeForm`: re-authenticates via `signInWithPassword` before `updateUser`. 4-step live strength bar. Show/hide toggle. Browser Supabase client only.
- **Notifications** — `NotificationPreferences`: stubbed disabled toggles. "Coming soon."

Right sticky column:
- **Identity** `SectionCard` — `ProfileAvatarSection` (upload tile 96×96, hover camera overlay, spinner), name, email, job_title, role + domain status pills, member-since strip.
- **Session** `SectionCard` — sign-out form → `signOutUser` action.

**Zero-flash theme:** `src/app/(dashboard)/layout.tsx` contains an inline `<script>` that sets `data-theme` synchronously before paint, reading from the profile's `theme` field. Supabase Storage bucket `avatars` required: public read, authenticated write, RLS path `{user_id}`.

---

## 15. Edge Cases and Rules

- **Deactivating a user:** Set `is_active = false`. Never delete the profiles row. All historical data — task logs, lead activities, notes, remarks — references their id. `ON DELETE RESTRICT` on `profile_audit_log.profile_id` enforces this at DB level.

- **Role change is instant:** RLS reads from `profiles` directly. The moment role is updated, new permissions are live. Change is logged to `profile_audit_log` automatically.

- **Users cannot escalate their own role:** The `WITH CHECK` clause on `profiles_update` blocks any user from writing a different `role` or `domain` onto any row, including their own.

- **Domain change on a profile:** Changes what data the user can see immediately. Records previously assigned to them stay assigned — the system does not auto-reassign. Manager handles reassignment manually.

- **Theme null safety:** On app load, read theme from profile. If null for any reason, default to `earth`. Never crash on a missing theme preference.

- **username null:** Every UI component showing a user name falls back to `full_name` if `username` is null. Never show null or undefined in the UI.

- **avatar_url validation:** Application layer validates that `avatar_url` matches the Supabase storage bucket prefix before any write. DB constraint caps length at 500 characters as a second line of defence.

- **last_seen_at writes:** Middleware updates this on every authenticated request but rate-limited to once per minute per user. Application-layer only — does not apply to direct DB access.

- **Concurrent username inserts:** The UNIQUE constraint on `username` is enforced at DB level. Application-layer uniqueness check alone is insufficient — the DB constraint is the guarantee.

- **`app_domain` enum vs text:** Any RLS policy or SQL that compares `get_user_domain()` to a text column must cast: `get_user_domain()::text`. Without the cast, PostgreSQL raises error 42883. This affected migrations 0042 (task_groups), 0043 (dashboard_summary), 0044 (campaign_metrics) — all fixed with explicit casts.

- **Service-role writes and audit log:** `log_profile_changes()` uses `COALESCE(auth.uid(), NEW.id)` as `changed_by`. This means migration scripts and service-role clients that update profiles still produce a valid audit row attributed to the profile itself rather than crashing on a null actor.

---

_Eia Profiles v2.0 — Updated 2026-05-31_

_Changes from v1.1: service layer documented (§10); action layer documented (§11); admin Team page documented (§12); user detail page documented (§13); profile self-edit page documented (§14); agent_routing_config fully documented with service/action layer (§9); app_domain cast rule added to §3 and §6; two creation flows (password vs invite) documented in §7; audit trigger COALESCE actor fix documented in §8; grants-table concept removed (not implemented); edge cases updated with 42883 cast issue (§15)._
