# Eia — Profiles

### The identity and authorization foundation of the entire system.

> Every RLS policy in Eia reads from this table.
> Every role check reads from this table.
> Every domain check reads from this table.
> If this table is wrong, everything built on top of it is wrong.
>
> **Read this file completely before writing migration 0002.**
>
> **Covers:**
>
> - Why profiles exists and what it owns
> - The core authorization principle
> - Complete table schema
> - All enums
> - RLS policies (with WITH CHECK)
> - Helper functions
> - The on_auth_user_created trigger
> - Audit log table
> - All amendments from other modules
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

| Role      | What it means                                    |
| --------- | ------------------------------------------------ |
| `founder` | Full access. All domains. All data. All actions. |
| `admin`   | Full access. All domains. All data. All actions. |
| `manager` | Manage their domain. Full Access with his domain |
| `agent`   | Work within their own domain only.               |
| `guest`   | Read-only. Scoped. Reserved for future use.      |

| Domain       | Who uses it         |
| ------------ | ------------------- |
| `concierge`  | Concierge Agents    |
| `onboarding` | Onboarding Agents   |
| `finance`    | Finance team        |
| `marketing`  | Marketing team      |
| `tech`       | Tech team           |
| `shop`       | Shop team           |
| `b2b`        | Business Team       |
| `house`      | House (resort) team |
| `legacy`     | Legacy team         |

simply attach a list of permitted domains to a specific user — but critically, through a grants table, not by changing their role.
So for case of "give one person access to two domains":
john's role: Manager in Finance ← permanent, role-based
john's grants: read/write access to Tech ← explicit, expires March 1
read/write access to Concierge ← explicit, expires March 1
John is still a Finance Manager. He just has temporary, auditable, expiring visibility into two other domains.

---

## 3. Enums

Created in migration 0001.

---

## 4. profiles Table

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
  role                user_role NOT NULL DEFAULT 'agent',
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
                      CHECK (theme IN
                        ('earth','air','water','fire','cosmos')),
  timezone            text NOT NULL DEFAULT 'Asia/Kolkata',

  -- Metadata
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_profiles_role
  ON profiles(role);

CREATE INDEX idx_profiles_domain
  ON profiles(domain);

CREATE INDEX idx_profiles_domain_active
  ON profiles(domain)
  WHERE is_active = true;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Column rules:**

- `id` — always matches `auth.users.id`. Never create
  a profiles row manually — trigger only.
- `email` — copied from `auth.users` on creation.
  Not editable after creation. Unique at DB level.
  Source of truth is auth.users.
- `phone` — E.164. `normalizeToE164()` before insert.
- `username` — unique at DB level. 3–30 characters.
  UI falls back to `full_name` if null. Validated
  on insert and update at both application and DB layer.
- `full_name` — 1–100 characters. Required.
- `avatar_url` — max 500 characters. Validated at
  application layer to match Supabase storage prefix
  before any write.
- `theme` — stored here so it syncs across all devices.
  Not localStorage. Profile is source of truth.
- `last_seen_at` — updated by middleware on every
  authenticated request, max once per minute per user.
  Used for online indicators in messaging.
- `is_on_leave` — toggled by the user or their manager.
  Affects availability display across the platform.
- `role` and `domain` — never updatable by the user
  themselves. Admin and founder only. Enforced by
  the WITH CHECK clause on the update RLS policy.

---

## 5. RLS Policies

---

## 6. Authorization Helper Functions

Both are SECURITY DEFINER with SET search_path = public.
Both read ONLY from profiles. Never from JWT.
Called by every RLS policy in the entire system.

**Why SECURITY DEFINER:**
These functions run with postgres privileges, not the
calling user's privileges. This breaks the circular
dependency — an RLS policy on profiles needs to call
get_user_role(), but without SECURITY DEFINER, RLS on
profiles would block the query inside get_user_role()
before it could return anything.

**Why SET search_path = public:**
Prevents search path injection attacks. Mandatory on
all SECURITY DEFINER functions in this system.
No exceptions. Ever.

---

## 7. on_auth_user_created Trigger

Fires when a new user is created in `auth.users`.
Creates the corresponding profiles row automatically.
This is the ONLY way profiles rows are created.

**How user creation works:**
Admin opens `/admin/users/new`.
Fills in: full name, email, password, role, domain.
Server action calls Supabase Admin API with
`raw_user_meta_data` containing role and domain.
Supabase creates the auth.users row.
Trigger fires and creates the profiles row instantly.
No second step. No manual profile creation.

---

## 8. Audit Log

All changes to identity and authorization fields on
`profiles` are written to an append-only audit log.
This is required for SOC 2 and ISO 27001 compliance.
No rows in this table are ever updated or deleted.

**Fields audited:** `role`, `domain`, `is_active`,
`is_on_leave`, `full_name`, `email`, `username`.

```sql
CREATE TABLE profile_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id)
                ON DELETE RESTRICT,   -- cannot delete profile if audit log exists
  changed_by    uuid NOT NULL,        -- auth.uid() of the person who made the change
  changed_at    timestamptz NOT NULL DEFAULT now(),
  field_name    text NOT NULL,        -- which column changed
  old_value     text,                 -- previous value (cast to text)
  new_value     text                  -- new value (cast to text)
);

-- Append-only: no UPDATE, no DELETE — ever.
ALTER TABLE profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select"
  ON profile_audit_log FOR SELECT
  USING (get_user_role() IN ('admin', 'founder'));

-- No INSERT policy via RLS — written only by trigger below.
-- No UPDATE policy.
-- No DELETE policy.
```

