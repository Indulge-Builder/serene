# Auth & RBAC

> **Purpose:** how identity, sessions, roles, domains, and row-level security work — the authorization architecture every other doc assumes.
> **Audience:** engineers. · **Source-of-truth scope:** authorization model, session layer, route gating, RLS + SECURITY DEFINER policy. The `profiles` table schema lives in `database.md`; per-page role gates live in each `../pages/*.md`.
> **Last verified:** 2026-06-20 against `src/proxy.ts`, `src/lib/constants/domains.ts`, `src/lib/constants/route-permissions.ts`, `src/lib/actions/_auth.ts`, `src/lib/actions/auth.ts`, migrations 0001/0088/0091/0095/0102/0103.

---

## 1. The core principle

Authorization in Serene reads from **one place only: `public.profiles`** (Rule A-01).

Never from JWT claims. Never from session metadata. Never from any other table.

**Why:** JWT claims go stale — a role updated in the database still rides the old token until
expiry. Reading `profiles` live means a role change is effective on the next request. No token
lag, no security gap. This principle was set on day one and never changes.

## 2. The two helper functions

The only functions any RLS policy should call:

```sql
CREATE OR REPLACE FUNCTION get_user_role()  RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_user_domain() RETURNS app_domain
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT domain FROM profiles WHERE id = auth.uid();
$$;
```

- **`SECURITY DEFINER`** breaks the circular dependency: RLS on `profiles` would otherwise block
  the query inside the helper itself.
- **`SET search_path = public`** is mandatory on every SECURITY DEFINER function (A-10) —
  prevents search-path injection.
- **The cast rule:** `get_user_domain()` returns the `app_domain` enum. Comparing to a `text`
  column requires `get_user_domain()::text` — PostgreSQL never implicitly casts enum↔text
  (error 42883; bit migrations 0042–0044).
- **The InitPlan rule (migrations 0088 + 0095):** inside RLS policies the helpers are wrapped as
  uncorrelated scalar subqueries — `(SELECT get_user_role())` — so a STABLE function evaluates
  once per statement instead of once per row.

## 3. Roles

Stored on `public.profiles.role` (`user_role` enum, migration 0001).

| Role | What it means |
| ---- | ------------- |
| `founder` | Full access. All domains, all data, all actions. |
| `admin` | Full access. All domains, all data, all actions. |
| `manager` | Manages their domain. Full access within it. |
| `agent` | Works within their own domain; sees only their own assigned leads. |
| `guest` | Read-only, scoped. Reserved — not used in any flow today. |

Admin and founder are deliberately distinct roles even though both bypass domain checks:
no single role may both perform a sensitive action and audit it (S-15), and privileged
operations require a second actor (S-16).

## 4. Domains — APP_DOMAINS vs GIA_DOMAINS (Q-17)

Two registries in `src/lib/constants/domains.ts`. **Never mix them.**

| Registry | Members | Used for |
| -------- | ------- | -------- |
| `APP_DOMAINS` (9) | `concierge`, `onboarding`, `finance`, `marketing`, `tech`, `shop`, `b2b`, `house`, `legacy` | User management, profiles, authorization — the full platform enum |
| `GIA_DOMAINS` (4) | `onboarding`, `house`, `shop`, `legacy` | Gia module pickers — leads, campaigns, performance, dashboard Gia widgets |

Display names come from `DOMAIN_LABELS` only (Onboarding, Indulge House, Indulge Shop,
Indulge Legacy, …). `DEFAULT_GIA_DOMAIN = 'onboarding'`. To add a Gia domain: append to
`GIA_DOMAINS` + `DOMAIN_LABELS` in that one file.

> **Corrected 2026-06-11:** the retired `master.md` (§3/§5) described GIA_DOMAINS as six
> domains including `concierge` and `b2b`. The code has been four since the 2026-05-31 Q-17
> split — four is canonical.

**One domain per user.** There is no grants table and no multi-domain assignment (the root
`README.md` previously described an expiring-grants system — it does not exist). Cross-domain
visibility is handled operationally: an admin temporarily changes the user's domain.

## 5. The profiles foundation

