# Auth & RBAC

> **Purpose:** how identity, sessions, roles, domains, concierge seats and row-level security work: the authorization architecture every other doc assumes, and one matrix of who can see and do what.
> **Audience:** engineers. · **Source-of-truth scope:** the authorization model, the session layer, route gating, the feature predicates, the queendom boundary at every layer, RLS and SECURITY DEFINER policy, service-to-service auth. The `profiles` table schema lives in `database.md`; each page's own gate lives in its `../pages/*.md`; Elaya's per-tool gates live in `../modules/elaya.md`.
> **Last verified:** 2026-09-26 against `src/proxy.ts`, `src/lib/supabase/middleware.ts`, `src/lib/services/profiles-service.ts` (`getCurrentProfile`), `src/lib/actions/_auth.ts`, `src/lib/actions/CLAUDE.md`, `src/lib/constants/{domains,roles,route-permissions,sia-roles,mcp}.ts`, `src/lib/utils/route-access.ts`, `src/lib/elaya/access.ts`, `src/lib/elaya/principal.ts`, `src/lib/elaya/elaya-data.ts` (`principalQueendom`, `seatedPrincipal`), `src/lib/services/sia-access.ts`, `src/lib/mcp/auth.ts`, `backend/app/brain/principal.py`, every `(dashboard)` page gate, the three webhook routes, the bridge and MCP routes, and migrations 0001, 0095, 0102, 0194, 0201, 0202 (members rename), 0210, 0211, 0221, 0233, 0242, 0243, 0244.

---

## 1. The core principle

Authorization reads from **one place only: `public.profiles`** (Rule A-01). Never from JWT
claims, never from session metadata, never from another table.

**Why:** claims go stale. A role changed in the database still rides the old token until it
expires. Reading `profiles` on every request makes a role change, a seat change or a deactivation
take effect on the next request.

**Identity is not authorization.** Since 2026-09-16 both the proxy and `getCurrentProfile()` call
`auth.getClaims()`, which verifies the token's signature locally (no round trip to the auth
server). That answers "who is this". The `profiles` SELECT that follows answers "what may they
do", and it is never skipped.

## 2. The SQL helpers

