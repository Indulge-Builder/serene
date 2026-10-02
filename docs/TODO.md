# TODO

> **Purpose:** the short live list of open loose ends that are not features: things to check, switch, or fix. Features and roadmap live in `01-vision.md`; per-area gaps live in each doc's "Open items".
> **Audience:** the tech team. · **Last verified:** 2026-09-26 (collected during the full docs refresh); security plan added 2026-09-29.

Check items off (or delete them) as they are done. Each item names the doc that has the detail.

---

## Security and access

**Data protection plan (security review, 2026-09-29).** Chat text is stored readable in the
database: about 198,000 Sia WhatsApp messages, 219,000 Freshdesk conversations, 70,000 file
readings and 2,100 Elaya messages. That is expected. Serene has to read its own messages (Elaya,
the profiler, intake, search), and the Baileys connector is itself the "end" of WhatsApp's
end-to-end encryption, so true end-to-end is not possible here. What protects the text today:
HTTPS everywhere, Supabase disk encryption, row security on every chat table, and names masked
before AI calls. The cards and IDs vault is the one place with its own encryption (AES-256-GCM,
key outside the database). **Decided: do not encrypt message text field by field.** The server
would hold the key anyway, so it adds little over disk encryption, and it would break search,
Elaya's read-only query door and the deep read. The real gaps, in the order to fix them:

- [ ] **1. Find out who `jerry_readonly` is, or remove it.** A database role with SELECT on 68
  tables, including every WhatsApp message (`sia.wag_messages`) and every Elaya chat
  (`elaya_messages`), through 74 policies (the two checked allow every row, `USING (true)`). It cannot log in itself, but
  `authenticator` (the API's login) is a member, so anyone holding an API token that says
  `role: jerry_readonly` reads all of it over the REST API. It was created by hand: no migration,
  doc or script mentions it. If nobody can name the owner, drop the role and its policies and
  rotate the project's JWT signing secret (which also signs any token already issued for it).
- [ ] **2. Encrypt the WhatsApp session keys.** `sia.wag_auth_state` (the Sia number) and
  `hands.auth_state` (the Hands number) hold the Signal keys as plain JSON. Row security keeps
  normal users out, but anyone with the service-role key could copy them and send as the company
  number. Encrypt the `value` column in `connector/src/auth-postgres.ts` with a key that lives
  only in the connectors' environment (the `vault-crypto.ts` pattern: AES-256-GCM, key version
  for rotation). Migrate the existing rows with the watcher stopped, and follow the Sia
  session-state discipline (freeze, read-only audit, then change). Never experiment on the live
  session.
- [ ] **3. Shrink and rotate the service-role key.** The key that reads everything sits on
  Vercel, the Trigger.dev worker, the AWS Fargate brain, the connector box(es), and developer
  laptops (`.env.local` points at production). List every copy, take it off the laptops (use a
  local database or a read-only role for benches), then rotate it once.
- [ ] **4. Log who reads whose chats.** Nothing records reads today, including the new admin
  Chats page (`/settings/elaya-chats`) and the Sia and Freshdesk pages. Add an append-only access
  log (the `logMemberAccess` / vault-trail shape): who, whose conversation, when.
- [ ] **5. Set a retention period.** Nothing is ever deleted: chat text, media and file
  readings are kept forever. Decide with the founders how long each kind is kept, then add a
  scheduled purge (or archive) job. Also check Supabase backup and point-in-time settings, since
  backups keep deleted rows.

- [ ] **Close the sign-up hole for good.** The new-user trigger `handle_new_user` (latest
  definition in migration 0201) still copies `role`, `domain`, `sia_role` and `queendom_id` from
  the sign-up metadata, which the person signing up controls. Today this is safe only because
  public sign-up is off on production (checked 2026-09-26: `disable_signup: true`); if anyone
  turns it back on, a stranger could create themselves an active founder. Durable fix: stop the
  trigger trusting user metadata (set the role through the admin action or `app_metadata`), and
  set `enable_signup = false` in `supabase/config.toml`. See `architecture/auth-and-rbac.md`.
