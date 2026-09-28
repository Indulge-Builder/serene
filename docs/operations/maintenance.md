# Maintenance Ledger

> **Purpose:** the upkeep that breaks quietly if forgotten: duties on a clock, keys and settings that need care, things paused on purpose, and the open items waiting for a hand.
> **Audience:** engineers and ops. · **Source-of-truth scope:** recurring duties and open upkeep items. Not the roadmap (`../01-vision.md`), not the changelog (`../changelog.md`), not the short product to-do list (`../TODO.md`).
> **Last verified:** 2026-09-26 against the partition DDL in `supabase/migrations/` (0169, 0194, 0195, 0202), `connector/package.json` (Baileys), `package.json` (Trigger.dev pins), `src/lib/constants/whatsapp.ts`, `src/lib/constants/elaya-jobs.ts`, `src/lib/constants/sia-alerts.ts`, `src/lib/services/sia-service.ts`, and the changelog through 2026-09-26.

If you finish an item, tick it off here in the same PR. If you find a new recurring duty, add it
here, not in your head.

---

## Duties on a calendar clock

### 1. Add monthly partitions before they run out

Four tables are split into monthly partitions. Each has a `_default` catch-all, so nothing is
lost when the months run out, but rows piling into the default make the table slower and a later
partition harder to add. One migration per batch; copy the pattern from the migration named.

| Table | Months covered today | Add more before | Pattern in |
| ----- | -------------------- | --------------- | ---------- |
| `sia.wag_messages` | 2026-08 to 2027-03 | **1 March 2027** | `20260827000169_sia_wag_foundation.sql` |
| `sia.wag_raw_events` | 2026-08 to 2027-03 | **1 March 2027** | same |
| `member.member_events` (was `client_events`; renamed in 0202, moved to `member` in 0211) | 2024-01 to 2027-03 | **1 March 2027** | `20260915000194_client_twin_and_queendoms.sql` (the loop) |
| `sia.ticket_events` | 2026-09 to 2027-12 | **1 December 2027** | `20260915000195_sia_tickets.sql` (the loop) |

```sql
-- repeat per month, per table
CREATE TABLE sia.wag_messages_2027_04 PARTITION OF sia.wag_messages
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
```

The partitions of `member_events` carry the `member_events_YYYY_MM` names since the rename.

### 2. The watcher phone must come online every two weeks or so

WhatsApp unlinks companion devices when the primary phone stays offline too long. Someone turns
the watcher phone on and opens WhatsApp on Wi-Fi. If it lapses, the Sia alarm fires
`session_lost`, and the fix is the QR in Serene → Sia → gear icon → Session.

### 3. Baileys v8: do NOT upgrade casually

The watcher runs Baileys 7.0.0-rc14 (checked in `connector/package.json`). Version 8 changes the
auth-state format and needs an offline migration of `sia.wag_auth_state` first; an unmigrated
client cannot connect at all. When v8 lands: read its migration guide, migrate the auth table,
then upgrade. Never just bump the package.

### 4. `BRAIN_API_SECRET` lives in FOUR places that move together

`backend/.env` (local brain), `.env.local` (local Next), Vercel Production (the app), and SSM
`/copilot/serene/prod/secrets/BRAIN_API_SECRET` (the Fargate brain). A drift makes the brain's
calls 401 at the bridge (it happened 2026-08-30, when SSM held an older value). Rotate all four in
one sitting, then force a new `api` deployment so the task re-reads SSM.

### 5. Trigger.dev CLI stays pinned to the SDK version

`trigger.dev`, `@trigger.dev/sdk` and `@trigger.dev/build` are all 4.4.6. Deploy with
`pnpm trigger:deploy` (or `npx trigger.dev@4.4.6 deploy`). A newer CLI refuses a mismatched
project. If you upgrade the SDK, move all three together and update the pin in
`connector/RUNBOOK.md` and here.

### 6. The Node brain's retirement date: 2026-10-16

Both Elaya channels think in the Python brain; the Node thinking loop is frozen and kept only as
the one-row rollback. The Decision Log (`../rules/The_Rules.md`, 2026-09-16) sets the retirement
for 2026-10-16, gated on thirty clean days on Python with the switch unused. On that date: check
the gate, then ship the retirement PR the Decision Log describes. Details:
`../modules/elaya.md`.

## Keys, limits and settings that need care

- **The Anthropic account's monthly spend limit is shared by everything.** Elaya on both
  channels, the profiler, intake, the sentinel, the vendor extractor, the brief, alerts, the deep
  read, the lesson writer and the member judgements all draw on one account. On 2026-09-18 it hit
  its limit (80 dollars then): Elaya went silent for twelve hours and the profiler and intake had
  to be switched off and their bookmarks rewound. Watch the month's spend, raise the limit before
  big reads, and remember the profiler's history read is the big spender. The deep read has its
  own cap (the `elaya_deep_read_spend_cap_usd` settings row, default 50 dollars; above it the read
  stops and asks).
- **Every active staff profile needs a phone.** `profiles.phone` is the only way Elaya's WhatsApp
  gate, the staff contact link and the WhatsApp alerts recognise a person. A blank phone turns a
  staff member's message into a new lead (2026-09-22). Check the phone at onboarding, and after
  any hand edit of a profile. The Sia alarm's tier-1 list (`src/lib/constants/sia-alerts.ts`)
  notes one responder with no phone. TODO: verify which responders now have one.