**The audit trigger:**

```sql
CREATE OR REPLACE FUNCTION log_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Log role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'role', OLD.role::text, NEW.role::text);
  END IF;

  -- Log domain changes
  IF OLD.domain IS DISTINCT FROM NEW.domain THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'domain', OLD.domain::text, NEW.domain::text);
  END IF;

  -- Log activation/deactivation
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'is_active', OLD.is_active::text, NEW.is_active::text);
  END IF;

  -- Log leave changes
  IF OLD.is_on_leave IS DISTINCT FROM NEW.is_on_leave THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'is_on_leave', OLD.is_on_leave::text, NEW.is_on_leave::text);
  END IF;

  -- Log name changes
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'full_name', OLD.full_name, NEW.full_name);
  END IF;

  -- Log username changes
  IF OLD.username IS DISTINCT FROM NEW.username THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'username', OLD.username, NEW.username);
  END IF;

  -- Log email changes
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    INSERT INTO profile_audit_log
      (profile_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, auth.uid(), 'email', OLD.email, NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_audit
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_profile_changes();
```

---

## 9. Amendments from Other Modules

Columns added via ALTER TABLE as modules are built.
All documented here as they are added.

**Note:** `is_accepting_leads` is a Gia (CRM) module
concern. It does not live on profiles. Profile owns
identity and authorization only. Gia owns its own
availability and assignment logic.

### Gia module (Phase 2 — complete)

`agent_routing_config` is a separate table, not a column
on `profiles`. It owns all assignment-pool state:

```sql
agent_routing_config (
  agent_id      uuid  PK REFERENCES profiles(id),
  is_active     boolean NOT NULL DEFAULT true,
  shift_start   time,   -- optional: '09:00'
  shift_end     time,   -- optional: '18:00'
  updated_at    timestamptz NOT NULL DEFAULT now()
)
```

Auto-created by `handle_agent_routing_config` trigger
when a profile is inserted or updated with `role = 'agent'`.
No manual creation required.

`is_active` = the holiday switch. Set to `false` → agent
leaves the round-robin pool instantly. Flip back to `true`
→ re-enters. Shift window is advisory only — eligibility
is not automatically enforced by the DB; the ingestion
service reads it.

### OS Tasks module (Phase 9 — complete)

No columns added to `profiles`. Task assignment uses
`profiles.id` as a FK target only — no new profile columns.

**Future amendments added here as modules are built.**

---

## 10. Edge Cases and Rules

- **Deactivating a user:** Set `is_active = false`.
  Never delete the profiles row. All historical data —
  task logs, lead activities, notes, messages — references
  their id. Deleting orphans everything. The audit log
  also holds a reference — `ON DELETE RESTRICT` on
  `profile_audit_log.profile_id` enforces this at DB level.

- **Role change is instant:** RLS reads from profiles
  directly. The moment role is updated, new permissions
  are live. No token expiry required. Change is logged
  to `profile_audit_log` automatically.

- **Users cannot escalate their own role:** The WITH CHECK
  clause on `profiles_update` blocks any user from
  changing their own `role` or `domain`. Only admin
  and founder can change these fields on any row.

- **Domain change on a profile:** Changes what data the
  user can see and touch immediately. Records previously
  assigned to them stay assigned — system does not
  auto-reassign. Manager handles reassignment manually.

- **One domain per user:** A user belongs to one domain.
  If someone genuinely works across multiple domains,
  we have a setup above

- **theme null safety:** On app load, read theme from
  profile. If null for any reason, default to `earth`.
  Never crash on a missing theme preference.

- **username null:** Every UI component showing a user
  name falls back to `full_name` if username is null.
  Never show null or undefined in the UI.

- **avatar_url validation:** Application layer must
  validate that avatar_url matches the Supabase storage
  bucket prefix before any write. DB constraint caps
  length at 500 characters as a second line of defence.

- **last_seen_at writes:** Middleware updates this on
  every authenticated request but rate-limited to once
  per minute per user. Prevents excessive DB writes
  on fast-clicking users. Note: rate limit is application-
  layer only — does not apply to direct DB access.

- **Concurrent username inserts:** The UNIQUE constraint
  on `username` is enforced at DB level. Application
  validation alone is insufficient — two concurrent
  requests could both pass an app-level check. The DB
  constraint is the guarantee.

---

_Eia Profiles v1.1 — May 2026_
_Changes from v1.0: global domain updated to full read/write,_
_display_name renamed to username with UNIQUE + length constraints,_
_is_accepting_leads moved to Gia module,_
_WITH CHECK added to profiles_update policy (privilege escalation fix),_
_length constraints added to full_name, username, avatar_url, job_title,_
_email UNIQUE constraint added,_
_profile_audit_log table and trigger added (SOC 2 / ISO 27001 compliance)._
_Update this file whenever a new module adds a column_
_to the profiles table or changes authorization logic._
