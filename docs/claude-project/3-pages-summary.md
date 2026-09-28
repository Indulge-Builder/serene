# Serene: Pages Summary (Claude Project digest)

> **Purpose:** one paragraph per route in `src/app`: what the page does, who reaches it, and the invariants worth knowing before touching it.
> **Audience:** a claude.ai Project chat that cannot read the repo.
> **Source-of-truth scope:** a digest of the page specs in `docs/pages/` plus the module docs that own a page (`docs/modules/vendors.md` for the vendor pages, `docs/modules/subscriptions.md`, `docs/modules/elaya.md` for Teach Elaya, `docs/modules/mobile-ops.md` for `/m`, `docs/integrations/freshdesk.md` for `/freshdesk`, `docs/integrations/zoho-books.md` for `/books`). For page-level work, attach the full spec: it has the invariant lists this file only summarises.
> **Last verified:** not re-checked against code (a digest). Regenerated 2026-09-26 from the docs verified against the code that day.

## Conventions every page shares

- **List pages** follow one layout: `<h1 class="type-page-title">Title<span class="page-title-dot">.</span></h1>`
  with the primary action top right, then the paper filter strip (`<FilterBar>` + `useUrlFilters`,
  immediate commit, URL params), then `<Suspense>`-wrapped async content. Detail pages get a Back
  button (which returns to `?from=` when it points inside the same section) and no title dot.
