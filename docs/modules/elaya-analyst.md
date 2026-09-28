# Elaya, the analyst

> **Purpose:** the founder and admin intelligence layer on top of Elaya: ask the database, the live pulse, the twice-daily brief, the live alert sweep, the deep read with its saved labels, and the one-call member picture.
> **Audience:** engineers, and the founders who want to know what she can work out and what it costs.
> **Source-of-truth scope:** these six capabilities, their locks, switches, schedules and costs. Elaya's core (access, brains, tools, confirmation, persona, memory) lives in [elaya.md](elaya.md). Trigger.dev schedules and deploys live in [../integrations/trigger-dev.md](../integrations/trigger-dev.md).
> **Last verified:** 2026-09-26 against `src/lib/services/elaya-query-service.ts`, `pulse-service.ts`, `elaya-briefing.ts`, `elaya-alerts.ts`, `elaya-deep-read.ts`, `elaya-jobs-service.ts`, `src/lib/elaya/elaya-data.ts`, `src/lib/constants/elaya-metrics.ts`, `elaya-jobs.ts`, `elaya-briefing.ts`, `src/trigger/elaya-*.ts`, and migrations 0223, 0224, 0225, 0231, 0235.

---

## 1. What this layer is

Elaya's ordinary tools answer questions somebody built a tool for. The founders ask questions
nobody built a tool for ("which genie handled the most Freshdesk tickets in August and how long did
they take"), want to know what is happening without asking, and sometimes ask a question whose
answer is in no column at all ("how many tickets were about health and wellness"). This layer
covers those three needs.

| Capability | Who | Runs as | Switch | Since |
| --- | --- | --- | --- | --- |
| Ask the database (`describe_database`, `query_database`) | admin, founder | chat tools | none (always on for the role) | 2026-09-19 (0223) |
| Live pulse (`get_live_pulse`) | admin, founder | chat tool | none | 2026-09-19 (0224) |
| The one-call member picture (`get_member_360`) | all staff, gated by seat | chat tool | none | 2026-09-19 |
| Twice-daily brief | active founders | Trigger.dev, 10:00 and 18:00 IST | `daily_briefing_enabled` (seeded false; **on** in production since 2026-09-19) | 2026-09-19 (0225), rewritten 2026-09-24/25 |
| Live alert sweep | founders; tech for silent turns | Trigger.dev, every 5 minutes | `elaya_alerts_enabled` (seeded false; **off** in production) | 2026-09-24 (0235) |
| Deep read and saved labels (`start_deep_read`) | admin, founder | Trigger.dev job | spend cap `elaya_deep_read_spend_cap_usd`; nightly top-up `elaya_labels_refresh_enabled` | 2026-09-24 (0235), no size limit 2026-09-25 |

The live values of the switches are rows in `elaya_settings`; this doc gives the seed and the
default, not today's production state. Check the row before assuming a feature is on.

In the Python brain these tools sit in the `analyst` specialist (the `heavy` tier, offered by the
router only to admin and founder) and the `analytics` specialist; with tool search they are
reachable from any specialist for those roles. See [elaya.md](elaya.md) section 5.2.

---

## 2. Ask the database (0223)

The model reads a catalog, writes its own read-only SQL, looks at the result, and writes the next
query, then answers with one line on how it worked the answer out. Safety does not depend on the
prompt. Four independent locks:

1. **A login-less role.** `elaya_reader` (NOLOGIN) can see one schema, `elaya_read`, and has no
   rights on any real table.
2. **Clean views with explicit columns.** `elaya_read` holds 41 views (plus `data_dictionary`, the
   catalog of them) over leads, deals, tasks, staff, members and their facts, WhatsApp groups and
   messages, Sia tickets, Freshdesk, vendors, subscriptions, AI runs and the deep-read labels. No
   phone, email, password, login, raw payload or WhatsApp id (groups and senders are md5 ids); long
   text is cut short. A column added to a table later is invisible until a migration adds it here.
3. **The runner.** `elaya_read.run()` executes as that role, in a READ ONLY transaction, wrapped
   as a sub-select so it can only ever be one SELECT (or WITH ... SELECT). No semicolons, no
   comments, no schema-qualified names, a list of dangerous functions refused, a row cap, and
   PostgREST's 8-second statement timeout.
4. **One door.** `public.elaya_run_query()` is callable by the service role only. The Node side
   (`runElayaQuery` in `elaya-query-service.ts`) is reached only through the founder/admin tools,
   logs every call to `public.elaya_query_log` (who, channel, purpose, SQL, ok, rows, duration;
   append-only, no user policies), and masks the result again with `maskPii` before the model sees
   it.

The migration was rehearsed on production inside a rolled-back transaction before it was applied:
real questions ran and fourteen attacks (raw tables, phones, writes, sleep, a second statement,
escaping the role) were refused.

| Tool | What it does |
| --- | --- |
| `describe_database` | `getElayaCatalog()`: every view, what it holds and its columns, as one compact block that fits the 12,000-character tool cap. Without a `views` argument it also returns the **verified metrics** and the **saved label sets** with their coverage |
| `query_database` | `queryDatabaseFor` → `runElayaQuery`: default 100 rows, at most 300 in chat. Exact tools stay the first choice, because their numbers equal the pages |
| `export_rows` (MCP only) | the same runner up to 5,000 rows as CSV for an outside AI app's sandbox (0231 raised the SQL clamp from 500 to 5,000); logged as `export: <purpose>`. See [../integrations/mcp.md](../integrations/mcp.md) |

**Verified metrics** (`src/lib/constants/elaya-metrics.ts`, 2026-09-24): the founders' definitions
with one working query each, every one run against the door before shipping, so the same question
gets the same number: `active_members_by_queendom`, `members_waiting_on_us`,
`response_time_by_queendom`, `freshdesk_by_queendom`, `members_frustrated`, `renewals_with_usage`.
Add one when a founder question has been answered two different ways. Never add a query that has
not been run. The tool also tells the model to default to the last 30 days and say so.

**Adding data for the analyst** is a new view in a migration, with an explicit column list and a
`COMMENT` (the comment becomes the catalog's "about"). Never `select *`, never a phone, email,
password or WhatsApp id.

---

## 3. The live pulse (0224)

`get_live_pulse` → `getLivePulse()` in `src/lib/services/pulse-service.ts`. One company-wide
picture, so the caller gates (admin, founder). About 1.6 seconds. Built from reads that already
exist, each section failing soft to `null`:

| Section | Source |
| --- | --- |
| Sales today (new leads by domain, not yet contacted, calls, deals, revenue) | one read-only query over the `elaya_read` views |
| Work (overdue tasks, open Sia tickets, open ticket suggestions) | the same query |
| Members (who is waiting on a reply, group messages today, occasions in 7 days, renewals in 14) | the same query + `getWaitingGroups` |
| Freshdesk (open, created and resolved today, escalated) | `getFreshdeskOverview()`, the same numbers as the `/freshdesk` strip |

**`getWaitingGroups(minMinutes, maxHours)`** is THE "who is waiting on us" read, shared by the
pulse, the brief and the alert sweep. It calls `sia.groups_waiting_for_reply()` (0224, service
role only): linked member groups where the member had the last word. A last word that is only an
acknowledgement ("ok", "noted", "thanks", "copied", "received") is not counted, by intake's
`isOnlyAcknowledgement` rule. The pulse looks back 30 days (was 24 hours until 2026-09-24: a
member who has waited a week is the one who matters most) and shows the longest 8.

---

## 4. The one-call member picture (`get_member_360`)

The first call for any question about a member. `getMember360For(principal, nameOrId)` in
`elaya-data.ts` composes the member reads that already exist into one live picture: identity and
team, health, the state of the conversation right now (who spoke last, waiting on us or not), the
latest messages, open and recent Freshdesk requests, open Sia tickets and suggestions, what is
coming up, every current fact by facet, people, relations, timeline, observations, vendor jobs,
deals and money. A name in: one match opens, several come back as candidates, a match outside the
seat says so.

It is gated by the queendom rule inside (so it is an all-staff tool), carries a 24,000-character
allowance (mirrored in the Python loop) and fits itself under about 22,000 by shortening lists,
never by dropping a section. Money follows `canSeeMemberFinance`: the Joker head gets no finance
and no deal amounts. The member data itself is described in [members.md](members.md).

---

## 5. The twice-daily brief (0225, rewritten 2026-09-24 and 09-25)

`runBriefingSweep(slot)` in `src/lib/services/elaya-briefing.ts`, run by
`src/trigger/elaya-briefing.ts`:

| Task id | Cron (IST) | Window it covers |
| --- | --- | --- |
| `elaya-briefing-morning` | 10:00 | yesterday 18:00 to 10:00 |
| `elaya-briefing-evening` | 18:00 | 10:00 to 18:00 |

Both check `daily_briefing_enabled` first (off unless the row is exactly `true`; seeded `false` by
0225). No Gia leads or deals, by the founders' decision.

**Gather** (`gatherBriefingData`): the window's raw record through the read-only door. Freshdesk
per queendom (queendom groups only, never Shop or Finance): tickets created in the window, tickets
that went overdue in the window, and the notable ones (escalated, urgent, reopened) from the
movement ledger. Every message in member and internal groups with who waited how long for a staff
reply (capped per group and at 110,000 characters); the reply-gap read covers member groups only,
internal groups are context. Who is waiting now (`getWaitingGroups`), the profiler's tone reads,
intake's feedback cards, occasions and trips due, renewals within 7 days, staff load and Freshdesk
resolutions per agent, Sia tickets, and Zoho (money received and invoiced, receivables, the
uncategorised bank feed). A `meaning` block states every number's time frame. Staff are named the
way the team says them (`staffShortName`: "Ajith at Indulge" is Ajith); a company-only display name
resolves by sender id through `STAFF_SENDER_NAMES` (`src/lib/constants/elaya-briefing.ts`, filled
by hand).

**Write** (`reasoning` tier, prompt `briefing-v4`, 2,500 tokens): say only what matters, usually
12 to 25 lines, never over 40, no line over 30 words, a section with nothing to say is left out.
The sections, in order: **Needs you today** (1 to 5 things to save or decide, each with what to
do), **Going well**, **By queendom** (one line each: "Anishqa: 30 new tickets, 12 went overdue;
the one thing to fix today"; both numbers are the window's, never a backlog or an all-time figure),
**Where service can be better**, **Team** (at most 4 lines), **Internal team** (what staff told
each other: decisions, plans, money, vendor matters; never a reply gap), **Money** (only what
changed), **Today** (occasions, trips, renewals). If the model fails, `plainBriefing()` sends a
plain numbers version (fails open).

**Deliver**, to every active founder:

1. Their Elaya conversation, as an assistant message (`meta.brain = 'briefing'`), so "tell me
   more" has it in context.
2. WhatsApp: free text split into parts when their 24-hour window is open
   (`waFreeTextWindowOpen`), otherwise one template ping (`sendElayaTemplatePing` over the Sia
   alert template, a one-line digest).
3. An in-app notification linking to `/elaya`.

Every run writes one `sia.extraction_runs` row (kind `briefing`). A dry run on production read
1,612 messages in 149 groups in about 37 seconds; the v4 writer produced 30 lines in 34 seconds.

---

## 6. The live alert sweep (0235)

`runAlertSweep({apply, deadlineMs})` in `src/lib/services/elaya-alerts.ts`, run by
`src/trigger/elaya-alerts.ts` (task `elaya-alerts`, every 5 minutes, one at a time). Off unless
`elaya_alerts_enabled` is exactly `true` (seeded `false`). The bookmark lives in
`elaya_alerts_state`.

| Kind | Fires when | Goes to |
| --- | --- | --- |
| `unanswered` | a member's last word has stood unanswered 60 minutes (looks back 7 days; only between 08:00 and 23:00 IST) | founders |
| `ticket_escalated`, `ticket_reopened` | a Freshdesk ticket escalated, went urgent or was reopened since the last sweep (from the movement ledger) | founders |
| `tone` | a member group with new member messages (settled 2 minutes) is read by the `routing` tier for anger, a complaint, a visible mistake or an urgent same-day matter; severity 2 or 3 fires; at most 30 groups a sweep | founders |
| `silent_turn` | a message to Elaya with no reply after 3 minutes | the tier-1 responders (`SIA_ALERT_TIER1_PROFILE_IDS`, a named list of people, not a role) through the Sia alert template and in-app, never founders. See [sia.md](sia.md) |

Each alert is written to `elaya_alerts` first; its `dedupe_key` is UNIQUE, so one incident never
fires twice, and the same kind for the same group waits out a 6-hour cooldown. Founders get
WhatsApp free text inside their 24-hour window, else the template ping, plus in-app. The sweep
fails closed: a read that throws alerts nobody, and the bookmark still moves. Email to the tech
inbox waits on an email provider the repo does not have. Numbers: `src/lib/constants/elaya-jobs.ts`.

---

## 7. The deep read and saved labels (0235)

For a question no column answers, where thousands of rows must be read and judged. A founder or
admin asks in chat; the `start_deep_read` write tool (inline, admin/founder) creates an
`elaya_jobs` row and fires `src/trigger/elaya-deep-read.ts` (task `elaya-deep-read`, two at a time,
25-minute budget per run). `runDeepRead(jobId)` in `src/lib/services/elaya-deep-read.ts`:

1. **Plan** (`reasoning` tier): which rows, which labels (at most 12), the rule. The label sets on
   record are shown first, so the same question reuses the same name, labels, rule and query; a
   different label list under a known name becomes `_v2`, so two rules are never counted together.
   Windows are written relative to `now()`. The fetch query is probed before anything is paid for.
2. **Count** with `count(*)`, for the estimate and the coverage proof. A count that times out is
   "not verified" and the read goes ahead.
3. **Fetch** through the same read-only door as `query_database`, keyset-paged 5,000 at a time (a
   page that hits the timeout is halved, down to 500), de-duplicated on the subject.
4. **Reuse**: a row whose whole text still equals the evidence its saved verdict rested on keeps
   it; only new or changed rows are judged.
5. **Money check**: rows to judge × $0.08 per 1,000. Above the spend cap
   (`elaya_deep_read_spend_cap_usd`, default $50 when the row is missing; 0 means always ask) the
   job stops and asks in the chat; `start_deep_read` with `confirm_spend: true` runs it once the
   founder agrees. A read expected to take 3 minutes or more posts a "this one is big" line first.
6. **Judge** (`routing` tier, masked): 100 rows a call, 12 calls side by side behind a shared rate
   gate. A 429 or "overloaded" pauses every worker (the provider's retry-after, or a doubling pause
   up to a minute) instead of failing, so live chats on the same account are not starved. Verdicts
   are saved after every batch. Rows still unjudged get up to 3 more passes.
7. **Continue**: near the end of a run's budget the job saves where it got to, queues a new job with
   the same plan and cost so far, fires it, and posts "still reading". There is no row cap and no
   refusal for size.
8. **Answer** (`reasoning` tier): the counts and breakdowns are built in code, the model writes the
   answer, which names reused rows, states coverage when a read came up short (after one re-read),
   and ends with what it cost in rupees.
9. **Deliver** on the channel it was asked on: an assistant message in the conversation, WhatsApp
   in parts, and an in-app notification. A failed job says so on the same channel.

Every run writes a `sia.extraction_runs` row with tokens and cost. Real per-stage timings go into
the job's `progress`.

**Labels.** `elaya_labels` holds one label per subject per label set (`UNIQUE (subject_kind,
subject_id, label_set)`, a re-read replaces). Subjects: Freshdesk ticket, member, WhatsApp group,
lead, Sia ticket, WhatsApp message, vendor. The view `elaya_read.labels` lets `query_database` count
them, so "how many this week" is a plain query when the saved set covers the window, and a deep
read only when it does not. `describe_database` lists each set with its coverage.

**Nightly top-up.** `src/trigger/elaya-labels-refresh.ts` (task `elaya-labels-refresh`, 05:30 IST)
runs `planLabelRefresh()`: one `refresh` job per label set asked about in the last 30 days (at most
20), judging only rows it has not seen and delivering nothing. On unless
`elaya_labels_refresh_enabled` is exactly `false` (no seed row; a failed read also means on).

**Costs measured on production:** a fresh 4,689-ticket question in 31 seconds for about ₹21
($0.335 for 4,694 rows, plan and answer included, which set the $0.08 per 1,000 rows estimate); a
repeat of the health-and-wellness question reused 4,618 verdicts and judged 36 new tickets in 21
seconds; a nightly top-up of 570 already-judged tickets in under 3 seconds.

Tables and access (`elaya-jobs-service.ts`, admin client):

| Table | Holds | Read access |
| --- | --- | --- |
| `elaya_jobs` | the question, plan, progress, result, answer, status (`queued`, `running`, `done`, `failed`) | the requester their own; admin and founder all |
| `elaya_labels` | the verdicts, with confidence and evidence | admin and founder |
| `elaya_alerts` | every alert fired and how it was delivered (append-only) | admin and founder |

---

## 8. Switches and schedules at a glance

| `elaya_settings` key | Default | Production, 2026-09-26 | Meaning |
| --- | --- | --- | --- |
| `daily_briefing_enabled` | seeded `false` | **`true`** (since 2026-09-19) | the brief sends only when exactly `true` |
| `elaya_alerts_enabled` | seeded `false` | **`false`** (set 2026-09-24) | the sweep runs only when exactly `true` |
| `elaya_alerts_state` | seeded `{}` | (bookmark) | the sweep's bookmark (`last_sweep_at`) |
| `elaya_labels_refresh_enabled` | no row = on | no row, so **on** | the nightly top-up stops only when exactly `false` |
| `elaya_deep_read_spend_cap_usd` | no row = 50 | no row, so **$50** | above this estimate a deep read asks first |

The production column was read from `public.elaya_settings` on 2026-09-26. For the switches
outside this doc, the same read found both brains on `python`, `member_profiler_enabled` and
`ticket_intake_enabled` `true`, and no row for `member_assessment_enabled` or
`intake_lessons_enabled` (both on by default).

| Trigger.dev task | File | When |
| --- | --- | --- |
| `elaya-briefing-morning`, `elaya-briefing-evening` | `src/trigger/elaya-briefing.ts` | 10:00 and 18:00 IST |
| `elaya-alerts` | `src/trigger/elaya-alerts.ts` | every 5 minutes |
| `elaya-deep-read` | `src/trigger/elaya-deep-read.ts` | on demand, fired by `start_deep_read` or a continuation |
| `elaya-labels-refresh` | `src/trigger/elaya-labels-refresh.ts` | 05:30 IST |

A new or changed task needs `pnpm trigger:deploy`; see
[../integrations/trigger-dev.md](../integrations/trigger-dev.md). The WhatsApp sends from Trigger.dev
need the Gupshup variables in the Trigger.dev environment, not only on Vercel (the 2026-09 triage
found briefs failing on WhatsApp for this reason). TODO: verify the Trigger.dev environment carries
them today.

---

## 9. Rules for changing this layer

- A number the founders see must equal the page's number. Prefer the exact tool; add a verified
  metric when the SQL path gives a different answer than expected.
- Never present a keyword count as a judgement. A question about meaning goes to the deep read.
- Every number carries its time frame. No window given means the last 30 days, stated.
- Every model call goes through the Elaya provider and `maskPii`; every row read goes through the
  read-only door, so a background job can see nothing the analyst tool cannot.
- A new view is a migration with explicit columns and a comment, never a code change.