- [ ] **`linkMemberGroupAction` checks too little.** It only checks that the caller can see the
  member, not their role or whether the group belongs to their queendom. The two screens that
  call it are admin and founder only, but the action itself is not. See `modules/sia.md` and
  `architecture/auth-and-rbac.md`.
- [ ] **Ticket priority approval is enforced only in the page.** `setTicketPriorityAction`
  trusts the `approve` flag it is sent. See `modules/tickets.md`.
- [ ] **Seat changes are not audited.** `log_profile_changes()` does not record changes to
  `sia_role` or `queendom_id`. See `architecture/auth-and-rbac.md`.
- [ ] **The tech workbench sees buttons it cannot use:** Merge / Remove on vendors, manage on
  `/sia`, Sync now on `/freshdesk`, and saving on the Teach Elaya pages. Either hide them or
  grant the actions. See the owning docs.
- [ ] **Budget for the tech workbench.** A workbench teammate who is not a manager passes
  `hasManagerPageAccess` and sees the full admin budget view, recharges included. See
  `pages/budget.md`.

## Small bugs found during the refresh

- [ ] **Add `public.tasks` to the Realtime publication** (or drop the group workspace's dead
  subscription). Production's `supabase_realtime` publication does not include it, so live
  subtask updates in the group workspace never arrive. See `architecture/overview.md` §8.
- [ ] **Fix the dashboard Pending Calls tile link.** It points to `/tasks?tab=gia`, a tab that
  no longer exists. See `pages/dashboard.md`.
- [ ] **Two payment-status vocabularies on tickets.** The Money card uses
  not_started / requested / paid / waived; the sentinel writes unpaid / partial / paid. See
  `modules/tickets.md`.
- [ ] **The seeded watch and bag SLA rows have no escalation ladder**, and the most specific
  policy wins whole, so those tickets never escalate. See `modules/tickets.md`.

## Environments and jobs

- [ ] **Confirm the `GUPSHUP_*` variables are set on the Trigger.dev production worker.** A
  2026-09-22 finding says the brief's WhatsApp send failed there. Without them, the WhatsApp leg
  of the brief, the alerts and the Sia watcher alarm fails quietly. See
  `operations/environments.md`.
- [ ] **Confirm the `ZOHO_*` variables are on the Trigger.dev worker** (the brief's money
  section is skipped without them). See `integrations/zoho-books.md`.
- [ ] **Diagnose the SLA timers stuck in `pending`.** Timers fire (21 in the last 24 hours on
  2026-09-26, so the 2026-09-21 Trigger.dev key problem is resolved), but 1,877 rows in
  `gia.lead_sla_timers` sit in `pending` past their fire time, oldest about 101 days, about 58
  added in the last week. Likely rows not closed when a run is skipped or cancelled. It also
  keeps the health check's row 2 permanently red. See `operations/engine-health-check.md`.
- [ ] **Unblock Vercel's git builds.** On 2026-09-28 the deploying session reported that builds
  from git pushes were blocked on the Vercel account, so production (4b8d185) was deployed from
  the CLI. Until this is fixed, a push to main does not deploy by itself. See
  `operations/deployment.md`.
- [ ] **Fix `scripts/engine-health-check.sql`.** Its tables moved to the `gia` schema on
  2026-09-17, so it fails as written. The runbook shows a search-path workaround until then.
  See `operations/engine-health-check.md`.
- [ ] **Plan partition upkeep.** Nothing creates new monthly partitions. `sia.wag_*` and
  `member_events` run to 2027-03, `sia.ticket_events` to 2027-12; later rows land in the
  default partition. See `operations/maintenance.md`.
- [ ] **Retire the Node brain** (target 2026-10-16) once nothing depends on it. See
  `modules/elaya.md`.
- [x] **Apply migrations 0245 (hands) and 0246 (media readings)**: both applied to production
  2026-09-28 after a dry run (`supabase db push`). The media reader's switches stay OFF until the
  founder's 60-file review. See `architecture/migrations.md`.

