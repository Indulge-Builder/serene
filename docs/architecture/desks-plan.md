# Desks plan: Elaya on every table, out loud and on the wall

> Written 2026-09-28. Status: **plan only, nothing built.** Decisions the founder must make are
> marked **Decide**. Everything else is my recommendation and I will build it exactly as written
> unless told otherwise.

Read `docs/modules/elaya.md` (the channels and the alert sweep) and `docs/architecture/hands-plan.md`
(the outbox law this plan copies) first. The voice channel built today (migration 0247,
`backend/voice/agent.py`) is the ear this plan reuses; it is not rebuilt here.

---

## 1. The idea in one paragraph

Each concierge queendom sits at a table. On that table there is an Alexa speaker, and on the wall
near it a TV. Elaya uses both. She speaks an alert to the table the moment a member of that queendom
is left waiting or sounds unhappy. The founder types one line in Serene and every speaker in the
office says it. Anyone at the table asks "Alexa, ask Elaya who is waiting" and hears the answer for
their own queendom, never another. The TV is a calm, always-on board of that queendom's day: who is
waiting, what is due, what Elaya just said, and a full-screen moment when something needs the
table now. Nothing new is invented for the brain. A speaker is one more mouth on the alerts and
the brief; a spoken question is one more ear on the same brain the app and WhatsApp already use.

A real-world picture. It is 11:40 at the Anishqa table. The alert sweep finds that the Kapoor
group has waited 62 minutes. Serene writes one row to the desk outbox for the Anishqa devices.
Three seconds later the table's Echo says: "Elaya here. The Kapoor group has been waiting an hour
for a reply." The TV on the wall shows the same line large for twenty seconds, with the group name
and the wait, then returns to the board. A genie opens Sia. At 12:05 the founder types "Lunch is on
the house today" on the Desks page, picks "All tables", and presses Send. Every Echo chimes and
speaks it; every TV shows it under the founder's name. At 15:10 someone asks "Alexa, ask Elaya what
is due today." The skill calls Serene, Serene asks the brain as the Anishqa table device, and Alexa
reads out the three tickets due. The whole exchange is in the device's own Elaya conversation,
readable in `/elaya` by an admin.

---

## 2. Five facts that decide the architecture

1. **A Google speaker cannot be reached from the internet; an Alexa can.** Google Home accepts
   audio only from a device on the office Wi-Fi and closed custom voice apps in 2023. Amazon still
   allows custom skills, and Voice Monkey (a paid service, `voicemonkey.io`) lets a server speak
   any text on any Echo signed into an Amazon account. So the speakers are Alexa. The single Google
   Home stays for music or is retired. No box is needed in the office.

2. **Every door into Elaya is keyed to a profile.** `elaya_conversations.user_id` is NOT NULL and
   points at `profiles` (0116:27). The Python brain re-reads the profile and refuses inactive
   users (`backend/app/brain/principal.py:48`). The queendom scope is re-read from the profile at
   call time (`elaya-data.ts:397-408`), never trusted from the caller. So a table device is a
   profile: a real account, seated as a genie of its queendom, that only a machine logs in as.
   Nothing about scoping changes; the device sees exactly what a genie of that queendom sees.

3. **Alexa gives a skill eight seconds to answer, and cannot tell who is speaking.** A
   database look-up plus a model turn is often slower than that. So a spoken question is answered
   in two ways: fast answers are spoken at once; slow ones get "Give me a moment" and the answer is
   spoken to the same speaker a few seconds later through the outbox. And because anyone near the
   table can ask, the device's reach is the queendom's read reach, and a "never say aloud" list
   (section 5) keeps money and identity off the air.

4. **The alert sweep already finds everything worth saying.** `elaya-alerts.ts` fires unanswered
   members, unhappy tone, escalated and reopened tickets, every five minutes, deduplicated by key,
   recorded in `elaya_alerts` first. Today it delivers to founders only (`:294`). The tables never
   hear it. This plan adds a fourth delivery: the queendom's own devices. No second detector.