Full schema, trigger, and audit-log details: `database.md` §profiles. The authorization-relevant
contract:

- Profile rows are created **only** by the `on_auth_user_created` trigger (both creation flows —
  password and magic-link invite — go through Supabase Auth, which fires it).
- `role` and `domain` are never self-editable: the `profiles_update` RLS `WITH CHECK` compares
  the new row's role/domain against the caller's current row (self-elevation guard, preserved
  verbatim through the 0095 InitPlan hoist).
- Role changes are instant (RLS reads live), never retroactive (existing assignments keep their
  assignee).
- Deactivation is `is_active = false` — never row deletion (`profile_audit_log` has
  `ON DELETE RESTRICT`).
- `profile_audit_log` is append-only and audits `role`, `domain`, `is_active`, `is_on_leave`,
  `full_name`, `email`, `username` (not `theme`/`timezone`).

## 6. Two-layer security (A-09) and `requireProfile()`

RLS enforces at the DB level **and** every Server Action enforces at the application level.
Neither layer trusts the other.

The application-layer gate is `requireProfile(roles?)` in `src/lib/actions/_auth.ts` — THE
session/role guard every session-based action starts with. It returns
`{ ok: true, profile }` or `{ ok: false, result }` where `result` is a ready-made
`{ data: null, error: formErrors.unauthorized }`. Documented exceptions: `sla.ts`
(Trigger.dev context, no session — admin client), `loginAction` (reads the profile for the
`is_active` check, not authorization), and four `tasks.ts` actions that fetch profile + task in
one parallel `Promise.all`.

## 7. The session layer — `src/proxy.ts`

Next.js 16 replaces `middleware.ts` with a proxy. **There is no `src/middleware.ts` — never
recreate it** (A-13).

What `proxy.ts` actually does (verified):

1. **Webhook bypass:** any path under `/api/webhooks` returns `NextResponse.next()` immediately
   (and is also excluded in the matcher) — external POSTs never touch Supabase session refresh.
2. **Session refresh:** every other matched request runs `updateSession(request)` from
   `src/lib/supabase/middleware.ts` (the only place that helper lives).
3. **Path forwarding:** sets `x-pathname` on the response so server layouts can read the
   requested path.

> **Corrected 2026-06-11:** the retired `master.md` and the old auth doc claimed the proxy
> updates `profiles.last_seen_at` "max once per minute per user." No code anywhere writes
> `last_seen_at` — the column exists and is dormant. If presence tracking is wanted, it must
> be built; do not assume it works.

## 8. Route protection — three layers (A-13)

| Layer | Where | What it does |
| ----- | ----- | ------------ |
| 1. Proxy | `src/proxy.ts` | Session refresh on every matched request |
| 2. Layout guard | `src/app/(dashboard)/layout.tsx` | Server-side: no session → `redirect('/login')`; then domain gate via `canAccessRoute` → `redirect('/dashboard')` |
| 3. Sidebar filter | `src/components/layout/Sidebar.tsx` | Never renders links the profile cannot access |

