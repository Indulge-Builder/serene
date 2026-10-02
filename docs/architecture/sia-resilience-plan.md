# Sia resilience plan: a watcher that cannot lose a day

> Written 2026-09-29, the day WhatsApp banned the watcher number. Status: **steps 1 to 5 and the
> harvester (8b) built 2026-09-29. Migration 0249 rehearsed on production inside a rolled-back
> transaction, NOT applied; nothing deployed; no phone harvested and no export read yet.**
> Decisions the founder must make are marked **Decide**. Everything else is my recommendation and
> I will build it exactly as written unless told otherwise.

Read `docs/modules/sia.md` and `connector/README.md` first. This plan changes how the watcher
fails and how it comes back. It does not change what it captures or how the data is read.

---

## 1. What happened today, and what it taught us

At 11:21 IST the watcher's WhatsApp connection dropped with a 503. From 11:22, every reconnect
was refused with 403. WhatsApp answers 403 to a banned number. The watcher is crash-only by
design (one disconnect = exit, ECS starts a fresh process), so it reconnected 47 times in 45
minutes with a banned account, until it was stopped by hand. The alarm did its job (it paged
the tech responders every ten minutes), but nothing on our side knew the difference between
"cannot connect right now" and "this number is finished".

Then the second finding, which matters more than the ban. Of the 528 groups Serene holds, 465
have their first stored message between June and August 2026, and the whole archive holds
under 30 messages from before July 2026. WhatsApp only gives a phone the messages sent after it
joined a group. So everything Serene knows about a member (facts, people, tone, the weekly
judgement) is built from roughly ten weeks of chat, not from the life of the group. The
history before the watcher joined lives only on the phones of the people who were there from the
start: the founders and the queens.

Four lessons:

1. **A ban is a state, not a retry.** After a few 403s in a row the watcher must stop, say
   "banned", and wait for a human. Hammering a banned number is the one thing that makes a
   review less likely to succeed.
2. **One number is one point of failure.** A second number, already in every group and never
   linked to anything, is the only fallback that closes the gap, because its phone has been
   receiving the messages the whole time.
3. **Switching numbers must be one click, and must keep the old session.** Today "Re-pair"
   wipes the session first. When the old number may come back, wiping it throws away a working
   login for nothing.
4. **The archive must be able to take history from outside the watcher.** A WhatsApp chat export
   from a founder's phone is the only way to get the years before July, and the only way to
   fill any future gap the standby did not cover.

---

## 2. Five facts that decide the architecture

1. **A message's identity does not depend on who received it.** `sia.wag_messages` is unique on
   `(chat_jid, wa_message_id, sender_jid, wa_timestamp)` (0169:159) and the connector upserts
   with `ignoreDuplicates: true` (`connector/src/db.ts:310`). Two numbers in a group, even both
   paired one day, produce one row per message. Duplicates are not a risk.