5. **One sender, one ledger.** Everything a speaker says or a TV shows is first a row in a
   `desk_outbox` table, exactly like `hands.outbox` (0245). One Trigger.dev task sends outbox rows
   to Voice Monkey; the TV reads the same rows over Realtime. If Voice Monkey is down the row
   stays queued and the TV still shows it. If a device id is not on our allow-list the row is
   refused, never sent. The law from the hands plan applies unchanged: nothing in `src/` speaks
   to a speaker except through a queued row.

---

## 3. Devices, plainly

| Device | What it is in Serene | How it gets identity |
| --- | --- | --- |
| Echo on a queendom table (3, one per queendom) | a `desk_devices` row, kind `alexa`, with the queendom | a device profile (genie of that queendom); the Echo's Alexa `deviceId` is stored on the row |
| TV by a queendom table (2 today) | a `desk_devices` row, kind `tv`, with the queendom | the TV's browser is signed in as the same device profile as the table's Echo |
| Founder cabin TV (**Decide**) | a `desk_devices` row, kind `tv`, no queendom | signed in as the founder's own account, so it shows the company pulse |
| Google Home | not a Serene device | music only, or retired |

All three Echos are signed into **one Amazon account owned by Indulge**. That account is also the
Alexa developer account, so the "Elaya" skill stays in development mode on it and never goes to the
Skill Store. Amazon closed "Alexa for Business" in 2023, so there is no private-distribution
route; the one-account route is the honest one and needs no review from Amazon.

**Decided 2026-09-28.** The Indulge Amazon account exists (with AWS and Prime). All three Echos
sign into it, and the Alexa developer console is opened with the same login.

---

## 4. Data: two tables, two settings

Migration `0248_desk_devices.sql`, all under `public`, RLS on.

`public.desk_devices`
- `id uuid`, `kind text CHECK (alexa | tv)`, `label text` ("Anishqa table"), `queendom_id uuid`
  references `sia.queendoms` (null = company-wide, founder TV only), `profile_id uuid` references
  `profiles` UNIQUE (the device account), `alexa_device_id text UNIQUE` (from the skill request;
  null for a TV), `voicemonkey_device text` (the name the Voice Monkey API knows the Echo by),
  `is_active bool`, `last_seen_at timestamptz`, `created_at`.
- RLS: SELECT admin/founder; writes service role. The device profile itself may read its own row.

`public.desk_outbox` (the ledger; the hands outbox posture)
- `id uuid`, `kind text CHECK (announcement | alert | answer | reminder)`, `severity smallint 1..3`,
  `audience jsonb` (`{all:true}` or `{queendom_id}` or `{device_id}`), `title text`, `body text`
  (what the TV shows), `spoken text` (what the speaker says; shorter, no markdown),
  `source text CHECK (human | elaya | sweep)`, `created_by uuid` (the human, null for the machine),
  `alert_id uuid` references `elaya_alerts`, `conversation_id uuid` (for an `answer`),
  `status text CHECK (queued | sent | failed | refused)`, `sent_to jsonb` (device ids that got it),
  `error text`, `not_before timestamptz` (a reminder), `expires_at timestamptz` (a stale alert is
  never spoken late), `created_at`, `sent_at`.
- Status is the ONE column that changes (queued → sent/failed/refused), the same A-11 carve-out the
  hands outbox holds. Nothing else on the row is ever updated. No DELETE.
- RLS: SELECT admin/founder, and a device profile reads rows whose audience includes it
  (`audience->>'queendom_id' = its queendom`, or `all`, or its own device id). Writes service role.
- Index on `(status, not_before)` for the sender; index on `(created_at DESC)` for the TV tail.

`elaya_settings` seeds: `desks_enabled = false` (the kill switch, read like `hands_enabled`) and
`desks_quiet_hours = {from: 21, to: 8}` IST (nothing is spoken in the window; announcements from a
human still go out, alerts wait and expire).

Also: `elaya_messages.meta.device_id` on every device turn, so a transcript says which table asked.

---

## 5. The "never say aloud" law

The speaker is in an open room; a TV is on a wall. The line that reaches them is written by a
narrow function, `speakableFor(kind, input)` in `src/lib/services/desk-speech.ts`, and that
function is the only writer of `desk_outbox.spoken` and `body`. It knows:

- **Money never.** No amount, no balance, no invoice, no budget. A ticket with money says "a
  payment is pending".
- **Identity never.** No phone, no card, no ID, no address, no email. The vault never reaches it
  by construction (the vault reaches no tool result either).
- **Members by group name or first name.** **Decide 2:** the member's first name ("Riya"), or the
  group's name only ("the Kapoor group")? The group name is what the team already says out loud at
  the table; I recommend it.
- **Staff by first name.** The `staffShortName` rule from `constants/elaya-briefing.ts`.
- **One sentence per alert, two at most.** A speaker that talks too much is unplugged.
- **Every spoken line starts "Elaya here."** at severity 3 and "Elaya." otherwise, so the room
  knows who is talking. An announcement starts "Announcement from <first name>."
- **A spoken answer to a question** passes `maskPii` at depth `full` on top of the normal tool
  masking, then a last pattern gate for digit runs (the Luhn and phone shapes the media reader
  already nulls), because the brain's answer was written for a screen.

This is the desk twin of `HANDS_DISCLOSURE`: the constants live in `src/lib/constants/desks.ts`
as `DESK_NEVER_SPOKEN` (the field list) and the pattern gate reuses `looksSensitive` from
`media-reader.ts` rather than a second copy.

---

## 6. What each device does

### 6a. The speaker hears alerts (the sweep's fourth delivery)

In `runAlertSweep`, after `record(a)` and the founder delivery, one new step: if the alert has a
`member_id` or `group_jid` whose member has a `queendom_id`, call `queueDeskMessageCore` with
kind `alert`, audience `{queendom_id}`, the severity, and `speakableFor('alert', a)`. Ticket
alerts carry the ticket's queendom the same way. Silent-turn alerts (audience tech) never reach a
table. The `elaya_alerts` row's `delivered` jsonb gains a `desk` count.

Quiet hours and `desks_enabled` are checked in the core, not in the sweep, so every caller is
gated the same way. `ALERT_ACTIVE_HOURS_IST` stays as it is for founders.

This step needs `elaya_alerts_enabled = true`. It has been off since 0235 (2026-09-24). Turning
it on fires WhatsApp to founders too; **Decide 3:** turn the whole sweep on, or add
`elaya_alerts_founder_whatsapp = false` so only the tables and in-app hear it at first. I
recommend the second for the first two weeks.

### 6b. Announcements: the founder speaks to every table

Page `/desks` (admin/founder; in the Settings family, one door in the Elaya settings). One card:
a message box, a target (All tables / one queendom / one device), a "Say it on the speakers"
tick (default on) and Send. Below it the ledger: what was said, by whom, when, to which devices,
sent or failed. Send → `sendDeskAnnouncementAction` → Zod → `requireProfile(['admin','founder'])`
→ `sanitizeText` → `queueDeskMessageCore(kind 'announcement', source 'human')` → `after()` runs
the sender once for immediacy → `revalidatePath('/desks')`. The sweep is the retry.

Managers who hold a queen seat may later announce to their own table only (a second **Decide**,
not in this plan).

### 6c. Reminders: the table asks Elaya to remember

"Alexa, ask Elaya to remind us at four to call the Sharma group." The brain already has
`create_personal_task` and the task-reminders delayed tasks (`src/trigger/task-reminders.ts`).
A device turn that creates a task with a due time also queues a `desk_outbox` row of kind
`reminder` with `not_before` = the due time and audience = the device. The sender speaks it when
due. Nothing new in the brain: it is a `channel === 'voice'` branch in `create_personal_task`
that adds the outbox row when the principal is a device profile. Native Alexa alarms and timers
("Alexa, set a timer") keep working as they do, outside Serene.

### 6d. Ask Elaya (the skill)

