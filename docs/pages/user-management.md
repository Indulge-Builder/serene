# Team (User Management): Page Spec

> **Purpose:** spec for the Team pages, `/admin/users` (the team list with the Queendoms and Domains rosters), `/admin/users/new` (create an account) and `/admin/users/[id]` (one teammate), over the `profiles` foundation.
> **Audience:** engineers. · **Source-of-truth scope:** the three `/admin/users` routes, `profiles-service.ts`, `staff-account-mutations.ts`, `actions/profiles.ts`, the Team components in `src/components/admin/`, the roster onboarding script, and the deep operational detail of the `profiles` data model (seats included). Authorization *architecture* (roles × domains, route gates, RLS philosophy): `../architecture/auth-and-rbac.md`. What a seat can see inside the concierge module: `../modules/members.md` and `../modules/sia.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/admin/users/**`, `src/components/admin/*`, `src/lib/services/profiles-service.ts`, `src/lib/services/staff-account-mutations.ts`, `src/lib/services/sia-staff-link.ts`, `src/lib/actions/profiles.ts`, `src/lib/validations/profile-schema.ts`, `src/lib/constants/sia-roles.ts`, `src/lib/utils/route-access.ts`, `scripts/admin/onboard-roster.ts`, and migrations 0001, 0095, 0124, 0125, 0194, 0201, 0210, 0242, 0243, 0244.

## 1. Purpose

The Team pages are where people get a Serene account and a place in the company. Admin and
founder use them to:

- see the whole team at a glance: who holds which concierge seat in each queendom (the
  Queendoms card) and who sits in which domain (the Domains card);
- find a teammate in the list (search, role and domain filters that live in the URL);
- create an account (a temporary password, or an email invite link);
- change a teammate's profile fields, their domain, platform role, concierge seat and
  queendom, switch the account off (soft, never deleted), and turn lead routing on or off;
- see which WhatsApp contact belongs to a teammate (linked by phone) and what Elaya has
  learned about them.

The page is labelled "Team." on screen and "User Management" in the sidebar.

## 2. Who sees it

| Route | admin / founder | tech workbench (agent or manager) | manager (outside tech) | agent / guest |
| ----- | --------------- | ------------------------- | ---------------------- | ------------- |
| `/admin/users` | full | page opens; writes refused | redirected | redirected |
| `/admin/users/new` | full | page opens; create refused | redirected | redirected |
| `/admin/users/[id]` | full | page opens, no Authorization or memory card | redirected (see note) | redirected |

- The list and create pages gate with `hasElevatedPageAccess` (admin, founder, or any member
  of a workbench domain, today `tech`). The detail page gates with `hasManagerPageAccess`.