- **Loading** files compose `ui/PageSkeletons`; **empty states** compose `<EmptyState>` (one anatomy:
  raised tile, Playfair italic title, calm description, at most one action; never "No data
  available"); **form errors** come from `lib/validations/form-errors.ts`.
- **Shell chrome on every dashboard page:** the Sidebar (full, icon rail, drawer on phones; a link
  shows only when `isNavVisible` allows it), `PageControls` on each title row (the notification bell,
  and the admin/founder global domain selector), `CondensingPageHeader`, the ⌘K command palette, the
  floating Elaya button (only when `hasElayaAccess`), "Send feedback", the boot screen on the first hard
  load, toasts. There is no top bar and no route veil.
- **Reachability is not authorization.** `canAccessRoute` (the route map) lets a page load; the page's
  own gate and RLS decide what shows. The tech workbench reaches almost every page but its writes are
  refused and RLS shows it no member or ticket rows. See `2-architecture-summary.md` for the route map.

---

## Entry and auth (the `(auth)` group)

**`/` (root).** Sends a signed-in person to `/dashboard`, everyone else to `/login`.

**`/login`.** Email and password (`loginAction`: `signInWithPassword` + the `is_active` gate). Honours
`?next=` through `safeReturnPath` (same-site paths only), which is how the OAuth consent flow returns.
There is no sign-up screen: every account is made by an admin. Deactivated accounts are stopped at
login, by an auth-level ban, and again by the dashboard layout.

**`/forgot-password` and `/update-password`.** Password reset by a **6-digit code**, not a link
(corporate link scanners burned single-use links): request (never reveals whether the account exists)
→ verify (`verifyOtp` type recovery; the session starts here) → set the password with
`PasswordStrengthBar`. `/update-password` is gated only by `?email`. Fields are never cleared on error.

**`/auth/callback`.** The invite landing: a client page that turns an admin's invite link into a
session and sends the person on to choose their first password. The server route
`/api/auth/callback` is legacy, kept for old links.

**`/oauth/consent`.** The consent screen of Supabase's OAuth server, for the MCP connector: it says
which AI app is asking and as whom, with Allow and Deny. Without a session it sends the browser to
`/login?next=<consent URL>` and comes back. Connected apps are listed and revocable on `/profile`.

## Everyone's pages

**`/dashboard`.** The personalised spatial grid (react-grid-layout, 12 columns) of code-split widgets.
The page does not await its seed: the header paints at once and the grid resolves one
`get_dashboard_summary` RPC (React `cache()`) behind Suspense. `widgetAllowedFor(def, role, domain)` is
the one gate for which widgets a person may hold. A Gia agent gets tasks, Elaya, pending calls, new
leads and activity; a Gia manager, admin or founder gets `MANAGER_GRID` (tasks, Recent Leads, Lead
Pipeline, Lead Volume, Campaigns, Campaign Budget, Going Cold); anyone in a non-Gia domain gets My Tasks
plus Elaya (Elaya only where `ELAYA_DOMAINS` allows). A global URL date filter scopes the cohort widgets
by `leads.created_at` (IST); snapshot counts ignore it. Domain scope is the single global selector (no
per-widget tabs). Layout persists per user in localStorage; below 768px a derived read-only single
column is shown and never saved. An admin or founder on a phone is redirected to `/m`. Open: the
Pending Calls tile links to a Tasks tab that no longer exists; the concierge queendom widgets are not
built.

**`/elaya`.** The in-app chat with Elaya, for everyone `hasElayaAccess` admits (admin, founder, the tech
workbench, concierge and the Gia domains; not finance, marketing, business or guests). One
`ElayaChatShell` renders in four places (this page, the floating button, the dashboard widget,
`/m/elaya`) and all continue the person's single active conversation, which their WhatsApp messages to
Elaya continue too. The route proxies SSE frames from the Python brain. Voice input through
`DictationButton` (an editable draft, never auto-sent). Assistant text renders through `<ChatMarkdown>`.
Daily cap 200 messages from IST midnight, shared across channels. Proposals are confirmed by a typed
"yes"; the Approve/Dismiss card is not built. How she works: `5-elaya-jarvis.md`.

**`/notes`.** Private notes for every staff member (owner-only RLS, migration 0152;
`ALWAYS_ALLOWED_PREFIXES`). Elaya folds a person's notes into her prompt as their own memory, never as an
instruction and never as permission (a June note saying "end every reply with a joke" was obeyed for
three months before that rule). Capped at 6,000 characters in the prompt; embeddings are not built.
Delete is optimistic with an undo toast. Teams without Elaya still have the page.

**`/tasks` and `/tasks/[id]`.** The task hub: **My Tasks** (personal tasks with a calendar view) and
**Group Tasks** (cards that open the group workspace at `/tasks/[id]`, list or board). One
`public.tasks` table with two structural categories (personal, group_subtask). A lead follow-up is a
personal task with a `gia.task_gia_meta` row (the single-writer invariant; read through
`gia-task-links.ts`); a ticket task has a `public.task_ticket_meta` row and the `ticket` tag. The old
Gia tab was deleted on 2026-06-17. Every mutation writes a `task_events` row (the oversight feed) and
an `activity_events` row where relevant. Deletes are optimistic with an undo toast (the group delete
keeps a confirm dialog). Repeat reminders (0232) exist, but only Elaya sets them; there is no UI.
Reachable from every domain. Known gap: the group workspace's Realtime subscription to `public.tasks`
never fires because that table is not in the publication.

**`/profile`.** Every user edits only their own row: name, phone, job title, username, avatar,
appearance (Light / Dark / Auto), theme (eight), home-screen icon, notification preferences per
category and channel, Web Push on this device, the chime, "how Elaya talks to me" (language, tone,
depth, length, a 600-character note), "What Elaya has learned about you" (the living memory: remove an
entry, add a rule), Connected AI apps (MCP grants, Disconnect), password. Role, domain, seat and
queendom are never self-editable. Everything applies instantly and persists through the one
`updateProfile` action.

**`/helpdesk`.** The Call Intelligence library: past deliveries (`gia.service_cases`) and talking points
(`gia.conversation_hooks`) for one Gia domain. Reachable by everyone (`ALWAYS_ALLOWED_PREFIXES`), hidden
from the concierge and founder sidebars. The full library loads once (Redis 1 hour) and **all filtering
is client-side**; never add a per-keystroke server search. Writes are admin/founder. Only onboarding
was seeded (150 cases, 30 hooks).

## The sales floor (Gia)

**`/leads`.** The pipeline list: a display-only dense table with server-side filters, search, sort and
pagination from URL params (30 a page), column visibility and order per user, Add Lead, bulk edit, and
client-side CSV/XLSX export. Agents see their own leads (they may narrow by Gia domain, never widen);
managers default to **My Leads** with a **Team Leads** toggle (`?view=all`) for the domain; admin and
founder see all. Reads go through `giaDb()`; the list cache is Redis 30 s with a version counter. The
revival review view (`?revival=true`) reuses the table. Open: archived leads are invisible to phone
search; the revival view has no way in from the UI.

**`/leads/[id]` (the dossier).** The single place an agent works a lead: slug-first lookup, a blocking
fetch for the header and status panel only, everything else streamed. Status actions (with the Called
and Won modals and resolution confirms), inline field edits, call and team notes with voice
dictation, the journey timeline, tasks, the WhatsApp card (can start a conversation with the
`lead_initiation` template), the linked deal, Shop-app product enquiries, and the Call Intelligence
card. Every card composes `<CardHeader>`. Won writes the deal **before** the status flips. No access →
`/leads`; unknown → the in-shell 404.

**`/deals`.** Every closed transaction (lead-won and walk-in) in `gia.deals`, with a summary strip and
cards. Three write paths share one core: the dossier's Won flow, the walk-in "New deal" (`lead_id`
null), and Elaya's `log_deal` (propose then confirm). `deal_type` is derived from the domain, never
picked; `won_at` is immutable. A cold landing defaults to This Month. `member_id` exists but nothing
sets it (the Gia to Sia bridge is not built).