## Stale code comments and registries (docs are right, the code comments are not)

- [ ] Root `CLAUDE.md`, the comment in `src/trigger/lead-revival.ts` and the comment in
  `scripts/engine-health-check.sql` say the revival sweep runs at 07:30 IST. The cron
  (`0 2 * * *`, `Asia/Calcutta`) fires at **02:00 IST**, and production's revival candidates are
  all created at 02:00 to 02:02 IST. Decide which time is wanted, then fix the pattern or the
  comments.
- [ ] Root `CLAUDE.md`, `.env.example` and the header of `src/trigger/freshdesk-sync.ts` still
  say Freshdesk allows 50 calls a minute. It is 400 a minute for the account, 100 for the ticket
  endpoints; the budget is 80 with a reserve of 15.
- [ ] Root `CLAUDE.md` vendor rows: Remove hard-deletes a vendor with no history since 0230, and
  Merge / Remove / Restore are admin and founder only (not just status).
- [ ] `src/lib/elaya/CLAUDE.md` still says "12 read tools" and "12 write tools" (36 and 16 today)
  and that house has no Elaya.
- [ ] `backend/README.md` ("a FastAPI skeleton"), `connector/README.md` ("deploy later", local
  session), `connector/Dockerfile` (EFS) describe an older state.
- [ ] Design rows in root `CLAUDE.md` and `src/components/CLAUDE.md` (card header wash
  percentage, two theme `fg` values, the Button row, the Dialog overlay). See
  `design/decision-log.md` Open.
- [ ] The "no `server-only` chain because of Trigger.dev" comments give the wrong reason: the
  Trigger.dev build stubs `server-only`; the rule only matters for laptop `tsx` scripts.
- [ ] Root `CLAUDE.md` says "never an inline `.schema('…')` string", but `sia` has no helper and
  about 15 services call `.schema('sia')` inline. Either add a `siaDb()` helper or relax the
  rule. `MEMBER_TABLES` also omits the two vault tables.
- [ ] Root `CLAUDE.md` names four parallel-fetch `tasks.ts` actions as `requireProfile`
  exceptions; the code, `src/lib/actions/CLAUDE.md` and `The_Rules.md` have three.
- [ ] Rule S-12 says reject before reading the body; the WhatsApp webhook reads the body before
  its secret compare. Fix the route or record the exception in `The_Rules.md`.

## Email and messaging

- [ ] **Verify the sender domain on Brevo (DKIM / SPF)** so auth emails stop landing in spam.
  Custom Brevo SMTP is configured in Supabase and sends; mail from `indulge.global` is flagged
  as untrusted until the domain is authenticated in Brevo (Senders, Domains & Dedicated IPs).
  Make sure the Supabase SMTP sender matches a verified Brevo sender, then send a test reset.
- [ ] **Set `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID`** to the approved welcome template id. Until
  then the customer welcome blast no-ops safely. If the template's variables differ from
  `{{1}} = first name`, adjust `sendCustomerWelcomeTemplate` in `whatsapp-api.ts`. See
  `modules/customer-welcome-blast.md`.

## Elaya

- [ ] **Semantic retrieval for Notes (embeddings), when notes outgrow the prompt budget.**
  `getNotesForElaya` still loads a person's notes newest-edited first until
  `ELAYA_NOTES_PROMPT_BUDGET` (6,000 characters) is spent, and drops the rest. Build this when a
  user keeps more than about 6,000 characters of notes. It needs a new embeddings provider
  (Anthropic has none), a migration (`embedding vector(1536)` + an HNSW index), a one-time
  backfill, and a decision on masking note text before it goes to the embeddings API. See
  `pages/notes.md`.

## Data counts to refresh (they go stale; re-count before quoting)

- [ ] WhatsApp groups linked to members (401 linked / 64 open on 2026-09-18; the member plan
  says 420 / 45). See `modules/members.md`.
- [ ] Whether the profiler has finished reading the Active members' history (67% on
  2026-09-21). See `modules/members.md`.