Every RLS policy reads the caller through these SECURITY DEFINER functions, never through a
direct join on `profiles` (RLS on `profiles` would block the helper's own read otherwise).

| Function | Returns | Since |
| --- | --- | --- |
| `get_user_role()` | the caller's `user_role` | 0001 |
| `get_user_domain()` | the caller's `app_domain` | 0001 |
| `get_user_queendom()` | the caller's `queendom_id` | 0194 |
| `can_access_member_queendom(p_queendom)` | admin/founder: any; a seated concierge teammate: their own; the active Joker head: any non-NULL queendom (0244). A NULL queendom is admin/founder only | 0194, renamed in the members rename, widened in 0244 |
| `member_visible(p_member_id)` | `can_access_member_queendom()` of that member's queendom. Every member-twin policy and every Sia ticket and intake policy leans on these two | members rename (0202, 2026-09-17) |
| `can_access_vendors()` | active admin/founder, or anyone in the concierge domain (0221) | 0221 |

- **Pinned `search_path`** on every one (A-10). After the schema restructure (0210/0211) the
  path is `public` plus the moved schemas (for example `public, gia, member`), because function
  bodies name tables without a schema.
- **The cast rule:** `get_user_domain()` returns the `app_domain` enum; comparing it to a `text`
  column needs `get_user_domain()::text` (Postgres never casts enum to text implicitly).
- **The InitPlan rule (0088, 0095):** inside policies the helpers are wrapped as scalar
  subqueries, `(SELECT get_user_role())`, so they run once per statement, not once per row.

## 3. Roles

Stored on `profiles.role` (`user_role` enum, 0001; `src/lib/constants/roles.ts`).

| Role | What it means |
| --- | --- |
| `founder` | Full access: every domain, every row, every action. Curated sidebar (`FOUNDER_NAV_PREFIXES`). |
| `admin` | Full access, full sidebar. |
| `manager` | Manages their domain. In concierge, the queen, bishop and Joker head seats are managers. |
| `agent` | Works inside their domain. In Gia, sees only their own assigned leads. In concierge, genies and jokers are agents. |
| `guest` | Reserved. No flow creates one; Elaya and the MCP connector refuse it outright. |

Admin and founder are separate roles even though both bypass domain checks: no single role may
both perform a sensitive action and audit it (S-15), and privileged changes should need a second
actor (S-16). Both are forward contracts; see `../rules/The_Rules.md`.

## 4. Domains

Nine domains in `src/lib/constants/domains.ts` (`APP_DOMAINS`): concierge, onboarding, finance,
marketing, tech, shop, business, house, legacy. Labels come from `DOMAIN_LABELS` only; every key
is the lowercase of its one-word label (`b2b` became `business` on 2026-09-16, migration 0202).

| List | Members | Used for |
| --- | --- | --- |
| `APP_DOMAINS` | all nine | profiles, user management, authorization |
| `GIA_DOMAINS` | onboarding, house, shop, legacy | Gia pickers, Gia dashboard widgets, the Gia route set |
| `ELAYA_DOMAINS` (`route-permissions.ts`) | concierge + the four Gia domains | who gets Elaya at all (§8) |
| `WORKBENCH_DOMAINS` (`route-permissions.ts`) | tech | the temporary tech workbench (§7) |

Never mix `APP_DOMAINS` and `GIA_DOMAINS` (Q-17). **One domain per user**: there is no grants
table and no multi-domain assignment.

## 5. Concierge seats and the queendom boundary

The concierge floor works in three queendoms (`sia.queendoms`: Anishqa, Ananyshree, Sanika).
A person's place on the floor is two columns on `profiles`, set beside the platform role:

| Column | Values | Rule |
| --- | --- | --- |
| `sia_role` | `queen`, `bishop`, `genie`, `joker`, `joker_head` | concierge domain only (0201 CHECK) |
| `queendom_id` | a `sia.queendoms` id | required for every seat except the Joker head, who never has one (0244 CHECK) |

- **Seats and platform roles** (`SIA_ROLE_PLATFORM_ROLE`): queen, bishop and Joker head are
  managers; genie and joker are agents. The account forms (`admin/RoleDomainFields.tsx`) derive
  the platform role from the seat and lock it.
- **How many:** one active queen and one active joker per queendom (0201 partial unique indexes,
  `SIA_SINGLE_SEATS`); bishops and genies are many (0242 dropped the one-bishop index); one active
  Joker head in the whole company (0244). Seat reads return `bishops[]` (`getQueendomSeats` in
  `queendom-seats.ts`, `getQueendomRoster` in `profiles-service.ts`).
- **The Joker head** (0244) has a queen's reach in every queendom, keyed on the seat, never on an
  empty `queendom_id` (every account outside concierge has an empty one). `isCompanyWideSeat()` in
  `constants/sia-roles.ts` is THE test; the SQL twin is the extra branch in
  `can_access_member_queendom()`. Limits: sees the vault list but cannot add or reveal
  (`canUseMemberVault`), sees no members' money (`canSeeMemberFinance`), gets no ticket alerts
  (alerts go to per-queendom seats).
- **An unseated concierge account sees nothing concierge.** No seat or no queendom means
  `getSiaViewerScope()` returns null (sent home from `/sia` and `/freshdesk`), RLS returns no
  members or tickets, and Elaya's member tools return nothing.
- **Nobody changes their own seat or queendom** (0243): `profiles_update` pins `sia_role` and
  `queendom_id` on the self branch, the way `role` and `domain` were already pinned. Seats change
  only through `updateAuthorization` (admin/founder) or the service role.

**One fact, every layer.** The boundary is `profiles.queendom_id` (plus the seat). Every layer
derives from it and re-reads it at request time:

| Layer | What enforces the queendom |
| --- | --- |
| Database (session reads) | `can_access_member_queendom()` / `member_visible()` in the RLS of the member tables, `sia.tickets` and intake proposals |
| Services on the admin client (no RLS to lean on) | `canAccessMember()` (`lib/elaya/access.ts`) before any member read or write; `getSiaViewerScope()` + `canViewSiaGroup()` + `pinnedFreshdeskGroup()` / `pinnedGroupFilter()` (`services/sia-access.ts`) before every Sia and Freshdesk read. A group's queendom is always read from the database (`wag_groups.member_id` → `members.queendom_id`), never taken from the browser |
| Pages | `/members`, `/tickets`, the board: the queendom filter only for admin, founder and the Joker head; `/sia` and `/freshdesk` ask `getSiaViewerScope()` |
| Elaya (both brains) | every member, group, Freshdesk and ticket tool re-reads the caller's seat from `profiles` at call time (`principalQueendom()` / `seatedPrincipal()` in `elaya-data.ts`); a name outside the seat answers "outside your seat" and nothing more |
| Routes and nav | the concierge route list (§7); the nav a seated teammate sees is Dashboard, Elaya, Members, Tasks, Vendors, Notes, Sia, Freshdesk |
| Alerts | the sentinel and intake pick recipients per queendom seat (`getQueendomSeats`) |

The 2026-09-25 and 2026-09-26 audits (changelog) tested this with real accounts and tool benches
on both brains.

## 6. The profiles foundation

Schema, trigger and audit-log details: `database.md`. What matters for authorization:

- **Rows are made only by the `on_auth_user_created` trigger** (`handle_new_user()`, last
  redefined in 0201). Every Serene account is created by `createStaffAccountCore()`
  (`staff-account-mutations.ts`, admin/founder actions and `scripts/admin/onboard-roster.ts`),
  which calls `auth.admin.createUser` with the role, domain, seat and queendom in the sign-up
  metadata; the trigger copies them. **This is safe only while public sign-up is off** on the live
  Supabase project, because the trigger trusts that metadata. Checked 2026-09-26: production's
  public auth settings report `disable_signup: true`, so sign-up is off today. The durable fix
  (the trigger taking the role from the admin action or `app_metadata`, never from user-typed
  metadata) is still open; see `../TODO.md`. The local `supabase/config.toml` still enables
  sign-up for development.
- **`role`, `domain`, `sia_role` and `queendom_id` are never self-editable** (`profiles_update`
  WITH CHECK; the last two since 0243). Only admin and founder change them, on the Authorization
  card.
- **Changes are instant** (RLS reads live) and never retroactive (existing assignments keep their
  assignee).
- **Deactivation** is `is_active = false`, never a delete (`profile_audit_log` is `ON DELETE
  RESTRICT`). Since 2026-09-16 `setProfileActive` also bans the user at the auth layer, so a
  deactivated session cannot refresh.
- **`profile_audit_log`** is append-only and records `role`, `domain`, `is_active`,
  `is_on_leave`, `full_name`, `email`, `username`. It does **not** record `sia_role` or
  `queendom_id` today (found 2026-09-26, open).

## 7. Route protection

Three independent layers (A-13); none trusts another.

| Layer | Where | What it does |
| --- | --- | --- |
| 1. Proxy | `src/proxy.ts` | Session refresh (`updateSession`, `getClaims`) on every matched request; bypasses `/api/webhooks`, `/api/manifest`, `/api/elaya/bridge`, `/api/mcp`, `/.well-known` (no cookie on those calls) |
| 2. Layout guard | `src/app/(dashboard)/layout.tsx` | No profile or `is_active = false` → `/login`; `canAccessRoute()` false → `/dashboard` |
| 3. Page gate | each page | the role or feature predicate for that page (below) |

Plus the nav filter: the Sidebar and the command palette list a link only when
`isNavVisible()` allows it. That is visibility, never authorization.

**There is no `src/middleware.ts`.** Next.js 16 uses the proxy; never recreate it.

### `canAccessRoute(profile, pathname)` (`utils/route-access.ts`, pure, client-safe)

1. Admin and founder: always true.
2. A workbench-domain member (tech, any role): true except `WORKBENCH_BLOCKED_PREFIXES`
   (`/books`).
3. `/elaya`: `hasElayaAccess(profile)` (it left the always-allowed list on 2026-09-26).
4. `ALWAYS_ALLOWED_PREFIXES`: `/dashboard`, `/profile`, `/helpdesk`, `/notes`.
5. `DOMAIN_ROUTE_MAP[profile.domain]`, prefix match.
6. Otherwise false.

| Domain | Route prefixes (`DOMAIN_ROUTE_MAP`) |
| --- | --- |
| onboarding, house, shop, legacy (Gia) | `/leads`, `/deals`, `/tasks`, `/performance`, `/oversight`, `/campaigns`, `/escalations`, `/budget`, `/whatsapp`, `/settings`, `/admin/elaya-training` |
| concierge | `/tasks`, `/members`, `/tickets`, `/sia`, `/freshdesk`, `/vendors` |
| finance | `/tasks`, `/subscriptions`, `/settings` |
| tech | `/tasks`, `/subscriptions`, `/settings` (the workbench rule reaches everything else) |
| marketing | `/tasks`, `/campaigns`, `/settings` |
| business | `/tasks`, `/leads`, `/deals`, `/campaigns`, `/settings` |

The map grants **reachability only**. The page's own gate is the authorization boundary: an agent
who reaches `/campaigns` or `/settings` is still sent away by the page's manager check.
`DOMAIN_NAV_HIDDEN` hides pages a domain can reach but should not see listed (concierge:
`/helpdesk`, `/tickets`). `FOUNDER_NAV_PREFIXES` is the founder's curated sidebar.

### Page gates (`utils/route-access.ts`)

- `hasElevatedPageAccess(profile)`: admin, founder, or the tech workbench. Used by the Team page,
  usage, suggestions, ad creatives, error log and the admin-only settings pages.
- `hasManagerPageAccess(profile)`: manager, or anyone above. Used by `/settings`, `/campaigns`,
  `/budget`, `/oversight`, `/admin/elaya-training`, `/settings/teach-elaya`.
- `/books` keeps a literal admin/founder check (the workbench must not see the company's money).
- **The workbench widens pages only.** Server actions keep `requireProfile(roles)` and RLS keeps
  scoping rows, so a tech agent can open `/vendors` or `/members` but cannot write there, and RLS
  returns no member rows to them.

The `/m` layer (`src/app/(client)/layout.tsx`) checks the session and `is_active` only; each room
and room action decides what a role gets (`../modules/mobile-ops.md`).

## 8. Feature predicates

One predicate per question, each with a documented home. Never re-inline a role list for these.

| Question | Predicate | Where | Also enforced by |
| --- | --- | --- | --- |
| May this person use Elaya at all? | `hasElayaAccess(profile)`: admin, founder, the tech workbench, then `ELAYA_DOMAINS`; never guest | `utils/route-access.ts` | the `/elaya` route, the floating button, the dashboard widget, `/api/elaya/chat` (403), the WhatsApp staff gate (one line back, the message is still swallowed), the MCP connector, `/m/elaya`, and the Python brain's `has_elaya_access` (`backend/app/brain/principal.py`, the mirror) |
| May this person open a Sia group or Freshdesk ticket? | `getSiaViewerScope(profile)` → `all` / `queendom` / null, then `canViewSiaGroup`, `pinnedFreshdeskGroup`, `pinnedGroupFilter` | `services/sia-access.ts` | every Sia read action; console, repair and mapping actions stay admin/founder; Freshdesk "Sync now" is admin/founder |
| May this person see this member? | `canAccessMember(principal, memberQueendomId)` | `lib/elaya/access.ts` | RLS `member_visible()`; every member action and Elaya member tool |
| May they see this member's money? | `canSeeMemberFinance(principal)`: everyone who can see the member, except the Joker head | `lib/elaya/access.ts` | the finance page, `get_member_finance`, the money part of `get_member_360`; `withoutMemberMoney()` strips figures from the member page on the server |
| May they add to or reveal from the vault? | `canUseMemberVault(principal)`: everyone who can see the member, except the Joker head (list only). Removing an item is admin/founder | `lib/elaya/access.ts` | vault actions; the vault table has no policy for signed-in users at all (admin client only) |
| May they open the vendor pages? | `hasVendorAccess(profile)`: admin, founder, the workbench, the whole concierge domain | `utils/route-access.ts` | the three `/vendors` pages |
| May they write vendors? | `hasVendorActionAccess(profile)`: the same minus the workbench. Pausing or blacklisting (`setVendorStatusAction`), merging and removing stay admin/founder | `utils/route-access.ts` | `requireVendorAccess()` in every vendor action; SQL mirror `can_access_vendors()` (0221) on the vendor SELECT policies and the invoice bucket |
| May this Gia principal see this lead? | `canAccessLead(principal, lead)`: admin/founder all, manager own domain, agent own assigned | `lib/elaya/access.ts` | RLS on `gia.leads`; the leads actions' own `hasAccess` check |
| May they manage subscriptions? | `canManageSubscriptions`: admin, founder, finance, tech | `actions/subscriptions.ts` | RLS SELECT on the subscription tables (same audience) |
| May they use the MCP connector? | `verifyMcpBearer`: the role is in the `mcp_audience` settings row (0233; seeded to every role but guest; `MCP_ROLES` = founder + admin is the fallback when the row is broken) **and** `hasElayaAccess` | `lib/mcp/auth.ts` | each tool's own gate inside the registry |

## 9. Who can see and do what

Rows are areas; columns are kinds of person. "Page only" means the page opens but writes are
refused and RLS decides rows. For exact per-page rules follow the page doc.

| Area | Admin / founder | Tech (workbench, any role) | Gia manager | Gia agent | Concierge seat (queen, bishop, genie, joker) | Joker head | Finance / marketing / business |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard, tasks, notes, profile | yes | yes | yes | yes | yes (My Tasks + Elaya widgets) | yes | yes (the My Tasks widget; Elaya is off) |
| Leads, deals, escalations, sales WhatsApp | all | page only | own domain | own assigned | no | no | business reaches `/leads` and `/deals` (rows by RLS) |
| Campaigns, budget, oversight, performance drill | all (recharge ledger admin/founder) | page only | own domain | no (performance: own) | no | no | marketing and business reach `/campaigns`; the page wants a manager |
| Members and member notes | all | page only (no rows) | no | no | own queendom | every queendom | no |
| Member money (finance page, Elaya) | yes | no rows | no | no | own queendom | no | no |
| Member vault | list, add, reveal, remove | no rows | no | no | list, add, reveal (own queendom) | list only | no |
| Tickets and the board | all | page only (no rows) | no | no | own queendom (`/tickets` reachable, not listed) | every queendom | no |
| Sia (`/sia`) | every group + console | every group (console actions refused) | no | no | own queendom's member groups, read only | every queendom's member groups; no internal or unlinked groups, no console | no |
| Freshdesk (`/freshdesk`) | all groups + Sync now | all groups | no | no | own queendom's group | the queendoms' groups | no |
| Vendors | all, incl. pause, merge, remove | page only | no | no | read, add, note, review, verify | same as a seat | no |
| Subscriptions | yes | yes (manage) | no | no | no | no | finance: yes (manage) |
| Books (`/books`) | yes | no | no | no | no | no | no |
| Elaya (all channels) | yes, incl. the analyst tools | yes | yes | yes | yes, scoped to the seat | yes, scoped to the seat | no |
| MCP connector | yes | yes | yes | yes | yes | yes | no (Elaya is off) |
| Team page (`/admin/users`) | view and change accounts, seats, roles | view only | no | no | no | no | no |
| Settings (`/settings`) | all sub-pages | page only | the hub, Teach Elaya | no | no (not in the concierge map) | no | managers reach the hub |
| Change own role, domain, seat, queendom | no one changes their own; admin/founder change others' | no | no | no | no | no | no |

Notes: an **unseated concierge account** has the concierge routes and Elaya but sees no members,
tickets, Sia groups or Freshdesk tickets; it can use the vendor pages (the vendor audience is the
domain, not the seat). A **guest** reaches only the always-allowed pages and never gets Elaya or
the MCP connector. The founders' Elaya tools (`describe_database`, `query_database`,
`start_deep_read`, `get_live_pulse`, `get_books_overview`, `get_budget`) are admin/founder only
in both brains (`../modules/elaya-analyst.md`).

## 10. Two-layer security and `requireProfile()`

RLS enforces at the database **and** every server action enforces in code (A-09). Neither layer
trusts the other. Where a surface reads through the admin client (Sia `wag_*` tables, the
`freshdesk` schema, the member vault, every Elaya read), there is no RLS to lean on and the code
gate in §8 is the boundary; the tables stay deny-by-default for signed-in users.

The action-layer gate is `requireProfile(roles?)` in `src/lib/actions/_auth.ts` (A-18). It
returns `{ ok: true, profile }` or `{ ok: false, result }`, where `result` is a ready
`{ data: null, error: formErrors.unauthorized }` (no session and wrong role give the same copy,
S-09). Per-resource checks (`canAccessMember`, `canMutateTask`, lead `hasAccess`, the vendor
audience) come after it. `actorFromProfile(profile)` in the same file maps the caller onto the
`MutationActor` every mutation core takes.

Documented exceptions (`src/lib/actions/CLAUDE.md`): `sla.ts` (Trigger.dev, no session),
`loginAction` (reads the profile for the `is_active` check), and **three** `tasks.ts` actions
(`updateTaskStatusAction`, `updateTaskAction`, `updateChecklistAction`) that fetch the profile and
the task in one `Promise.all`.

## 11. RLS philosophy

- Every table has RLS enabled in its creation migration (A-08).
- Append-only tables (activity logs, notes, remarks, audit logs, `lead_raw_payloads`,
  `elaya_messages`, `task_events`, `usage_heartbeats`, the Elaya query and MCP call logs, the
  ticket draft reviews, and more) have no UPDATE or DELETE policy (A-11). The documented
  exceptions are listed on the A-11 rule row and in the Decision Log (`../rules/The_Rules.md`).
- Archived leads cannot be updated directly (`leads_update` requires `archived_at IS NULL`,
  0091/0103).
- Some tables have **no** user write policy by design: `deals` (admin-client writes in the deal
  cores, 0094), `lead_sla_timers`, the Sia `wag_*` tables and the `freshdesk` schema
  (service-role only), the member vault (no policy for signed-in users at all), and
  `elaya_settings` writes (service role).
- `elaya_read` is reachable only as the login-less role `elaya_reader`, inside
  `elaya_run_query()`, in a read-only transaction (0223, `../modules/elaya-analyst.md`).

## 12. SECURITY DEFINER policy

SECURITY DEFINER functions run as their owner and bypass RLS. The standing rules:

1. **A pinned `search_path`** on every one (A-10): `public`, widened with `gia` and `member`
   since 0210/0211 so bare table names resolve after the move.
2. **Never trust a caller-supplied scope parameter** (`p_role`, `p_domain`, `p_user_id`) for an
   access decision (Q-13). Self-scoped functions derive the caller from `auth.uid()` and the
   helpers.
3. **RPCs that take scope parameters are not callable by `authenticated`** (0102, security audit
   F-1): EXECUTE is revoked and they run only on the admin client with session-derived arguments
   (`callAdminRpc` in `rpc-helpers.ts`). The pattern recurs in 0123, 0128, 0144 (which also clamps
   `p_caller_domain` in SQL), 0149 (the Elaya sessionless twins) and later RPCs.
4. New aggregation RPCs are either self-enforcing (the `get_group_task_summaries` pattern) or ship
   with the REVOKE. There is no third way.

## 13. Outside callers: webhooks, the bridge, the MCP connector, Trigger.dev

| Caller | Route | Credential | Notes |
| --- | --- | --- | --- |
| Pabbly, website, shop app | `/api/webhooks/leads` | Bearer, one secret per sender (`PABBLY_WEBHOOK_SECRET`, `SHOP_APP_WEBHOOK_SECRET`), timing-safe | Rate limit first. The raw payload is logged **before** the bearer check (so an auth failure is still recorded), which departs from S-12's "reject before reading the body" (TODO: verify this is the intended posture; no Decision Log row covers it) |
| Gupshup | `/api/webhooks/whatsapp` | `x-gupshup-secret` header, timing-safe | Returns 200 on auth-pass-but-bad-payload so the sender does not retry |
| Freshdesk | `/api/webhooks/freshdesk` | `x-freshdesk-webhook-secret` header | Stores the event, acks, re-reads the ticket in `after()` |
| The Python brain | `/api/elaya/bridge` | `BRAIN_API_SECRET` bearer, timing-safe, fail-closed | Every op re-resolves the principal from `profiles` on the admin client before anything runs |
| Outside AI apps | `/api/mcp` | Supabase OAuth server access token → `auth.getUser` → `profiles` | Consent at `/oauth/consent`; connected apps listed and revocable on `/profile`; per-user rate limit; every call logged (`mcp_tool_calls`, 0226) |
| Trigger.dev tasks | none (they run code directly) | the service role | No session exists; they use the admin client and gate on settings rows |

Details: `../integrations/lead-ingestion.md`, `../integrations/whatsapp-gupshup.md`,
`../integrations/freshdesk.md`, `../integrations/mcp.md`, `../integrations/trigger-dev.md`.

## 14. Password reset: OTP-code session (shipped 2026-06-13)

Password reset establishes a session with a **6-digit code**, not a magic link. The three
actions in `src/lib/actions/auth.ts` run in order:

1. **`requestPasswordResetAction`** calls `resetPasswordForEmail(email)` with no `redirectTo`.
   The recovery email renders `{{ .Token }}`. The request never reveals whether the account
   exists (S-09).
2. **`verifyResetOtpAction`** calls `verifyOtp({ email, token, type: 'recovery' })`. This is where
   the session starts. `formErrors.otpInvalid` covers both invalid and expired codes.
3. **`updatePasswordAction`** calls `updateUser({ password })` on that session.

`/update-password?email=` gates only on the param; there is no session gate on entry, because the
session only exists after step 2. **Why a code:** corporate link scanners pre-fetch URLs in
email and burn a single-use recovery link before the person clicks. A code has no URL to fetch.

`/api/auth/callback` is a legacy route kept only for old links: the reset uses a code, and invites
land on the client page `/auth/callback` (`inviteUser` sets `redirectTo …/auth/callback?next=/update-password`).
Login is
`loginAction` → `signInWithPassword` → the `is_active` check. UI: `../pages/auth.md`.

## 15. The Elaya principal: sessionless authorization

Elaya answers on three channels: in-app (a session), WhatsApp (a phone number, no session) and the
MCP connector (an OAuth token). Two brains serve them: the frozen Node loop and the Python brain
(`backend/`). Every path resolves the same **principal** before the model runs:
`resolveStaffPrincipal(profile)` in `src/lib/elaya/principal.ts` (in-app: the session profile;
WhatsApp: `getActiveProfileByPhone()`; MCP: the token's profile) and its Python mirror in
`backend/app/brain/principal.py`. The principal carries `{ userId, role, domain, siaRole,
queendomId, displayName, toolset }`, with the toolset taken from `TOOLSET_BY_ROLE`. Every door
asks `hasElayaAccess` before a principal is used (the chat route, the WhatsApp gate, the MCP
`allowed` flag), and the Python resolver returns no principal at all when it fails.

**The Golden Rule:** permissions are enforced in code and are independent of persona, memory,
notes, playbooks and anything a model or user writes. The toolset is fixed from the verified
role before the model runs; per-resource gates (`canAccessLead`, `canAccessMember`,
`getSiaViewerScope`, the seat re-read) decide rows at call time. Injected text can never widen
access.

**Why the admin client.** RLS needs `auth.uid()`, which is null on WhatsApp, on the bridge and on
the MCP path. So every Elaya read goes through `elaya-data.ts`: it takes the principal, uses the
admin client, scopes in code with the predicates above, and passes every result through
`maskPii()`. The decision moves from RLS into code, with a verified principal and never a
model-supplied argument. (The 2026-09-26 audit fixed three reads that still used the session
client and so returned nothing or the wrong thing off-session.)

**Sessionless RPC twins (0149).** Three reads that derived scope from `auth.uid()` inside SQL have
explicit-parameter twins on the revoked tier, called only by the Elaya data layer.

**The customer principal** (`resolveCustomerPrincipal`, 2026-06-26) wraps a lead, never a
profile, and carries the hard-capped two-tool customer toolset. Contract:
`../modules/customer-welcome-blast.md`.

## 16. Open items

- Migrations 0242, 0243 and 0244 are applied on production (checked with
  `supabase migration list --linked` on 2026-09-26). Their changelog entries, written earlier the
  same day, still say "not applied yet".
- Seat changes are not written to `profile_audit_log` (§6).
- **Group linking trusts the group id.** `linkMemberGroupAction` and `unlinkMemberGroupAction`
  (`actions/members.ts`) check only `canAccessMember` on the member. They do not check the
  caller's role, or which queendom the WhatsApp group belongs to. The screen that shows the link
  control (`MemberWhatsAppCard`, `canLink`) is admin/founder only, but the actions are not, so a
  seated teammate calling the action directly could attach another queendom's group to one of
  their own members, or unlink a group by id. Open, not fixed.
- **The workbench sees buttons it cannot use.** The tech workbench gets `scope.kind === "all"`, so
  `/sia` renders the console controls (`canManage`), `/freshdesk` renders "Sync now", and the
  vendor page renders Merge and Remove (`hasElevatedPageAccess`); it can also open the Teach Elaya
  pages. The actions behind them are admin/founder only, so the clicks and saves fail with
  "unauthorized". Harmless, but confusing.
- **One Elaya action skips the door check.** `getElayaChatSeedAction` (`actions/elaya.ts`) calls
  `requireProfile()` but not `hasElayaAccess`. It only returns the caller's own conversation seed,
  so nothing leaks, but it is the one Elaya entry point without the predicate.
- **Elaya training writes are not pinned to the manager's domain.** `upsertTrainingAsset` and the
  delete action (`actions/elaya-training.ts`) allow any manager, admin or founder and take the
  `domain` from the form, writing with the admin client. A manager could write another domain's
  customer-training material, although the Teach Elaya hub says managers curate their own domain.
- `/notes` stays open to every role and domain, including the teams Elaya is off for. Notes are
  context Elaya reads, never permission, so for those teams it is simply a notes page.
- Decisions surfaced by the 2026-09-25/26 audits, left as they are by the founder: two
  concierge-domain accounts hold the `founder` role; `find_teammate` is a company-wide directory;
  a vendor's job history carries member names from every queendom.
- Public sign-up must stay off on the live project (§6, TODO above).