**`/campaigns` and `/campaigns/[id]`.** A campaign is a distinct `leads.utm_campaign` value, not a row;
every metric groups leads. List = one card per (campaign, domain); detail = metrics strip, agent
distribution, leads table, optional ad-creative carousel. Manager and above (`hasManagerPageAccess`);
managers are domain-locked; reachable from the Gia domains, marketing and business. Names display raw;
the key is always `normalizeCampaignKey()`. Response times are business minutes. No Redis.

**`/performance`.** One URL, three layouts. Agent: a self-scorecard (today strip, core KPIs, activity
trend, pipeline, call outcomes). Manager: the domain roster and per-agent detail (pinned in SQL).
Founder/admin: a **Domains** tab (health cards, comparative chart, a deals-vs-target meter they can edit)
and an **Agents** tab. Every tile drills into the leads or deals behind it (deals by `won_at`). Since
2026-09-26 one agent identity (`AgentIdentityHeader` + `AgentStatRow`) is shared by the manager panel
and the founder deck.

**`/budget`.** Meta ad spend against lead and deal outcomes per campaign (from uploaded CSV/XLSX, never
a Meta API) plus a per-account recharge ledger (balance = recharged minus spent, INR only). Manager and
above: a manager sees only their own domain's spend plane (pinned server-side; recharges carry no domain
so they stay admin/founder). Upload and Add Recharge are admin/founder. The parser rejects a whole file
whose rows are not day grain. Open: a non-manager tech workbench teammate sees the full admin view.

**`/escalations`.** What needs someone to step in: live SLA breaches (computed live, so it is right
even if a worker did not fire), overdue lead follow-ups, and leads going cold. Built only on what the
follow-up engine already writes; no tables, jobs or cache of its own. Agents get a self view in the
second person; managers their domain; admin and founder the company with the global selector.

**`/oversight`, `/oversight/[domain]`, `/oversight/[domain]/[agentId]`.** A three-tier drill for
managers and up: Teams (admin/founder), Team (a manager lands here pinned to their domain), Agent. Counts
plus live rails over the append-only `task_events` stream, through three scope-param RPCs clamped in
SQL. It never writes. Open: a tech workbench agent gets the unclamped all-teams view.

**`/whatsapp`.** The shared inbox for the company WhatsApp number (Gupshup): one conversation per lead
phone, live over Realtime, replies with text, image, video, PDF, audio or a dictated draft; inbound
media is copied to private storage. Reachable from the four Gia domains only (it left concierge on
2026-09-18). Rows follow lead access. There is no resolve or lock state. The thread can carry the
customer Elaya's replies (`bot_active`); an agent's reply takes over. The same number is Elaya's staff
channel: a known staff phone goes to Elaya before the lead pipeline, and **a staff profile with a blank
phone turns that person's messages into a lead**.

## The concierge floor (Sia)

Full detail on this whole section: `12-sia-concierge.md`.

**`/members`.** The member list over the `member.members_list` view: most active first (the hourly
pulse), filters for search, queendom (admin, founder, Joker head only), tier, status, health, "not
linked" (no WhatsApp group, Freshdesk, Zoho, app, or queendom) and sort; 50 a page; a card stack on
phones. RLS scopes rows by queendom. "New member" opens the one New/Edit form.

**`/members/[id]`.** Everything known about a member: identity and team (queen, bishops, joker, genie
count), Health (one number, its reasons, "Adjust by hand"), WhatsApp (the linked group; link and unlink
for admin/founder), Serene's judgement and the pulse ("Assess now"), the Observation box (free text in,
facts out), Essentials and Preferences (double-click a value to correct it; the correction supersedes),
Requests (mirrored Freshdesk tickets; Serene tickets not yet), Activity, People, Cards & documents (the
encrypted vault: open asks why and shows the secret for 60 seconds), App, Money (hidden for the Joker
head), Relationships, Coming up, In a few words. Every open is logged; out of reach is a 404.