- **Note (contradiction with the page's own gate):** `/admin/users` is in no domain's
  `DOMAIN_ROUTE_MAP` entry, so the dashboard layout's `canAccessRoute` guard sends every
  non-admin, non-founder, non-workbench caller to `/dashboard` before the page runs. A Gia
  manager therefore cannot open `/admin/users/[id]`, even though the page itself would admit
  them. The manager branches in the detail page (profile form, routing toggle) only run for a
  tech manager today. A manager edits routing and shifts on `/settings` instead
  (`./settings.md`).
- The tech workbench widens page access only. Every write goes through an action that calls
  `requireProfile(['admin','founder'])` (or `ROLES_CAN_CREATE_USER`, the same pair), so a tech
  account sees the pages but its saves come back "unauthorized".
- Sidebar: "User Management" (`Shield` icon) in the `ADMIN_NAV` section of
  `src/components/layout/Sidebar.tsx`, listed through `isNavVisible`. The founder's curated
  sidebar (`FOUNDER_NAV_PREFIXES`) does not list it; founders reach it by URL or the command
  palette.

Full action matrix: Deep dive §8.10.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Services | `profiles-service.ts`: `getAllProfiles` (the list), `getProfileById`, `getCurrentProfile`, `getQueendomRoster` (seats per queendom, derived from profiles), `updateProfileFields`, `updateAuthorization` (role + domain + seat together), `setProfileActive` (row flip + auth ban), `isUsernameTaken`, `getAssignableUsers`. `staff-account-mutations.ts`: `createStaffAccountCore`, `fillStaffContactCore`, `classifyAuthAdminError`. `sia-staff-link.ts`: `getStaffWhatsAppLinks`, `linkStaffContactsByPhone`. `elaya-memory-service.ts`: `listUserMemoryForPage`. `agent-routing-service.ts`: `getAgentRoutingConfig`. `members-service.ts`: `getQueendoms` |
| Actions | `actions/profiles.ts`: `createUser`, `inviteUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive`, `updateProfileAvatar`, `getAssignableUsersAction`, `signOutUser`. `actions/agent-routing.ts`: `toggleAgentRouting`. `actions/sia-staff-link.ts`: `linkStaffWhatsAppNowAction`. `actions/elaya-memory.ts`: add / retire memory entries |
| Validation | `validations/profile-schema.ts` (create, invite, update, authorization, toggle, avatar; the shared `checkPosition` seat rules) |
| Tables | `public.profiles`, `public.profile_audit_log`, `gia.agent_routing_config` (moved to the `gia` schema by 0210), `sia.queendoms`, `sia.wag_contacts` (the WhatsApp link), `elaya_user_memory`. Narrative in `../architecture/database.md`; deep detail in Deep dive §8.7 |
| Jobs | `src/trigger/sia-staff-link.ts`: links WhatsApp contacts to accounts by phone every 15 minutes |
| Script | `scripts/admin/onboard-roster.ts`: the roster sheet to accounts, through the same core as the Create form (Deep dive §8.3) |

## 4. Components

| Component | Where | Role |
| --------- | ----- | ---- |
| `QueendomRosterCard` | list page | Seats per queendom: the Joker head line above the tiles, then per queendom Queen, Bishops · N, Joker, Genies · N. An empty seat says "Empty seat" |
| `DomainRosterCard` | list page | The whole team by domain: one tile per staffed domain (domain icon in its `DOMAIN_LINE_COLORS` colour, head count), people grouped by platform role, a concierge seat as a tag; empty domains named in one line |
| `Roster.tsx` (`RosterGrid`, `RosterTile`, `RosterGroup`, `RosterEmpty`) | both roster cards | THE roster anatomy: tiles, labelled groups, person chips that open the user page (On leave / inactive tags, inactive people last) |
| `UsersTable` | list page | The filterable card list (`FilterBar`, role and domain `FormSelect`s, search on name, email and job title); one `motion.div` card per person with role pill, seat pill, status dot and an Edit link |
| `NewUserClient` + `CreateUserForm` | `/new` | Password or invite mode (`TabSelector`), the form on the left, mode tips on the right |
| `RoleDomainFields` | Create, Invite, Edit Authorization | THE domain → role or position → queendom field group (Deep dive §8.2) |
| `EditProfileForm` | detail | Name, job title, phone, username |
| `EditAuthorizationForm` | detail, admin/founder only | `RoleDomainFields` + a warning that changes apply at once |
| `StaffWhatsAppCard` + `LinkNowButton` | detail | The WhatsApp contacts linked to this account by phone; "Link now" for admin/founder |
| `ElayaMemoryCard` (from `components/profile/`) | detail, admin/founder only | "What Elaya has learned about them" (Deep dive §8.6) |
| `UserStatusControls` | detail, inside the Identity card | Account active toggle (admin/founder) and the lead routing toggle (agents only) |

All detail sections compose `SectionCard`; the detail and new pages carry a `BackButton`. Both
contracts live in `src/components/CLAUDE.md`.

## 5. States

- **Loading:** each route has its own `loading.tsx` (`admin/users`, `admin/users/new`,
  `admin/users/[id]`), each in the page's own shape.
- **Empty:** `UsersTable` renders `<EmptyState>` with the `Shield` icon: "No team members
  yet." or "No members match your filters." The roster cards render nothing when there is no
  queendom or no staffed domain. `StaffWhatsAppCard` has two inline empties: "No phone on this
  account yet." and "Not seen in the groups yet."
- **Error:** form errors come from `form-errors.ts`, never raw Zod or Auth text. Fields are
  never cleared on error. A duplicate email and a taken seat get their own messages
  (`classifyAuthAdminError`, Deep dive §8.3); any other failure is logged with its code and
  shown as the generic message.

## 6. Invariants

Deep dive §8.12. The short list: a `profiles` row is created only by the signup trigger;
nobody changes their own role, domain, seat or queendom (the `profiles_update` WITH CHECK,
0243); a queendom has one active queen and one active joker, bishops and genies are many, and
the company has one active Joker head; a position always derives its platform role; accounts
are deactivated, never deleted; every account is created through `createStaffAccountCore`.

## 7. Open items

- **Seat changes are not audited.** `log_profile_changes()` records role, domain, is_active,
  is_on_leave, full_name, username and email only. `sia_role` and `queendom_id` changes leave
  no row in `profile_audit_log`, though the Authorization card says "All changes are audited."
- **Manager access to the detail page** is blocked by the layout guard (§2). Either add
  `/admin/users` to the Gia route map (and accept that managers see a teammate's page) or
  change the page gate to match; today the code disagrees with itself.
- **Routing toggle for managers.** Managers have been in the routing pool since 0124, but the
  detail page loads the routing config only for `role === 'agent'`, so a manager's pool
  switch lives on `/settings` only.
- **Blank staff phones.** A staff account with no `profiles.phone` cannot be matched when it
  messages the WhatsApp number, so its message becomes a lead (Deep dive §8.5). The invite form
  has no phone field, so every invited account starts with a blank phone. The Team page is where
  the phone gets filled.
- **Roster placements left open** after the 2026-09-26 onboarding run: the four Jokers'
  queendoms, two people parked in `business`, and a queen seat held by a bench account
  (changelog 2026-09-26).
- `last_seen_at` exists on `profiles` but nothing writes it.
- The avatar action checks only that `avatar_url` is a URL, not that it points at the
  `avatars` bucket.

---

## 8. Deep dive

### 8.1 The three pages

**`/admin/users` (list).** `page.tsx` gates with `hasElevatedPageAccess`, then loads
`getAllProfiles()`, `getQueendomRoster()` and the search params in one `Promise.all`. It
renders:

1. The title row: "Team." (with the page-title dot), an "Add Member" accent link to
   `/admin/users/new`, and the `PageControls` bell.
2. `QueendomRosterCard` (with the active Joker head, or the latest one if none is active).
3. `DomainRosterCard`.
4. `UsersTable`.

The page rebuilds the current query string and passes it to both roster cards as `from`, so a
person chip opens `/admin/users/[id]?from=<this view>`.

**`UsersTable`.** Filters live in the URL through `useUrlFilters` and
`useMultiSelectUrlParam` (keys `search`, `role`, `domain`), and the list still filters on the
client instantly from the full `users` prop. The server renders the page already filtered, so
there is no flash of the full list. Each card's Edit link carries `?from=` with the view on
screen. Filtering and search are client-side on purpose: the team is small and one read loads
it all.

**`/admin/users/new`.** Gates with `hasElevatedPageAccess`, loads `getQueendoms()`, and
renders `NewUserClient`. The client component owns the mode (`password` or `invite`) because
the mode drives both the form on the left and the tips panel on the right. On success the form
routes back to `/admin/users`.

**`/admin/users/[id]`.** Gates with `hasManagerPageAccess` (but see §2), then loads the
caller and the user, the WhatsApp links and the Elaya memory, and (for an agent being viewed
by manager+) the routing config, and (for admin/founder) the queendom list. Layout:
`serene-dossier-grid--340`, forms on the left, a sticky Identity card on the right.

- Header: `BackButton` to `?from=` when it starts with `/admin/users` (only a Team path is
  accepted, and Next has already decoded it), otherwise to `/admin/users`; the person's name
  as the title.
- Left: Profile Details (`EditProfileForm`), Authorization (admin/founder), WhatsApp
  (`StaffWhatsAppCard`), "What Elaya has learned about them" (admin/founder).
- Right: Identity (avatar, name, email, job title, role pill, domain pill, and a seat pill
  "Queen · Anishqa's Queendom" when seated), with `UserStatusControls` under a hairline.

### 8.2 Domain, role, position, queendom

Every account-shaping form composes `RoleDomainFields` and posts exactly four fields: `role`,
`domain`, `sia_role`, `queendom_id`.

1. **Domain first.** It decides what the Role select offers.
2. **A domain with positions** (today only `concierge`, from `DOMAIN_POSITIONS` in
   `constants/sia-roles.ts`) lists the positions, plus "access only" platform roles for an
   admin or founder who sits in concierge without a seat. Picking a position **derives and
   locks** the platform role through `SIA_ROLE_PLATFORM_ROLE`, so a genie can never be made a
   manager by accident.
3. **A queendom select** appears with a position, except for the Joker head, who has none.
4. **A domain without positions** shows the plain platform-role select; the seat fields stay
   blank.

| Position (`sia_role`) | Platform role | Queendom | Holders |
| --------------------- | ------------- | -------- | ------- |
| `queen` | manager | required | one active per queendom (0201 index) |
| `bishop` | manager | required | many (0242 dropped the one-bishop index) |
| `genie` | agent | required | many |
| `joker` | agent | required | one active per queendom (0201 index) |
| `joker_head` | manager | none, ever | one active in the whole company (0244 index) |

The Joker head (0244) has a queen's reach in every queendom: members, WhatsApp groups and
tickets. The app holds back three things: the vault shows as a list only (no add, no reveal),
no member money, no ticket alerts. It is manager so the head can hand tasks to jokers. The
reach test is `isCompanyWideSeat(p)`, keyed on the seat in the concierge domain, never on an
empty queendom (every account outside concierge has one). What each seat sees:
`../modules/members.md` and `../modules/sia.md`.

The Zod schemas (`createUserSchema`, `inviteUserSchema`, `updateAuthorizationSchema`) share one
rule set, `checkPosition`: a position only in a domain that has positions, a queendom with every
position that needs one, and the platform role equal to the one the position maps to. A stale
queendom pick left on the form for a Joker head is dropped, not refused
(`dropQueendomForCompanyWideSeat`). The database mirrors the same rules (Deep dive §8.7).

The Queendoms card is the one place to see who holds a seat. Seat holders are derived from
`profiles` (the `queen_id` / `bishop_id` / `joker_id` columns on `sia.queendoms` were dropped by
0201), read by `getQueendomRoster()` for this page and `getQueendomSeats()`
(`queendom-seats.ts`) for sessionless callers such as the ticket sentinel.

### 8.3 Creating an account

**The core.** `createStaffAccountCore(input)` in `src/lib/services/staff-account-mutations.ts`
is THE body of "create a Serene account". The Create form and the roster script both call it.
It has no `server-only` chain, so a laptop script can run it.

1. **Seat pre-check.** If the position is a single seat (`SIA_SINGLE_SEATS` = queen, joker)
   and `getQueendomSeats` shows an active holder, it refuses with `seat_taken` before calling
   Auth.
2. **`auth.admin.createUser`** with `email_confirm: true` and `user_metadata` carrying
   `full_name`, `role`, `domain`, `job_title`, `phone`, `sia_role`, `queendom_id`. The signup
   trigger (§8.7) writes the profile in the same transaction.
3. **Contact follow-up.** The trigger does not copy `phone`, so `fillStaffContactCore` writes
   phone and job title through the admin client.

**Reading an Auth error.** `classifyAuthAdminError()` is the one reading of a Supabase Auth
admin error:

| Result | Matched by | Copy on screen |
| ------ | ---------- | -------------- |
| `email_exists` | code `email_exists`, or text with "already" and "registered" | the email is taken |
| `seat_taken` | an error text naming an `idx_profiles_one_` index | "That seat already has an active holder." |
| `db` | code `unexpected_failure` or "database error" | generic |
| `unknown` | anything else | generic |

This fixed the 2026-09-26 bug where every create showed "Something went wrong": Auth says
"has already been registered", and the old matcher looked for "already registered".

**The `createUser` action.** Zod (`createUserSchema`) → `requireProfile(ROLES_CAN_CREATE_USER)`
(admin, founder) → `sanitizeText` on name and job title, `normalizeToE164(phone, 'IN')` → the
core → `revalidatePath('/admin/users')`. Returns `{ data: { id } }`.

**The `inviteUser` action.** Zod (`inviteUserSchema`) → the same role gate → sanitize →
`auth.admin.inviteUserByEmail(email, { data: { full_name, role, domain, job_title, sia_role,
queendom_id }, redirectTo: <site>/auth/callback?next=/update-password })`. Errors go through
the same classifier. There is no seat pre-check on this path; a taken single seat comes back
from the trigger's unique index and is classified as `seat_taken`. Invite mode has no password
and no phone field. The auth user (and so the profile) is created when the invite is sent; the
invitee sets a password on first sign-in (`./auth.md`).

**The roster script.** `scripts/admin/onboard-roster.ts` reads the founder's roster sheet (Name
/ Department / Mobile, kept in the git-ignored `cleint-data/` folder) and creates one account
per person through `createStaffAccountCore`. Dry run by default, `--apply` writes, idempotent.
Rules it applies: a "(name)'s Queendom" row is concierge (the named queen takes the queen seat as
a manager, everyone else is a genie); the other departments map to their domains as agents
(HR and Partnerships land in `business`, flagged); Jokers are concierge agents without a seat
until their queendom is known; email is the first name `@indulge.global` (first and last name on
a clash); one temporary password, changed on `/profile`. A phone match counts as the same person
only when the name agrees too. It never re-roles an existing account and only fills a blank
phone. First run 2026-09-26: 43 created, 3 phones filled, 19 already on Serene.

### 8.4 Editing an account

| Action | Who | What it writes |
| ------ | --- | -------------- |
| `updateProfile` | self, or admin/founder for anyone | `full_name`, `username` (uniqueness pre-checked), `job_title`, `phone` (E.164), `theme`, `app_icon`, `appearance`, `timezone`. Never role, domain, seat or avatar. Revalidates `/profile`, `/admin/users`, `/admin/users/[id]` |
| `updateUserAuthorization` | admin/founder | `role`, `domain`, `sia_role`, `queendom_id` in one update (`updateAuthorization`). Leaving concierge clears the seat. A 23505 from a seat index maps to `formErrors.seatTaken` |
| `toggleUserActive` | admin/founder | `is_active` via `setProfileActive` (below). Single-argument `(formData)` shape: it is called from a transition in `UserStatusControls`, not bound to a form |
| `toggleAgentRouting` | manager (own domain), admin, founder | `gia.agent_routing_config.is_active` (`./settings.md`) |
| `updateProfileAvatar` | self, or admin/founder | `avatar_url` only (upload happens in the browser on `/profile`) |

**Deactivation has two layers** (`setProfileActive`, 2026-09-16). The row flip is the kill
switch: every request re-reads the profile, so a deactivated person is sent to `/login` on
their next navigation. Then the admin client bans the auth user (`ban_duration` 100 years; `none`
on reactivation), so the session cannot refresh and a fresh login is refused. The ban is
best-effort and logged on failure; the row flip is the guarantee.

A manager viewing the page (a tech manager, in practice) sees `EditProfileForm`, but
`updateProfile` refuses anything but their own row and RLS agrees.

### 8.5 The WhatsApp link, and why the phone matters

The company rule: every employee gets a company phone and an email. The phone joins the
WhatsApp groups; the email signs in to Serene. `linkStaffContactsByPhone()`
(`src/lib/services/sia-staff-link.ts`) ties the two:

- every `sia.wag_contacts` row whose phone equals an active profile's phone (both sides
  compared in E.164) gets `staff_profile_id` and the position from the profile (`sia_role`, or
  `founder`); hidden-id (`@lid`) rows link through the pairing the connector keeps;