2. **The watcher's own number is discovered, never configured.** On connect it reads
   `sock.user.id`, writes it to `wag_watcher_status.account_jid` and tags that contact
   `participant_role = 'watcher'` (`connector/src/index.ts:493-498`). Every reader that skips
   staff (the reply-gap read 0224, the profiler, Elaya's data) already treats `watcher` as
   staff. A new number needs no code change to be ignored as a participant.

3. **The session is rows in Postgres, not a file.** `sia.wag_auth_state` holds one row per
   Baileys key (0174:16). "Keep the old session aside" is a table copy, not a volume snapshot.
   The hands connector proved the store is parameterised by table (`auth-postgres.ts:94`).

4. **Pairing from the browser already exists.** The console's Session panel polls
   `getSiaPairingStatusAction` and renders the QR the watcher publishes (0177). "Change watcher
   number" is the same flow with one difference: the old rows are shelved, not deleted.

5. **The profiler is re-runnable by design.** Its cursor is one row per group
   (`sia.profiler_group_state.last_message_at`, 0215:32), facts carry a source and evidence,
   and a newer fact supersedes an older one instead of overwriting it. Re-profiling from a
   longer history is "reset the cursor, run the sweep", not a new pipeline.

---

## 3. The system, plainly

Two numbers live in every member group.

- **The watcher number**: the one paired to the connector. It is the ear.
- **The standby number**: a plain WhatsApp phone, in every group, linked to nothing. It does
  nothing until the day it is needed. Its only job is to have been there.

When the watcher number fails for good (banned, or logged out and the review fails), an admin
opens Sia, the gear icon, Session, and presses **Change watcher number**. Serene shelves the old
session, the watcher restarts into pairing, the QR appears, the admin scans it with the standby
phone. WhatsApp's history sync then delivers what that phone holds, which includes the gap. The
standby has become the watcher; the old number, if it ever comes back, becomes the new standby.

A daily check makes sure the fallback is real: for every linked member group, are both numbers
in it? Any group missing the standby is listed on the Session panel and in one alert.

And for the years before the watcher existed, and for any gap neither number covered, a founder
exports the group chat from their own phone and Serene imports it into the same archive, marked
as an export. The profiler then reads it like any other conversation.

---

## 4. Data changes: one migration (0249)

1. `sia.wag_watcher_status.state` gains `'banned'`. The CHECK becomes
   `('pairing','connecting','connected','logged_out','banned')`.
2. `sia.wag_watcher_status` gains `close_streak integer NOT NULL DEFAULT 0` (closes in a row
   of any kind, reset to 0 on connect), `last_close_code` and `last_close_at`.
3. New table `sia.wag_auth_state_shelf (shelved_at timestamptz, account_jid text, reason text,
   key text, value jsonb)`, primary key `(shelved_at, key)`. RLS on, service_role only, like
   `wag_auth_state`. A shelf holds a whole session; "restore" copies it back.
4. `sia.wag_messages.source` gains `'export'` in its CHECK.
5. New table `sia.wag_chat_imports (id, group_jid, file_name, file_sha256, exported_by,
   from_at, to_at, rows_read, rows_written, rows_skipped, unresolved jsonb, profiled_until,
   profiled_at, profile_cost_usd, created_at)`. One row per file; `file_sha256` unique, so a
   re-run of the same file refreshes its row instead of adding one.
6. Three settings rows in `elaya_settings`: `sia_standby_jid` (set from the console),
   `sia_membership_check_enabled` (default true), `sia_history_reprofile_cap_usd` (default 60).

Not in this migration: older partitions of `wag_messages`. Exported history lands in the
default partition. Postgres refuses to add a partition for a range while the default partition
holds rows in it, so splitting it later means moving those rows first. It is worth doing only
if the default partition grows past a few hundred thousand rows.

No table outside `sia` changes. Nothing is deleted; the shelf is append-only.

---

## 5. Step 1: a ban is a state (connector + alarm)

**Connector (`connector/src/index.ts`).** On `connection === 'close'`:

- Every close adds one to `close_streak` on the status row and records the code.
- Code 403 (`DisconnectReason.forbidden`) with the streak at `BAN_REFUSALS` (3) or more: write
  `state = 'banned'`, hold for `BANNED_HOLD_MS` (30 minutes), exit. On the next boot, if the
  status row says `banned` and `restart_requested_at` is not newer than `state_since`, the
  process holds again without opening a socket. A human clears it: Restart (one more try; the
  streak is kept, so one more 403 bans again at once) or Change watcher number.
- Any other close: a pause before the exit that doubles with the streak
  (`RECONNECT_PAUSE_MS`: 5 s, 10 s, 20 s, up to 5 min).
- On `open`: `close_streak = 0`.

**Alarm (`src/trigger/sia-silence.ts`).** A fifth kind, most severe of all: `banned`, title
"Sia watcher number is banned", body "WhatsApp refused the number N times. Request a review on
the phone, then switch to the standby number from Sia → Session." Same tiers, same cadence.
`SIA_ALERT_KINDS` gains `'banned'`.

**Console.** The Session panel shows the banned state in plain words with the two actions:
"Try again" (Restart) and "Change watcher number" (section 6).

This step alone would have turned today's 47 attempts into 3.

---

## 6. Step 2: change the watcher number without losing the old session

**Service (`sia-service.ts`).**

- `shelfSiaSession(reason)`: copy every `wag_auth_state` row into `wag_auth_state_shelf` with
  `shelved_at = now()`, `account_jid` from the status row, then delete `wag_auth_state`, then
  stamp `restart_requested_at`. One transaction through a small RPC
  (`sia.shelve_auth_state(reason)`), so a crash between copy and delete cannot lose the
  session.
- `listSiaSessionShelf()`: the shelved sessions (account, when, why).
- `restoreSiaSession(shelvedAt)`: shelve the current one (reason `swap`), copy the chosen
  shelf back into `wag_auth_state`, restart. This is how the old number returns after a
  successful review.
- `requestSiaSessionRepair()` (today's Re-pair) becomes a call to `shelfSiaSession('repair')`.
  It never deletes without a copy again.

**Actions (`actions/sia.ts`).** `changeSiaWatcherNumberAction` and `restoreSiaSessionAction`,
admin and founder only (`requireProfile(['admin','founder'])`), both behind a `ConfirmDialog`
that says exactly what will happen and that no data is touched.

**Console (`SiaControlModal`).** In the Session panel:

- the current number (`account_jid`, shown through `RevealId`), its state, since when;
- **Change watcher number** → confirm → the QR appears within a minute → "Scan with the
  standby phone";
- a "Previous sessions" list from the shelf with **Restore** on each;
- the standby number field (`sia_standby_jid`), set once.

---

## 7. Step 3: the membership check

**Service (`sia-service.ts`).** `getStandbyCoverage()`: for every `wag_groups` row with
`member_id` set (a linked member group), is the standby jid present in `wag_group_members`
with `left_at IS NULL`, and is the watcher's own jid? Returns the two lists of missing groups.
The lid form of both numbers is resolved through `wag_contacts.lid` the way the staff link does
(`sia-staff-link.ts`).

**Sweep (`src/trigger/sia-membership.ts`).** Daily at 09:00 IST, gated by
`sia_membership_check_enabled`. If any group is missing the standby, one in-app notification to
the tier 1 responders and the queens (each queen gets only her queendom's list) naming the
groups. No WhatsApp send for this one; it is not urgent.

**Console.** A "Standby coverage" line on the Session panel: "In 512 of 514 member groups",
with the two missing groups named and linked.

---

## 8. Step 4: import a WhatsApp chat export

The founder exports a group from their phone (WhatsApp → group → Export chat → Without media)
and drops the `.txt` file in `cleint-data/wa-exports/`. The script reads it into the archive.

**Script (`scripts/sia/import-chat-export.ts`).** `--file <path> --group <jid> [--apply]`.
Dry run by default; prints what it would write and every sender it could not resolve.

- **Parse.** The export format is one line per message: `DD/MM/YY, HH:MM - Name: text`, with
  continuation lines for multi-line messages and system lines with no sender. Both the iOS and
  Android date shapes are handled; the phone's locale decides the order, and the script takes
  `--date-format dmy|mdy` when it cannot tell.
- **Resolve the sender.** The export carries a display name, never a jid. The script builds a
  map from the group's own members: `wag_group_members` → `wag_contacts.push_name`, then
  `members.name` for the linked member and their people, then `profiles.full_name` for staff.
  A name that maps to exactly one contact resolves; anything else is listed as unresolved and,
  in a second run, mapped through `--map "Name=jid"`. Unresolved senders are still imported,
  under a synthetic jid `export:<slug>@unresolved`, so no text is lost and the mapping can be
  corrected later by updating those rows' `sender_jid` (a correction, not a rewrite).
- **The message id.** An export has no WhatsApp id. The script makes a stable one,
  `exp-<sha1(group_jid, wa_timestamp minute, sender, text)>`, so re-running the same file lands
  on the same rows and bounces.
- **The window.** By default only lines OLDER than the first message the watcher itself holds
  for the group are imported. Where the watcher was listening, its rows are the record, and
  matching text across two sources is never as safe as not importing the overlap at all.
  `--from` and `--to` open a different window to fill a gap (such as the day of a ban); inside
  it a line is skipped when the archive already holds the same text within two minutes.
- **Write.** `wag_messages` with `source = 'export'`, `type = 'text'` (media lines become
  `type = 'media_omitted'` with the placeholder as text), `raw = { line, file_sha256 }`,
  through the connector's own `insertMessages` shape (the same chunked upsert). One
  `wag_chat_imports` row per run.
- **Media.** Not imported in step 4. An export with media is a folder of files with no link to
  lines beyond the filename; a later step can match them by name if it proves worth it.

**Decide (A):** who exports. A founder or queen who has been in the group since it was created
sees the whole history; a genie added later does not. The export should come from whoever has
been there longest.

**Decide (B):** where the files live. Recommended: `cleint-data/wa-exports/` on the laptop
that runs the import (already git-ignored like the rest of `cleint-data/`), deleted after the
`wag_chat_imports` row confirms the write. Nothing is stored "elsewhere"; the archive is the
one home, because every reader (the profiler, Elaya, search, the Sia page) reads only there.

---

## 8b. The harvester: one staff phone instead of 428 exports

Exporting 428 groups by hand is a week of tapping, and an export names people by the contact
name saved on that phone. The better road, the founder's idea of 2026-09-29: link to the phone of
someone who has been in the groups from the start, for one sitting, and take the history WhatsApp
hands a newly linked device. Advita is in 419 of the 428 linked member groups, Shruti in 418,
Karan in 417.

What a linked device receives carries the real message ids and the real senders. So nothing is
guessed from display names, and a message the archive already holds is recognised exactly.

**It is not the watcher.** `connector/src/harvest.ts` is a separate program run from a laptop
(`npm run harvest` in `connector/`). Five laws, each a line of code:

1. It never touches the watcher. Its login is a folder on the laptop, never
   `sia.wag_auth_state`, never the status row.
2. It never stores a personal chat. A message is dropped in memory unless its chat is a group
   already linked to a member. It has no raw-event write at all.
3. It never sends, never shows online, never marks anything read.
4. It never writes what the archive holds: the message id is checked per chat first.
5. It always unlinks: on finish, on error, on Ctrl-C it logs out and deletes its login folder.

The phone owner's own messages are filed under their own id as one more participant
(`from_me` stays false: it means the watcher's number). Rows are written with source `harvest`.
For each group, the range of NEW messages older than the archive's own record becomes one
`sia.wag_chat_imports` row, so the re-profile of section 9 reads it with no change. `--gap`
does the same for a window such as the day of the ban.

`--deep` goes further back than the first sync: for each group it asks the phone for the 50
messages before the oldest one it has, again and again, at the pace of a person scrolling up
(one request every two seconds, 40 pages a group by default).

**Order of a harvest.**

1. `npm run harvest -- --label bench --selftest --max-groups 3`: no phone. Replays archived
   messages, a private chat and an unknown group through the intake. Passed 2026-09-29.
2. A dry run on a phone that is in only a few groups: proves the link, the unlink and how far
   back WhatsApp sends.
3. Advita's phone, dry run, then `--apply`, then `--apply --deep` if the first sync was short.
4. The re-profile estimate, then the re-profile.

**Two risks, both the founder's call.** A number that links an unofficial client can be banned,
as the watcher was; one short sitting keeps that small, and a work phone is a better choice than
a personal number. And nobody can say in advance how far back WhatsApp will send: the watcher's
first link got about a month, its re-link on 2026-09-29 got almost nothing. The dry run measures
it before anything is written.

**What a banned number never gets back.** While the watcher number was banned (11:21 to 17:58
IST, 2026-09-29) WhatsApp delivered nothing to it, so its phone never held those messages and
the re-link brought none. They exist only on the other phones in the groups. A harvest with
`--gap 2026-09-29T05:51:28Z,2026-09-29T12:28:00Z` fills it.

---

## 9. Step 5: re-profile from the full history

After the exports land, the profiler must read what it has never seen. Two ways, and the
recommendation is the second.

- Reset every linked group's `profiler_group_state.last_message_at` to null and let the sweep
  walk forward from the oldest message. Simple, but it re-reads the ten weeks it already read
  and costs that again.
- `runHistoryBackfill` in the profiler: walk each import, oldest conversation first, through
  the same `profileWindow`, without moving the group's cursor. Its own bookmark is
  `wag_chat_imports.profiled_until`. New facts land with their own evidence; a fact the
  profiler already holds is not repeated. The live sweep keeps its cursor and its schedule.
  **Built.** A conversation that holds an unresolved sender is held and stops that import: a
  stranger reads as member-side, so a staff line would be filed as the member's own words.

Cost. The profiler runs on the reasoning tier at low effort, roughly one call per quiet-gap
conversation. Today's archive of about 196,000 messages cost about $30 to read. The pre-July
history is unknown until the exports are in; the import script prints the message count per
group, and the re-profile run is gated by a spend cap the same way the deep read is
(`getDeepReadSpendCapUsd`), so it stops and asks before crossing it.

**Decide (C):** the spend cap for the re-profile. Recommended $60, asked again if exceeded.

After the re-profile, the weekly judgement (`assessMember`) re-runs for every re-profiled
member with `force`, so the scores reflect the longer record.

---

## 10. Order of work and what each step proves

| Step | What | Proves | Effort |
| --- | --- | --- | --- |
| 1 | Ban state, retry limits, the `banned` alarm | Today can never repeat | half a day |
| 2 | Migration 0249, session shelf, Change watcher number, Restore | A number swap is one click and reversible | one day |
| 3 | Standby coverage read, daily check, console line | The fallback is real, every day | half a day |
| 4 | Chat export import script | History from before July can enter the archive | one day |
| 5 | `--before` re-profile mode, spend cap, re-judgement | Member profiles rest on the whole record | half a day, plus the run |

Steps 1 to 3 are code and one migration; they ship together, then `trigger:deploy` and a
watcher deploy. Step 4 is a laptop script. Step 5 runs from Trigger.dev or a laptop.

Nothing in this plan is exercised against the live session while it is the only one. The shelf
is tested on the local stack first; the first production shelf happens on the day of the
switch, with a `pg_dump` of `sia.wag_auth_state` taken by hand before it.

---

## 11. Risks, said plainly

- **The standby can be banned too.** Two numbers from the same office in the same 500 groups
  look alike to WhatsApp. The standby is never linked to anything, is added to groups slowly
  by admins the members know, and is a normal phone that a real person occasionally uses.
  That is the whole defence; there is no technical one.
- **An export is only as complete as the exporting phone.** WhatsApp exports at most 40,000
  messages per chat without media, and only what that phone still holds. A phone that cleared
  its chats has nothing to give.
- **Display names are not identities.** The export names people by the saved contact name on
  the exporting phone. "Mom", "Driver", a nickname. Unresolved senders are kept, flagged, and
  fixed by hand; the profiler treats an unresolved sender as unknown and does not attribute
  facts to a member from it.
- **Re-profiling costs money.** Bounded by the cap in step 5; the count is printed before
  anything is paid for.

---

## 12. Decisions in one list

- **A.** Who exports each group (recommended: whoever has been in it longest, usually a founder
  or the queen).
- **B.** Files live in `cleint-data/wa-exports/` and are deleted after import; the archive is
  the only home (recommended yes).
- **C.** Re-profile spend cap (recommended $60).
- **D.** The standby number: which number, and who carries the phone.