**`/members/[id]/finance`.** The membership money Serene holds, then the live Zoho ledger (outstanding,
invoiced, paid, credits, the customer record, invoices, payments, credit notes, Refresh). Redirects
when `canSeeMemberFinance` refuses (the Joker head). Every open is logged.

**`/sia`.** A read-only WhatsApp-Web-style viewer over every group the watcher sits in: a rail of
groups, the chat (history, reply jump, deep links `?group=&message=`), search, media, a group info
panel, and "Create a ticket from messages". No compose box, ever. The live tail is a 4-second poll.
Scope from `getSiaViewerScope()`: admin and founder see every group plus the console (watcher health,
the pairing QR, restart, re-pair, group mapping); a seated teammate sees only their queendom's linked
member groups; the Joker head every queendom's member groups; anyone else is sent home.

**`/tickets`.** The "Suggested by Serene" strip (intake cards grouped per member, two actions each:
Review and create, or Add to an existing ticket; Dismiss needs a reason; the week's training numbers
for admin/founder) above the ticket list (filters for search, status, queendom, genie, category, tag,
Mine; 50 a page). Reachable by admin, founder, the workbench and concierge; listed in the nav only for
admin and the workbench (the floor arrives from Sia and notifications).

**`/tickets/new`.** One form, three ways in: from an intake card (`?proposal=`, filled from the stored
draft), from a Sia selection (the drafter reads the messages), or by hand. The side column shows the
drafter's suggestion and the WhatsApp messages the request rests on (`SiaMessagesPeek`). "What did
Serene get wrong?" appears only when a field differs from the draft. A new ticket starts open with its
priority approved and its SLA running.

**`/tickets/[id]`.** The workbench for one request: status controls (only legal moves; a vendor is asked
for before Awaiting vendor; a resolution before ending), priority and approval, genie assignment with a
reason, the Sentinel card (its suggested move with Approve / Dismiss), the Vendor card (ranked
suggestions, then a review after resolving), tags, the member help window, brief, checklist, money, the
member's words, the timeline with the note box, and sub-work tasks. Out of reach is a 404; every open
writes the member access log.

**`/tickets/board`.** Eight live columns (Proposed through Resolved) over Realtime on `sia.tickets`,
drag to move (or a "Move to" menu on touch), each move checked in the browser and again in the core. A
seated teammate is pinned to their queendom. Open: the board ignores every filter except the queendom.

**`/freshdesk` and `/freshdesk/[id]`.** The read-only Freshdesk mirror: an overview strip (open, created
and resolved today, escalated, by status, with the sync health line), filters, a dense table, and
`?member=<id>` to scope to one member; the ticket page shows the thread with copied files, the movement
history, and a summary. A seated teammate is pinned on the server to their queendom's Freshdesk group;
"Sync now" is admin/founder. Serene never writes to Freshdesk.

**`/vendors`, `/vendors/[id]`, `/vendors/find`.** The vendor book, open to admin, founder, the whole
concierge domain and the workbench (page only). The list has the "Needs a look" queue of unconfirmed
extractor rows, search and category filters, 30 a page. The vendor page shows identity, the computed
0-to-10 score ring (deliberately a different shape from the human star ratings), the teammate's own
preferred/avoid, notes, invoices (signed URLs), a verify banner ("Looks right"), and admin actions
(Merge in, Remove / Restore; admin/founder only). A merged-away id redirects to the keeper. Find a
vendor is one search card and one "Best matches" card from THE ranking.

## Money and configuration

**`/books`.** The company's money from Zoho Books, read live (receivables and aging, this month and the
financial year, bills, cash, overdue and latest invoices, payments, every account). Admin and founder
only (a literal check; the tech workbench is blocked). Redis 5 minutes; Refresh drops it. Serene never
writes to Zoho.

**`/subscriptions`.** The finance and tech tracker for recurring bills, memberships and prepaid top-ups:
List (status computed in IST, never stored), Calendar (projects recurrence; rebuilt 2026-09-25) and
Overview (INR totals, by type, department and tool, a 12-month trend). Payments and top-ups are
append-only with invoices in a private bucket. Currency is never auto-converted (the INR paid is typed).
Passwords are pgcrypto-encrypted with a Vault key; a reveal writes an audit row first. Reachable by
finance, tech, admin and founder, who all see everything (founder decision).

**`/settings`.** A hub: the lead-routing roster (pool switch, shift window, work days per pool member;
managers edit their own domain) plus, for admin and founder, link cards to the config pages. Reachable
by managers and up in the Gia domains and in finance, marketing, tech and business; concierge lost it on
2026-09-25.