- a link whose account is gone or deactivated is cleared, so the number can pass to the next
  hire;
- it runs every 15 minutes (`src/trigger/sia-staff-link.ts`) and on demand from the user
  page's "Link now" (`linkStaffWhatsAppNowAction`, admin/founder).

`StaffWhatsAppCard` lists the linked contacts (WhatsApp name, position, how many groups, last
seen).

**A blank phone breaks the Elaya WhatsApp gate.** When staff message the business WhatsApp
number, `getActiveProfileByPhone()` matches the sender to an active profile by phone (exact,
then canonical digits). No phone on the profile means no match, and the message falls through to
the lead pipeline, so the teammate becomes a lead. Fill the company phone when creating the
account. Full gate: `./whatsapp.md` §8.7.

### 8.6 What Elaya has learned

Admin and founder see the teammate's living memory (0237) on the detail page: one entry per
thing Elaya learned about how this person wants things (rule, correction, style, preference,
interest, fact), with remove and add. The same card sits on `/profile` for the owner. The
memory model, the after-turn reader and the prompt fold live in `../modules/elaya.md`.

### 8.7 Data model

#### `public.profiles`

Created by `20260526000001_profiles.sql`; later columns by the migration named.

| Column | Type | Null | Default | Notes |
| ------ | ---- | ---- | ------- | ----- |
| `id` | uuid | no | | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | no | | length 1 to 100 |
| `username` | text | yes | | UNIQUE; 3 to 30 when set |
| `email` | text | no | | UNIQUE; copied from Auth; not editable in the UI |
| `phone` | text | yes | | E.164; `normalizeToE164()` on every write. Load-bearing for the WhatsApp staff gate and the contact link |
| `avatar_url` | text | yes | | under 500 chars; public URL in the `avatars` bucket |
| `role` | `user_role` | no | `'agent'` | the platform role |
| `domain` | `app_domain` | no | `'concierge'` | |
| `job_title` | text | yes | | under 100 chars |
| `reports_to` | uuid | yes | | FK → `profiles(id)`; no UI |
| `is_active` | boolean | no | `true` | soft deactivation |
| `is_on_leave` | boolean | no | `false` | shown on rosters; no UI writes it |
| `theme` | text | no | `'earth'` | CHECK: earth, air, water, fire, candy, rose, moss, lilac (0157) |
| `app_icon` | text | no | `'icon-1'` | CHECK mirrors `ICON_KEYS` (0121) |
| `appearance` | text | no | `'light'` | CHECK: light, dark, system (0158) |
| `timezone` | text | no | `'Asia/Kolkata'` | |
| `sia_role` | text | yes | | 0194; values queen, bishop, genie, joker, joker_head (0244) |
| `queendom_id` | uuid | yes | | 0194; FK → `sia.queendoms(id)` ON DELETE SET NULL |
| `last_seen_at` | timestamptz | yes | | never written |
| `created_at` / `updated_at` | timestamptz | no | `now()` | `updated_at` by trigger |