Domain gating is `canAccessRoute(profile, pathname)` (`src/lib/utils/route-access.ts` — pure,
client-safe) over `DOMAIN_ROUTE_MAP` + `ALWAYS_ALLOWED_PREFIXES`
(`['/dashboard', '/profile', '/helpdesk', '/elaya']`) in
`src/lib/constants/route-permissions.ts`. `/helpdesk` (the Call Intelligence library) and `/elaya`
(Elaya's AI chat surface) are universally accessible to every role and domain — what Elaya can
*access* is enforced per-principal in the tool layer, not by route gating; `/helpdesk` is read-only
with RLS-gated writes. Admin/founder bypass all domain checks. The layout
guard and the Sidebar filter are independent — neither trusts the other (defense-in-depth,
Decision Log 2026-06-03). Page-level privilege checks remain in each page; `canAccessRoute` is
additive, not a replacement.

## 9. RLS philosophy

- Every table has RLS enabled in its creation migration (A-08) — confirmed table-by-table in
  `../audits/security-audit-2026-06.md` §1.
- Append-only tables (`profile_audit_log`, `lead_activities`, `lead_notes`, `task_remarks`,
  `task_audit_log`, `lead_raw_payloads`) have no UPDATE/DELETE policies, ever (A-11). The two
  narrow, documented exceptions: `task_remarks` suppression columns (admin/founder via
  `suppressTaskRemarkAction` only) and the WhatsApp delivery-receipt update
  (`processInboundMessage`'s `processStatusUpdate`, admin client only).
- Archived leads are immutable via direct UPDATE (`leads_update` requires
  `archived_at IS NULL`, migration 0091; explicit `WITH CHECK` added in 0103).
- Some tables deliberately have **no** write policies: `deals` (all writes via the admin client
  in `recordDeal`/`createWalkInDeal` — documented in `COMMENT ON TABLE`, migration 0094) and
  `lead_sla_timers` (service-role/Trigger.dev infrastructure state).

## 10. SECURITY DEFINER policy (post-F-1)

SECURITY DEFINER functions bypass RLS — they run as the function owner. The standing rules:

1. **`SET search_path = public`** on every one (A-10; all 30 verified in the security audit).
2. **Never trust a caller-supplied scope parameter** (`p_role`, `p_domain`, `p_user_id`) for
   access decisions (Q-13). Self-scoping functions derive the caller from
   `get_user_role()`/`get_user_domain()`/`auth.uid()` inside the body.
3. **RPCs that do take scope params are not client-callable.** Migration 0102
   (`revoke_scope_param_rpcs`, 2026-06-11 — security-audit F-1, Option A) revokes `EXECUTE`
   from `authenticated`/`anon` on the Class B/C read RPCs; they are reachable only through the
   service-role path inside Server Actions, which pass session-derived values. This mirrors how
   `get_next_round_robin_agent` (0007) and `get_active_lead_by_phone` (0008) were always
   handled.
4. New aggregation RPCs follow the `get_group_task_summaries` pattern (self-enforcing WHERE) or
   ship with a REVOKE — never a third way.

## 11. Webhook ingress auth

Webhooks authenticate **before reading the body** (S-12): `/api/webhooks/leads` = Bearer token
(`PABBLY_WEBHOOK_SECRET`, timing-safe compare via `safeSecretCompare`); `/api/webhooks/whatsapp`
= `x-gupshup-secret` header (`GUPSHUP_WEBHOOK_SECRET`). Both rate-limited. Details:
`../integrations/lead-ingestion.md` and `../integrations/whatsapp-gupshup.md`.

## 12. Password reset — OTP-code session establishment (shipped 2026-06-13)

Password reset establishes a session via a **6-digit OTP code**, not a magic link. The three
actions in `src/lib/actions/auth.ts` run in sequence:

1. **`requestPasswordResetAction`** calls `supabase.auth.resetPasswordForEmail(email)` with **no
   `redirectTo`**. The recovery email renders `{{ .Token }}` — a 6-digit code, not a link. The
   request never reveals whether the account exists (S-09).
2. **`verifyResetOtpAction`** calls `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`.
   **This is where the session is established** — a valid code returns a recovery session.
   `form-errors.otpInvalid` is used for *both* invalid and expired codes (never reveal which).
3. **`updatePasswordAction`** calls `supabase.auth.updateUser({ password })` against that session.

The user lands on `/update-password?email=<email>` manually; the page gates only on the `?email`
param being present — there is **no session gate** on entry (the old `getUser()` recovery-session
check is gone, since the session does not yet exist until step 2). The flow is a two-step client
component: a code step, then a new-password step.

**Why OTP-code replaced magic-link:** corporate link-scanners (Google Safe Links and similar)
pre-fetch URLs in inbound email, which **burns the single-use recovery token before the user
clicks** — breaking magic-link reset for every protected mailbox. A 6-digit code carries no URL
to pre-fetch, so the token survives until the user enters it.

`/api/auth/callback` still exists but is **dead code for password reset** — only PKCE / magic-link
*invite* paths still route through it. Login is unchanged (`loginAction` → `signInWithPassword`
→ `is_active` deactivation gate).

Full UI spec (two-step form, `PasswordStrengthBar`, error copy): `../pages/auth.md`.