The skill is Alexa-hosted (Amazon's free Lambda) and does one thing: it forwards every request to
`POST /api/webhooks/alexa` with a shared secret header, and speaks whatever text comes back. The
Serene route follows `src/app/api/webhooks/CLAUDE.md` exactly: rate limit before the body
(`createRateLimiter`, keyed on the Alexa device id), `safeSecretCompare` on
`x-alexa-skill-secret`, `readJsonBody`, `maxDuration = 60`.

Inside the route:
1. `alexa_device_id` → `desk_devices` row → its `profile_id`. Unknown device → the reply "This
   speaker is not set up in Serene yet" and nothing else. Fails closed.
2. The question text (the `query` slot of the one catch-all intent "ask Elaya {query}") →
   `runPythonBrainTurn({userId: profile_id, message, channel: 'voice'})` with a **6.5 second**
   budget. `channel: 'voice'` already exists (0247) and the persona already writes spoken style
   for it. `meta.device_id` is stamped on the message.
3. Finished inside the budget → speak the answer through `speakableFor('answer', text)`.
4. Not finished → reply "Give me a moment" and end the Alexa session; the turn keeps running
   inside `after()`; when it lands, `queueDeskMessageCore(kind 'answer', audience {device_id})`
   and the sender speaks it on the same Echo. The transcript is one ordinary conversation.
5. The daily cap and the one-active-conversation rule apply to the device profile as to anyone.

Because a device profile is a genie of its queendom: `list_tickets`, `list_members`,
`get_member_360`, `get_sia_group_messages` and the rest already answer for that queendom only,
and refuse `outside_seat`. `get_live_pulse` is founder-only and stays so. The table's own pulse is
the new read below.

### 6e. One new read: the queendom's pulse

`getQueendomPulse(queendomId)` in `pulse-service.ts` (the same file as `getLivePulse`, one
composer): members waiting (from `getWaitingGroups` filtered to that queendom's members), open
and due-today and overdue Sia tickets, tickets resolved today, Freshdesk open for the queendom's
group, member occasions in 7 days, renewals in 14 days, and who of the queendom is present
(`UsagePresence` heartbeats). It backs a new read tool `get_queendom_pulse` (all staff, seat
scoped; admin/founder pass a queendom), the TV board, and the spoken answer to "what is
happening". `getWaitingGroups` grows a `queendomId?` filter rather than a second waiting reader.

---

## 7. The TV board

### 7a. Where it lives

Route group `src/app/(display)/tv/page.tsx`, its own layout: no sidebar, no page controls, no
Elaya button, no toasts. The gate copies `(client)/layout.tsx`: a signed-in active profile or
`/login`. The TV is signed in once as its device profile (kind `tv`) and the session is refreshed
by `proxy.ts` like any page. The theme and dark mode come from that device profile's own
`theme` and `appearance`, so each queendom's wall can wear its own theme and the board can go
dark after sunset by setting the device to `system`. A founder signed in sees the company board
(`getLivePulse`); a device sees its queendom board (`getQueendomPulse`).

The page keeps the screen awake (`navigator.wakeLock`, a small `useWakeLock` hook, new) and
enters full screen on the first click (the TV's browser needs one touch). It reloads itself
every six hours so a deploy reaches the wall.

### 7b. The design, as a designer would brief it

The board is read from four metres. Everything below is measured against that.

**Material.** The cream canvas `--neu-canvas` edge to edge; the board is one `--neu-workspace`
sheet with `--neu-radius-card` and `--neu-shadow-shell`, the same three-material world as the
app, so a person walking from their laptop to the wall sees the same Serene. No grain, no blur,
no dark canvas in light mode; dark mode is the ordinary `data-neu="dark"`.

**Type.** Playfair speaks once: the greeting, `--text-giant` light, "Good morning, Anishqa." with
the page-title dot blinking at 2.4s, the single living accent. Every number is mono, tabular,
`--text-display`. Labels are `.type-eyebrow`. Nothing under `--text-lg` anywhere on the board;
at four metres 20px is the floor.

**Layout at 1920 × 1080 (the `--bp-3xl` band).** A 12-column grid, 32px gutters, 48px margins.

```
┌──────────────────────────────────────────────────────────────────┐
│ Good morning, Anishqa.                    11:42   Mon 28 Sep      │  greeting row
├──────────────────────────────────┬───────────────────────────────┤
│  WAITING ON US                   │  ELAYA                        │
│  Kapoor group        62 min      │  (glyph, breathing)           │
│  Mehta family        41 min      │  "The Kapoor group has been   │
│  ...oldest first, max 6          │   waiting an hour."  11:40    │
│                                  │  "Lunch is on the house."     │
├──────────┬──────────┬────────────┤   from Arfam · 12:05          │
│ OPEN     │ DUE      │ OVERDUE    │  ...the last 5 lines she said │
│  14      │  3       │  1         │                               │
├──────────┴──────────┴────────────┼───────────────────────────────┤
│  COMING UP                       │  ON THE FLOOR                 │
│  Riya's birthday · Thu           │  Priya  Sana  Ajith  (present)│
│  Sharma renewal · 12 days        │                               │
└──────────────────────────────────┴───────────────────────────────┘
```

Left two thirds: the work. Right third: Elaya's column, her glyph at `xl` (96px) breathing at the
top, and beneath it the tail of the outbox for this table, newest at the top, each line with its
time and source. That column is the board's memory: someone who stepped out reads what was said.

**Motion (M-01 to M-06, and §10.1 #05).** Entrances are y 6→0 plus opacity, 400ms
`EASE_OUT_EXPO`, stagger 60ms, at most 8 items. Numbers never flash; they transition through
`AnimatedNumber` at `COUNT_UP_MS`. Waiting minutes tick once a minute in place. The only ambient
motion is the glyph breathing (3s) and the dot (2.4s); nothing else moves while the board is
idle. Reduced motion is honoured by the `MotionProvider` already in the root.

**The three interruptions.** All three are one `DeskTakeover` component, portaled at `--z-veil`
(90, currently unused, and this is what it is for):
- **Alert, severity 3** (a member waiting a day, an escalation): the board fades to 0.35 under a
  full-sheet card on `--neu-surface-high`; the alert's title in Playfair `--text-giant`, the body
  in sans `--text-2xl`, the group name and the wait as one mono line; a soft chime (one short
  sound file in `/public`, played once, never looped). Held 30 seconds, or until the row is
  acknowledged on Sia (the sweep's dedupe key clears it), then the card exits at 250ms.
- **Alert, severity 2:** a banner across the top of the board, `--neu-surface-high`, the accent
  wash header (`--neu-header-wash`), 20 seconds, no chime.
- **Announcement:** the same full-sheet card, the founder's first name as the eyebrow, the message
  in Playfair, held 20 seconds. Chime once.
Only one takeover shows at a time; others queue in severity order. A takeover never shows a line
the speaker would not say (it is the same outbox row).

**Empty and error states.** A board with nothing waiting says, in the Waiting tile, the
`EmptyState` inline variant with the Serene mark: "Nobody is waiting." Never "No data". If the
Realtime channel drops, a `MetaLine` at the bottom edge says "Reconnecting" with the warning dot;
the numbers stay, dimmed to `--neu-text-tertiary`, never removed.

**Sound on the TV.** The TV chimes; it does not speak. The voice at the table is the Echo. One
voice per table, or two devices talk over each other. (**Decide 4:** if a table has a TV but no
Echo, do we let the TV speak through the browser's speech engine? I recommend no: buy the Echo.)

### 7c. How it stays live

The board mounts with an RSC seed (`getQueendomPulse` and the last 5 outbox rows), then two
Realtime channels through the browser singleton, each with a `useId()` suffix and
`removeChannel` on cleanup (the `TicketBoard` pattern, `TicketBoard.tsx:120-136`):
- `desk_outbox` INSERT filtered to the device's audience → a takeover, and a new line in Elaya's
  column.
- `sia.tickets` changes for the queendom → a 400ms debounced re-read of the pulse through
  `getQueendomPulseAction`.
Plus a 60-second re-read for the waiting minutes. RLS scopes every row to the device profile.

---

## 8. The build, layer by layer

Files, in the order they are written. Every "THE" below is a registry row for `CLAUDE.md`.

**Layer A. Data and vocabulary.**
- `supabase/migrations/0248_desk_devices.sql` (section 4).
- `src/lib/constants/desks.ts`: `DESKS_PATH '/desks'`, `TV_PATH '/tv'`, `DESK_DEVICE_KINDS`,
  `DESK_MESSAGE_KINDS`, `DESK_SOURCES`, `DESK_OUTBOX_STATUSES`, `DESK_NEVER_SPOKEN`,
  `DESK_SPOKEN_MAX_CHARS 240`, `DESK_ANSWER_BUDGET_MS 6500`, `DESK_TAKEOVER_MS {3: 30000, 2: 20000}`,
  `DESK_SETTING_KEYS`. The SQL CHECKs mirror these lists.
- `src/lib/validations/desks-schema.ts`: the announcement form, the device form, the Alexa
  webhook body.
- `llm-providers-service.ts`: `getDesksSettings()` in the `getHandsSettings` shape.

**Layer B. Services.**
- `src/lib/services/desks-service.ts`: THE reads (`listDeskDevices`, `getDeskDeviceByAlexaId`,
  `getDeskDeviceForProfile`, `listDeskOutbox`, `getDeskOutboxTail(audience, n)`). Admin client;
  the caller gates.
- `src/lib/services/desk-mutations.ts`: THE cores, `MutationActor` in: `upsertDeskDeviceCore`,
  `queueDeskMessageCore` (the ONLY writer of `desk_outbox`; applies `desks_enabled`, quiet hours,
  `expires_at`, and `speakableFor`), `settleDeskMessageCore(id, status, sent_to, error)`.
- `src/lib/services/desk-speech.ts`: `speakableFor(kind, input)` (section 5), pure, benchable.
- `src/lib/services/desk-sender.ts`: `runDeskSender({deadlineMs})`: claims queued rows whose
  `not_before` has passed and `expires_at` has not, resolves the audience to active Alexa devices,
  refuses any device not on the row's allow-list (fails closed, like the hands connector), calls
  the Voice Monkey announcement API once per device with `spoken`, settles the row. THE one place
  the Voice Monkey token is used. Env `VOICEMONKEY_TOKEN`, `VOICEMONKEY_SECRET`.
- `pulse-service.ts`: `getQueendomPulse(queendomId)`; `getWaitingGroups` gains `queendomId?`.
- `elaya-alerts.ts`: the fourth delivery (6a).

**Layer C. Actions and the brain.**
- `src/lib/actions/desks.ts`: `sendDeskAnnouncementAction`, `upsertDeskDeviceAction`,
  `getQueendomPulseAction` (the TV's refresh; gated by the session's own seat).
- `tools/registry.ts`: `get_queendom_pulse` (read, all staff, bridged for the Python brain).
- `write-registry.ts`: the reminder branch in `create_personal_task` (6c).

**Layer D. Runs.**
- `src/trigger/desk-sender.ts`: every minute, gated by `desks_enabled`; the retry for what
  `after()` in the action already tried.
- `src/app/api/webhooks/alexa/route.ts` (6d) and the Alexa-hosted skill (one interaction model,
  one Lambda handler of forty lines, kept in `connector-alexa/` in this repo with a README).

**Layer E. Pages.**
- `src/app/(dashboard)/desks/page.tsx` + `components/desks/DeskAnnouncementCard`,
  `DeskDevicesCard` (the allow-list with a "Say hello" test button per device), `DeskLedger`.
- `src/app/(display)/layout.tsx` + `(display)/tv/page.tsx` + `components/tv/`: `TvBoard`,
  `TvGreeting`, `TvWaitingTile`, `TvCountTile` (over `StatTile size lg`), `TvComingUp`,
  `TvPresence`, `TvElayaColumn`, `DeskTakeover`, `useWakeLock`, `useTvLive` (the two channels).
- `route-permissions.ts`: `/desks` for admin/founder; `/tv` is in its own group and is not in
  the domain map (any active profile may open it; what it shows is what that profile may see).

**Layer F. Docs.** `docs/modules/desks.md` (the runbook: pairing an Echo, signing a TV in, the
Voice Monkey account, the skill), changelog entries per layer, registry rows.

---

## 9. Order of work and what each step proves

1. **Accounts and names (no code).** The Indulge Amazon account; the three Echos signed into it,
   named "Anishqa table", "Ananyshree table", "Sanika table"; Voice Monkey Hobby (about $76 a
   year; 15,000 messages a month, far above our need); the Alexa developer account on the same
   login. Proves: the office is ready.
2. **Layer A + B (outbox, sender) + the Desks page.** The founder types a line and three Echos say
   it. Proves: the pipe, the allow-list, the ledger, quiet hours. Half a day of code, one of
   testing at the office.
3. **The alert delivery (6a).** Turn the sweep on with founder WhatsApp muted (Decide 3). A real
   waiting member is spoken at the right table within five minutes. Proves: routing by queendom
   and the spoken law. Watch it for a week before step 5, and count how many lines a table hears
   per day. More than ten is too many.
4. **The TV board (section 7).** Sign the two TVs in; the board runs for a day with the takeovers.
   Proves: the design at four metres, the Realtime channels, a TV that survives a deploy.
5. **The skill (6d) and the reminder (6c).** "Ask Elaya who is waiting" answers in the room.
   Proves: the 6.5-second split, the answer-later path, the queendom boundary from a shared
   device (run the concierge boundary bench from `concierge-queendom-boundary` with a device
   profile as a ninth archetype).
6. **Polish.** The founder cabin TV; a scheduled "good morning" line at 10:00 that reads the
   brief's "Needs you today" for that queendom; a 16:00 line that is a joke or a fact
   (**Decide 5:** yes or no; it is one row a day, routing tier, ₹0.1).

What is not in this plan: music (native "Alexa, play" does it and Serene should not), the Google
Home (retire or music), two-way live calls on the speaker (that is the LiveKit voice channel,
in the app), and a customer-facing anything.

---

## 10. Risks, said plainly

- **Amazon moves the ground.** Alexa+ is replacing classic Alexa in 2026 and custom skills are
  the part Amazon talks about least. The speaking half (Voice Monkey) does not depend on the
  skill; if custom skills go, we lose "ask Elaya" on the Echo and keep alerts and announcements.
  The question-and-answer path is the last step for this reason.
- **Voice Monkey is a small third party.** An outage means silence, never harm: the outbox row
  stays queued, the TV still shows the line, the founders still get in-app. We never send it
  anything but the spoken line, which the law in section 5 has already stripped.
- **An open room hears everything.** Section 5 is the whole defence; a spoken line is written by
  one function and it is benchable. The bench runs every alert kind and ten answers through it
  before step 3 goes live.
- **A shared device profile is a real account.** It is a genie with no phone and no email a human
  reads; the roster will list it under Genies (**Decide 6:** hide device profiles from the
  roster and the assignable-users list with one `desk_devices` join, or show them as "Alexa,
  Anishqa table" chips; I recommend hiding). The sign-up-role hole noted 2026-09-26 must be
  closed before machine accounts exist.
- **Fatigue.** The first week of step 3 decides the thresholds. If the tables hear more than they
  act on, severity 2 stops being spoken and goes to the TV banner only.
- **TV browsers.** The TVs are Sony smart TVs (Android TV / Google TV) with a browser. The
  built-in Sony browser is old and may not hold a Realtime websocket or run a modern build; if
  the board stutters on it, install the free "TV Bro" browser from the Play Store on the TV (it
  opens one page full screen and keeps it), or add a ₹3,500 Fire TV stick. Step 4 starts by
  opening `/tv` in the built-in browser and deciding in ten minutes.

---

## 11. Decisions in one list

1. ~~The Indulge Amazon account~~ exists (decided 2026-09-28).
2. Members aloud: group name (recommended) or first name.
3. Turn the whole alert sweep on, or mute founder WhatsApp for the first two weeks (recommended).
4. A TV without an Echo: speak from the browser (no, recommended) or buy the Echo.
5. The 16:00 joke or fact line: yes or no.
6. Device accounts in the roster: hidden (recommended) or shown as device chips.
7. ~~The TV models~~ Sony Android TVs (decided 2026-09-28); the browser is tried first, TV Bro or a Fire TV stick if it fails.