**Constraints and indexes on the seat fields:**

| Name | Rule | Migration |
| ---- | ---- | --------- |
| `profiles_sia_fields_concierge_only` | `sia_role` and `queendom_id` are NULL unless `domain = 'concierge'` | 0201 |
| `profiles_sia_role_values` | `sia_role IN ('queen','bishop','genie','joker','joker_head')` | 0244 |
| `profiles_sia_role_needs_queendom` | `sia_role IS NULL OR ((sia_role = 'joker_head') = (queendom_id IS NULL))`: every position names a queendom except the Joker head, who never does | 0244 (replaces 0201's version) |
| `idx_profiles_one_queen_per_queendom` | one active queen per queendom | 0201 |
| `idx_profiles_one_joker_per_queendom` | one active joker per queendom | 0201 |
| `idx_profiles_one_joker_head` | one active Joker head | 0244 |
| `idx_profiles_one_bishop_per_queendom` | dropped: bishops are many | 0201, dropped by 0242 |
| `idx_profiles_queendom` | index on `queendom_id` | 0194 |

The indexes are partial on `is_active`, so a deactivated holder never blocks naming the next.
Other indexes: `idx_profiles_role`, `idx_profiles_domain`, `idx_profiles_domain_active`.

**Triggers:**

| Trigger | Event | Function |
| ------- | ----- | -------- |
| `profiles_updated_at` | BEFORE UPDATE | `update_updated_at()` |
| `on_auth_user_created` | AFTER INSERT on `auth.users` | `handle_new_user()` (below) |
| `profiles_audit` | AFTER UPDATE | `log_profile_changes()` (append-only audit) |
| `on_agent_profile_created` | AFTER INSERT OR UPDATE on `profiles` | `handle_agent_routing_config()`: a config row for every agent or manager (0124) |

**`handle_new_user()`** (latest body: 0201). Inserts the profile from `raw_user_meta_data`:
`full_name` (fallback `'Unknown'`), `role` (fallback `agent`), `domain` (fallback
`concierge`), `job_title` (blank → NULL, since 0125), `sia_role` and `queendom_id` (blank →
NULL, since 0201). It does not copy `phone`. Never INSERT into `profiles` from app code.

The trigger trusts the metadata it is given. The app only ever calls it through the service role
(`createUser`, `inviteUserByEmail`), never `signUp`, but the metadata of a public sign-up would be
trusted the same way. See `./auth.md` §7 on the sign-up setting.

**RLS:**

- `profiles_select`: any signed-in user reads every profile (`auth.uid() IS NOT NULL`). Pickers,
  names on records and WhatsApp labels need cross-user reads; sensitive data is scoped on the
  data tables, not by hiding names. So the page gate, not RLS, limits the Team list.
- `profiles_update` (latest: 0243). USING: your own row, or admin/founder. WITH CHECK:
  admin/founder pass; otherwise it must be your own row and `role`, `domain`, `sia_role` and
  `queendom_id` must equal their current values (read by a subquery from the live row, never
  the JWT; `IS NOT DISTINCT FROM` for the two nullable seat fields). Before 0243 a concierge
  teammate could move themselves into another queendom through the database API.
- No INSERT policy (the trigger inserts) and no DELETE policy (deactivate instead).

**Helper functions** (all `SECURITY DEFINER`, `search_path` pinned): `get_user_role()`,
`get_user_domain()`, `get_user_queendom()` (0194), and `can_access_member_queendom(p_queendom)`
(admin/founder any; a seated teammate their own; the active Joker head any, 0244; a NULL
queendom admin/founder only). Every member, Sia ticket and intake policy calls the last one. The
principle and the `app_domain` cast rule (compare with `get_user_domain()::text` against a text
column, or Postgres raises 42883): `../architecture/auth-and-rbac.md`.

#### `public.profile_audit_log`

Append-only. Columns: `id`, `profile_id` (FK ON DELETE RESTRICT, so an audited profile can never
be hard-deleted), `changed_by` (`COALESCE(auth.uid(), NEW.id)`, so a service-role write never
fails), `changed_at`, `field_name`, `old_value`, `new_value`. `log_profile_changes()` records
`role`, `domain`, `is_active`, `is_on_leave`, `full_name`, `username`, `email`. Not recorded:
theme, app_icon, appearance, timezone, phone, job_title, avatar_url, reports_to, and the seat
fields (§7). SELECT for admin/founder only; no UI reads it.

#### `gia.agent_routing_config`

One row per pool member (agents and managers, `ROUTING_POOL_ROLES`), auto-created by the trigger
above. Moved from `public` to `gia` by 0210; read through `giaDb()`. Columns and semantics:
`./settings.md` §8.3.

### 8.8 Services and actions reference

`profiles-service.ts` (session client unless noted):

| Function | Client | Used by |
| -------- | ------ | ------- |
| `getCurrentProfile` | session | every page and action. React `cache()`; identity from `auth.getClaims()` (a local JWT check since 2026-09-16), authorization from the row |
| `getProfileById`, `getAllProfiles`, `isUsernameTaken` | session | Team pages, `updateProfile` |
| `getQueendomRoster` | session | the Queendoms card. `{ queendom, seats: { queen, joker }, bishops[], genies[] }` per queendom |
| `updateProfileFields`, `updateAuthorization`, `setProfileActive` | session (+ admin for the ban) | the actions |
| `getAssignableUsers` | session | THE assignable-users query; `getAssignableUsersAction` wraps it |
| `getActiveProfileByPhone` | admin | the WhatsApp staff gate |
| `getActiveStaffFirstNames` | admin | the Deepgram name boost |
| `searchTeammatesForElaya` | admin | Elaya's `find_teammate` (exact, then sound-alike) |
| `getDomainDecisionMakers` | admin | domain fan-out reads (deal and SLA notifications) |

`getProfilesByDomain`, `getProfilesByRole` and `getActiveAgentsByDomain` were deleted on
2026-07-02; use `getAssignableUsers`.

Every action runs Zod first, then `requireProfile(roles?)` from `lib/actions/_auth.ts`, then the
service or core, and returns `{ data, error }`.

### 8.9 Validation schemas

| Schema | Fields | Notes |
| ------ | ------ | ----- |
| `createUserSchema` | full_name, email, password (8 to 72), role, domain, job_title?, phone?, sia_role?, queendom_id? | `checkPosition` + drop a queendom on a company-wide seat |
| `inviteUserSchema` | as create, without password and phone | same seat rules |
| `updateAuthorizationSchema` | id, role, domain, sia_role?, queendom_id? | same seat rules |
| `updateProfileSchema` | id, optional full_name, username (`^[a-z0-9_]+$`), job_title, phone, theme, app_icon, appearance, timezone | |
| `toggleUserActiveSchema` | id, is_active | |
| `updateProfileAvatarSchema` | id, avatar_url (URL) | |

Error codes map to copy through `form-errors.ts` (`siaRoleInvalid`, `siaRoleDomain`,
`queendomRequired`, `siaRolePlatformMismatch`, `seatTaken`, `emailUnavailable`, and so on).

### 8.10 Access control summary

| Action | agent | manager | admin | founder | tech workbench |
| ------ | ----- | ------- | ----- | ------- | -------------- |
| Open the Team list / create page | no | no | yes | yes | page only |
| Open a teammate's page | no | no (layout guard) | yes | yes | page only |
| Create or invite an account | no | no | yes | yes | refused |
| Edit another person's profile fields | no | no | yes | yes | refused |
| Edit own profile (`/profile`) | yes | yes | yes | yes | yes |
| Change domain, role, seat, queendom | no | no | yes | yes | refused |
| Deactivate or reactivate | no | no | yes | yes | refused |
| Toggle an agent's lead routing | no | own domain (on `/settings`) | yes | yes | tech manager, own domain |
| "Link now" (WhatsApp) | no | no | yes | yes | refused |
| Read the audit log (database only) | no | no | yes | yes | no |

### 8.11 Edge cases and rules

1. **Deactivate, never delete.** Tasks, notes, activities and the audit log all reference the
   profile id; `ON DELETE RESTRICT` on the audit log blocks a hard delete anyway.
2. **Role, domain and seat changes apply at once.** RLS and every service read the live row.
   Assigned leads and tasks are not moved.
3. **Nobody elevates themselves.** The WITH CHECK subquery pins role, domain, seat and queendom
   for a self-edit.
4. **A position derives its platform role.** The form locks it, Zod checks it, and a genie is
   always an agent.
5. **An empty queendom does not mean company-wide.** Every non-concierge account has a NULL
   queendom; only the `joker_head` seat is company-wide.
6. **Username** uniqueness is enforced by the DB; the pre-check is for a nicer message. The UI
   falls back to `full_name` wherever a display name is needed.
7. **Theme or appearance missing or unknown** falls back to `earth` and `light`.
8. **`?from=`** on the teammate page is honoured only when it starts with `/admin/users`, and is
   used as Next decoded it (decoding twice throws on a search containing `%`).

### 8.12 Known invariants

1. `profiles` rows are created only by `on_auth_user_created`. No app INSERT.
2. Every account is created through `createStaffAccountCore` (form and script alike). Never call
   `auth.admin.createUser` anywhere else.
3. `profile_audit_log` is append-only; no UPDATE or DELETE policy, ever.
4. Authorization reads only `profiles` (`get_user_role()`, `get_user_domain()`,
   `get_user_queendom()`), never JWT claims.
5. `profiles_update` blocks a self-change of role, domain, `sia_role` and `queendom_id`.
6. `normalizeToE164()` on every phone write; `sanitizeText()` on name and job title.
7. Queen and joker: one active holder per queendom. Joker head: one active in the company.
   Bishops and genies: many.
8. `sia_role` and `queendom_id` are set only in the concierge domain, always together (except
   the Joker head, who never has a queendom), and always through `updateAuthorization` or the
   signup metadata.
9. Two-layer security (A-09): the action's `requireProfile` and RLS, never one alone. The
   workbench page gates never widen a write.
10. `gia.agent_routing_config` rows are created idempotently by the trigger for agents and
    managers (0124).

### Enums

```sql
CREATE TYPE user_role  AS ENUM ('founder','admin','manager','agent','guest');
CREATE TYPE app_domain AS ENUM ('concierge','onboarding','finance','marketing','tech','shop','business','house','legacy');
```

`business` was `b2b` until 0202 (2026-09-16). TypeScript: `UserRole`, `AppDomain` and `Profile`
from `src/lib/types/database.ts` (`Profile` narrows `theme`, `app_icon` and `appearance` to their
unions); `SiaRole` from `constants/sia-roles.ts`.