- **`TRIGGER_SECRET_KEY` on Vercel must be the `tr_prod_` key.** A wrong key fails every run the
  website arms, silently (2026-09-21). After any change, count new runs on the Trigger.dev side.
- **The Trigger.dev worker has its own env.** Every var a background job needs must be set there
  too (`environments.md`). TODO: verify the `GUPSHUP_*` vars are there (a 2026-09-22 note found
  them missing).
- **The member vault key never goes in the database.** Rotation uses `MEMBER_VAULT_KEY_VERSION`
  and `MEMBER_VAULT_KEY_PREVIOUS` (`environments.md`). Losing the key loses every stored card and
  document for good.
- **The Freshdesk API key is a personal agent key.** It is tied to one Freshdesk agent account;
  if that account is removed, the mirror stops.
- **The Supabase CLI login expires.** Renew it with `supabase login` before a push (it had lapsed
  on 2026-09-21 when a migration was ready).

## Paused on purpose (revisit when the founders ask)

- **Founder WhatsApp on every new lead:** `FOUNDER_LEAD_ALERTS_PAUSED = true` in
  `src/lib/constants/whatsapp.ts` (2026-09-21). Set to false and deploy to resume.
- **Founder lead and SLA notifications:** the founders' `notification_preferences` rows mute
  `sla_escalation` (in-app and WhatsApp), `new_lead_founder_alert` (WhatsApp) and `lead_won`
  (in-app) (2026-09-23, data only). Each founder can turn them back on from /profile.
- **Switches that ship off:** the live alert sweep (`elaya_alerts_enabled`) and the brief
  (`daily_briefing_enabled`) run only when their `elaya_settings` row is `true`. Current values
  live in the table; see `../integrations/trigger-dev.md` §3.

## Open items (as of 2026-09-26)

- [x] ~~Founder phone numbers missing.~~ Decided 2026-08-31: the founders' WhatsApp leg of the
  Sia alarm stays dormant by choice. The alarm reads `profiles.phone` at send time, so a founder
  who adds a number starts receiving the one-hour escalation with no code change.
- [ ] **Link the remaining Sia groups.** Largely done: every group has a type (465 member, 24
  internal), and 401 member groups are linked to their member (2026-09-18). Left then: 64
  member-type groups unlinked (mostly spelling variants and members not in the list yet) and 213
  members without a group (69 of them Active). Mapping lives at Serene → Sia → gear icon → Group
  mapping and `scripts/import-members-and-map-groups.py`. TODO: verify today's counts.
- [x] ~~Media backlog draining.~~ Drained 2026-08-30: 12,580 recovered, 2,345 expired on
  WhatsApp's side, 0 lost.
- [ ] **Retire the last interim cast in `sia-service.ts`.** `database.ts` was regenerated from
  production across all schemas on 2026-09-17, but the cast marked "retire at next regen" (the
  0177 columns, around line 671) is still there. Remove it and let the types carry the columns.
- [ ] **Sia live-tail polish (candidate).** A reaction, edit or delete on a message already on
  screen shows only after reopening the chat. Known pilot trade-off, not data loss.
- [ ] **Lock the brain load balancer to CloudFront (candidate).** The `api` ALB still has its
  plain-HTTP listener open to the internet (bearer-gated, so not an open door). CloudFront
  (`dvoitvfdf56l3.cloudfront.net`) is the only path production uses. Options: restrict the ALB
  security group to CloudFront's origin-facing prefix list, or require a secret origin header in
  FastAPI. Copilot owns the security group, so do it through the manifest, not by hand. Until
  then, always call the brain through CloudFront so the bearer never crosses in cleartext.
- [ ] **Possible-ban alert (candidate).** A WhatsApp ban (disconnect code 403) still surfaces as
  the generic `unreachable` alarm after 15 minutes. A distinct "possible ban, do not retry,
  investigate" alert would be clearer.
- [ ] **Settle the revival sweep's time.** `sweep-revival-candidates` fires at 02:00 IST; its
  comment, root `CLAUDE.md` and the health-check SQL say 07:30 IST
  (`../integrations/trigger-dev.md` §3b).
- [ ] **Update `scripts/engine-health-check.sql` for the `gia` schema.** It names
  `lead_sla_timers`, `whatsapp_notification_logs` and `revival_candidates` without a schema, and
  those moved to `gia` on 2026-09-17. Until it is fixed, run it with the search path set
  (`engine-health-check.md`).
- [ ] **Sync `.env.example`** with the missing names listed in `environments.md`.

---

## Where the operational knowledge lives

| Topic | File |
| --- | --- |
| Watcher pairing, session SQL, number replacement, outage math | `connector/RUNBOOK.md`, `../integrations/sia-connector.md` |
| The Sia alarm: conditions, cadence, escalation | `connector/RUNBOOK.md` (alarm section), `src/trigger/sia-silence.ts` header, `../integrations/trigger-dev.md` §6 |
| Every background job and its switch | `../integrations/trigger-dev.md` |
| Env vars and where each must be set | `environments.md` |
| Deploys (app, migrations, jobs, brain, watcher) and how to prove them | `deployment.md` |
| Is the SLA / reminder engine firing? | `engine-health-check.md` |