- **`/settings/follow-up-engine`**: Gia's SLA timers, cadences and escalations as plain-language
  situation cards (admin, founder, workbench page-only).
- **`/settings/lead-revival`**: the nightly revival sweep's thresholds and caps.
- **`/settings/tickets`**: ticket SLA policies with escalation ladders, status names and tags, and the
  lessons the ticket AI follows (edit, approve, discard, write now, the scoreboard, Download
  instructions.md). Saving is admin/founder.
- **`/settings/teach-elaya`**: the hub (manager and up) with four doors: Training
  (`/admin/elaya-training`), Playbooks, Requests, and Exam (a label, not built).
- **`/settings/elaya-playbooks`**: the founder's plain-words methods for kinds of question, with
  "Speak a playbook" (dictate, then "Draft with Elaya") and "Try it". Admin/founder.
- **`/settings/elaya-requests`**: the improvement requests the team raised when Elaya was wrong; decide
  fixed, declined or playbook with a note. Admin/founder.

**`/admin/users`, `/admin/users/new`, `/admin/users/[id]` (Team).** Where people get an account and a
place: the Queendoms card (seats per queendom) and the Domains card (the team by domain, grouped by
role), the filterable team list, create (temporary password or email invite, through
`createStaffAccountCore`), and one teammate's page (profile fields, the Authorization card with
domain, role, seat and queendom through `RoleDomainFields` (a seat derives and locks the role),
deactivate, routing toggle, the WhatsApp contact linked by phone with "Link now", and what Elaya has
learned about them). Admin and founder write; the workbench opens the pages but saves are refused.
Open: seat changes are not audited; the invite form has no phone field, so invited accounts start with
a blank phone.

**`/admin/elaya-training`.** The customer Elaya's knowledge base: brochures, work examples,
testimonials, media, documents, links and the company-facts brief, per domain, in ten kinds, with a send
order for the welcome blast. The only source of facts the customer persona may use. Manager and up
(reached through Teach Elaya). Open: a manager can write another domain's assets.

**`/admin/ad-creatives`.** Upload and manage campaign videos keyed by a normalised campaign key (string
equality, no FK, several per campaign); they show on the dossier and campaign pages. Page for admin,
founder and the workbench; writes admin/founder. No Redis.

**`/admin/usage`.** Adoption: active time per person and per domain (a tab that is visible and used in
the last two minutes; a 60-second Redis heartbeat, a minute snapshot and 15-minute and nightly
rollups). Admin and founder data only; the workbench sees an "unavailable" state.

**`/admin/suggestions`.** The triage inbox for "Send feedback" reports (category, message, up to four
screenshots in a private bucket). Resolving notifies the sender. Admin and founder resolve; the
workbench can read.

**`/error-log`.** Read-only list of failed lead-ingestion payloads (`gia.lead_raw_payloads` with an
error, full PII kept). Admin and founder see rows; not in the sidebar; no replay action.

## The phone layer (`/m`, the `(client)` group)

A staff surface for leadership on a phone (customers have no login yet). Admin and founder phones land
here from a bare `/dashboard`; Gia managers reach it by URL; agents and non-Gia managers see a "being
prepared" card. The tab bar is **exactly four rooms plus the Elaya knob** (a fifth tab is a compile
error), each room swipeable across the Gia domains (a manager is pinned to their own):

- **`/m`** (Dashboard): per domain this month: new leads, won, deals vs target, ad spend, top agents,
  top campaigns.
- **`/m/tasks`** and **`/m/tasks/[agentId]`**: per-assignee created, completed, open and overdue; tap an
  agent for their open tasks (manager and up).
- **`/m/budget`**: the domain's campaign spend, cost per lead, deals vs target (no recharges).
- **`/m/activity`**: the live `activity_events` feed, one Realtime channel per domain.
- **`/m/elaya`**: the same Elaya chat and transport as desktop; redirects to `/m` without Elaya access.
- `/m/profile`, `/m/requests`, `/m/requests/[ref]`: old demo screens behind a feature flag; they return
  404.

Detail: `11-mobile-and-pwa.md` and `docs/modules/mobile-ops.md`.

## API routes

Not pages, listed for completeness: the three webhooks, `/api/auth/callback` (legacy),
`/api/elaya/chat`, `/api/elaya/bridge`, `/api/manifest`, `/api/mcp` and its discovery document. See
`2-architecture-summary.md`.
