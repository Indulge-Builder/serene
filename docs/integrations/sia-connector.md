# Sia connector: the WhatsApp watcher

> **Purpose:** what the Baileys WhatsApp watcher in `connector/` does, where it runs, how it keeps its session, how it stores media, and how it tells us when it is in trouble.
> **Audience:** engineers, and whoever is on call for the Sia alarm.
> **Source-of-truth scope:** the watcher process and the `sia.wag_*` tables it writes. Deploy commands live in `../operations/deployment.md`; the recurring upkeep (partitions, the phone, Baileys upgrades) in `../operations/maintenance.md`; the hands-on procedures (pairing, session SQL, replacing the number) in `connector/RUNBOOK.md`. The page that reads the tables is `../pages/sia.md`.
> **Last verified:** 2026-09-26 against `connector/src/` (index, db, normalize, media, media-backfill, auth-postgres, config), `connector/RUNBOOK.md`, `backend/copilot/watcher/`, `src/trigger/sia-silence.ts`, `src/lib/services/sia-service.ts`, and migrations 0169 to 0178, 0204.

---

## The operating rule (read this first)

**Sia is mission-critical. Never experiment on the live WhatsApp session.** The session keys
in `sia.wag_auth_state` are production data: a corrupted session means downtime and can lose
messages that fall outside WhatsApp's redelivery window. If the watcher wobbles:

1. **Freeze.** Scale the Fargate service to 0 (or leave it as it is). Do not chain fix attempts.
2. **Audit read-only.** Read the heartbeat row, the logs, the counts. Change nothing.
3. **Let a human decide.** Write down what you found and the options, and let the founder or
   the tech lead choose.

This rule comes from the 2026-08-27 incident: pairing experiments run against the live
session store left half-written credentials, WhatsApp rejected every boot, and capture went
down. The hardening that followed (Postgres auth state, crash-only, the heartbeat alarm) is
described below.

**The one law:** exactly one process may hold the session at a time. Two sockets on one
session put WhatsApp into a conflict loop and can log the number out. Scale the cloud service
to 0 before running the connector anywhere else.

## What it is

A small Node/TypeScript service (Baileys `7.0.0-rc14`) linked to a dedicated WhatsApp number
as a companion device. That number sits, silent, in the member, vendor and internal groups.
The watcher writes every event it receives into the `sia` schema. It is the one sanctioned
non-Python service outside the Next app.

**It never sends.** There is no send call anywhere in `connector/src/`, it connects with
`markOnlineOnConnect: false`, and it reads only group chats (`@g.us`); direct chats, status
and broadcast lists are ignored. A silent member is what keeps the number from being flagged.

## Where it runs

| Fact | Value |
| --- | --- |
| Platform | AWS ECS Fargate through Copilot: app `serene`, env `prod`, service `watcher`, region `ap-south-1` |
| Manifest | `backend/copilot/watcher/manifest.yml` (a Backend Service: no port, no load balancer) |
| Size | 512 CPU, 2048 MB, `linux/arm64` (Graviton), one task. Raised from 512 MB on 2026-08-29 after the media backfill was OOM-killed every 90 seconds |
| Deploys | `deployment.rolling: recreate`, so the old task stops before the new one starts (the one law) |
| Image | `connector/Dockerfile` (`node:22-slim`, runs `tsx src/index.ts`) |
| State on disk | None. The container is disposable: the session is in Postgres, media goes to S3 |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` from SSM; `NEXT_PUBLIC_SUPABASE_URL` in the manifest |
| Media bucket | The Copilot addon `backend/copilot/watcher/addons/sia-media.yml`: private, encrypted, versioned S3 bucket, injected as `SIAMEDIA_NAME` |

How to deploy it: [`../operations/deployment.md`](../operations/deployment.md). A deploy of the
Python brain (`api` service, same cluster) never touches the watcher.

## How it works

```text
socket event   -> in-memory queue -> return                         (milliseconds, always)
drain loop     -> wag_raw_events (raw first) -> normalize -> wag_* rows    (batches of 50)
media worker   -> download + decrypt -> S3 -> wag_media 'done'          (2 at a time, live only)
backfill drip  -> old pending/retrying media -> S3 or 'expired'         (4 lanes, on connect)
heartbeat      -> wag_watcher_status every 60 s + on every state change
```

- **Thin handlers.** Socket handlers only enqueue and return, so a large video can never back
  up the event stream.
- **Raw first.** Every event is written to `wag_raw_events` before it is parsed. A normalizer
  bug is fixed by replaying from raw; a failed normalize is logged and skipped, never lost.
- **Idempotent.** A message's identity is WhatsApp's own triple `(chat_jid, wa_message_id,
  sender_jid)` plus `wa_timestamp`; every write is an upsert on it. Redeliveries, history sync
  overlaps and replays land exactly once (the dedup wall).
- **Facts never mutate.** An edit is a new row chained by `edit_of_wa_message_id`; "delete for
  everyone" flips `is_revoked`; reactions are kept as current state.
- **One exception to the wall:** a message that failed to decrypt is stored as an
  `undecrypted` placeholder. When WhatsApp re-sends it decoded, the placeholder is deleted and
  the real message written (the failed raw event stays in the black box).
- **Direct writes.** The watcher writes with the service role; there is no webhook hop.

### What each event becomes

| Baileys event | Written to |
| --- | --- |
| `messages.upsert`, `messaging-history.set` | `wag_messages` (+ `wag_media` row for media, `wag_reactions` for reactions, `is_revoked` for deletes), sender names into `wag_contacts` |
| `messages.update` | late deletes (`is_revoked`) |
| `message-receipt.update` | `wag_receipts` (stays empty, see below) |
| `groups.upsert`, `groups.update` | `wag_groups` (subject, description, owner, size), `watcher_joined_at` stamped once |
| `group-participants.update` | `wag_group_members` (joins, leaves, promotions, with history) |
| `contacts.upsert`, `contacts.update` | `wag_contacts` (batched; a partial update never blanks a known name) |
| `lid-mapping.update`, history `lidPnMappings` | `wag_contacts` lid and phone pairs (the identity bridge) |
| `creds.update` | `wag_auth_state` |

Message types the normalizer knows: text, image, video (round video notes too), audio, voice,
document, sticker, location, contact, poll, album, payment, product, system, `undecrypted`, and
`unknown` (stored with the raw kept, replayable). The `type` column has no CHECK, so a new
WhatsApp feature can never make an insert fail.

## The tables it writes (schema `sia`)

| Table | What | Notes |
| --- | --- | --- |
| `wag_raw_events` | The black-box recorder: every event, raw | Monthly partitions + a default. Blobs over 900 KB are trimmed to a marker |
| `wag_messages` | The heart: one row per message | Monthly partitions by `wa_timestamp` + a default. `source` (live / history_sync / backfill) and `normalizer_version` on every row |
| `wag_media` | Our copy of each media file | `download_status`: pending, retrying, done, dead_letter, expired. `storage_path` is `s3://bucket/key` |
| `wag_reactions` | Current reaction per person per message | |
| `wag_receipts` | Read and delivery receipts | Empty by design (see below) |
| `wag_groups` | One row per group | `group_kind` (member, vendor, internal, unmapped), `is_active`, `member_id` (set by Serene, never by the watcher) |
| `wag_group_members` | Membership with history | |
| `wag_contacts` | One row per WhatsApp identity | `jid`, `lid`, `phone`, `push_name`, `participant_role` (client, genie, bishop, queen, joker, founder, vendor, watcher, unknown), `staff_profile_id`, `member_id` |
| `wag_auth_state` | The WhatsApp session (0174) | One row per key; see "Session" |
| `wag_watcher_status` | The heartbeat, one row (0175, 0177) | `beat_at`, `state`, `state_since`, `account_jid`, `qr`, `qr_at`, `restart_requested_at` |
| `wag_pipeline_cursors` | Per-consumer read positions | Created in 0169; nothing reads or writes it today |

All have RLS on and no user policy: only the service role reads them. The Serene app reads
through `sia-service.ts` on the admin client, behind the page and action gates. Full table
reference: [`../architecture/database.md`](../architecture/database.md).

Partitions exist through March 2027; adding the next year is a yearly duty in
[`../operations/maintenance.md`](../operations/maintenance.md) (helper:
`sia.wag_add_month_partition()`).

**`wag_receipts` stays empty.** WhatsApp only sends receipts for messages you send, and the
watcher never sends. Do not debug this.

## Hidden ids (LID) and the identity bridge

Inside groups, WhatsApp now addresses members by privacy ids (`...@lid`) that hide the phone.
The watcher collects every lid and phone pair it is given and stores them on `wag_contacts`:

- group participant metadata (Baileys gives `phoneNumber` beside the lid) on every boot's group
  walk and on every `groups.upsert`, plus the group owner;
- the `lidPnMappings` field of history chunks;
- the live `lid-mapping.update` stream.

Serene then resolves a lid to a phone, and a phone to a person:

- the group info panel on `/sia` matches phones against `public.profiles` for the Indulge badge;
- the 15-minute staff link job sets `staff_profile_id` on staff contacts, hidden-id rows
  included (see [`../modules/sia.md`](../modules/sia.md#staff-identity-on-whatsapp-the-phone-link));
- the member group links and the import scripts use phones to find the member.

A lid with no pair yet shows as "Not synced yet" and resolves when a pair arrives.

## Session and pairing

**Where the session lives.** `sia.wag_auth_state` (0174), through
`connector/src/auth-postgres.ts`: one row per key, BufferJSON payloads, wrapped in Baileys'
`makeCacheableSignalKeyStore`. Reads and writes retry, then throw: a database blip at boot must
never look like "no session", because a fresh identity's first save would overwrite the real
one. Since the session is in Postgres, any machine resumes it, and a deploy never re-pairs.

**How to pair (the QR flow).** Pairing codes are retired: they bind to the socket that made
them, and crash-only restarts killed them before they could be typed. There are two ways to
scan a QR:

- **From Serene (normal):** Sia → gear → Session. When the watcher is waiting to be paired it
  publishes its QR into `wag_watcher_status.qr` and the console renders it (0177). Scan it with
  the watcher phone (WhatsApp → Linked devices). **Re-pair session** wipes the session and
  restarts the watcher so a fresh QR appears; **Restart watcher** restarts and keeps the session.
  Both are admin/founder only.
- **From a terminal (fallback):** scale the cloud service to 0, run the connector locally with
  the media bucket set, scan the QR the terminal prints, let history settle, stop it, scale the
  service back to 1. The exact commands are in `connector/RUNBOOK.md`.

**When WhatsApp logs the watcher out** (`loggedOut`), the watcher records the state, wipes
`wag_auth_state`, and exits. The next boot arms a fresh QR, so a dead login never loops.

**History on pairing.** The watcher asks for full history (`syncFullHistory: true`) and accepts
every chunk (`shouldSyncHistoryMessage: () => true`; the rc14 default silently drops the full
ones). The dedup wall absorbs the overlap. The archive reaches back to 2023-08.

**Replacing the number** (blocked, banned, SIM lost): the data is never at risk, but the new
number must be re-added to every group, and messages sent while it was not a member cannot be
recovered. Procedure: `connector/RUNBOOK.md`.

## Crash-only design

One process = one socket = one drain loop. Any disconnect exits the process; ECS starts a
fresh one; the session resumes from Postgres; WhatsApp redelivers what happened in the gap.
There is deliberately no in-process reconnect: it stacked sockets and drain loops and minted
duplicate pairing codes in the 2026-08-27 incident.

- An uncaught exception exits (unknown state is never trusted).
- A failed Baileys version lookup falls back to the library's built-in version instead of
  blocking boot.
- A restart in the same state keeps the old `state_since`, so "stuck for 15 minutes" can still
  fire during a crash loop.
- Locally, `npm start` in `connector/` is a supervisor loop (restarts after 2 seconds; Ctrl+C
  stops it). `npm run once` runs a single process.

## Flood hardening

The watcher number is in hundreds of groups, so connecting brings a flood.

- Raw payloads over 900 KB (the history dump) are trimmed to a marker; a failed batch insert
  falls back to row-by-row so one bad row cannot drop a batch.
- Messages upsert in chunks of 500; contacts are batched and deduplicated per event.
- The history sync, the live stream and the media work run off the socket handler.

## Media

- **Live:** each new media message is queued and downloaded while its keys are in memory (2 at
  a time, up to 5 attempts 20 seconds apart, with Baileys' re-upload request for expired links),
  then uploaded to the S3 bucket. `storage_path` records `s3://bucket/key`.
- **Backfill drip** (`connector/src/media-backfill.ts`): on every connect it works through
  `pending` and stranded `retrying` rows older than 10 minutes, 4 lanes, newest message first
  (0178). Each row ends `done` or `expired` (WhatsApp refused a re-upload or the keys no longer
  decrypt). A breaker pauses it only on transport failures. The first full drain finished on
  2026-08-30: 12,580 recovered, 2,345 expired, none lost.
- **Statuses:** `pending → done`, or `retrying → dead_letter` (no key material, or live retries
  used up), or `expired`.
- **Reading it in the app:** `getSiaMediaPayload()` presigns two 15-minute S3 links (view, and a
  download with an attachment disposition, because a browser fetch of a presigned URL fails on
  CORS). It uses the read-only IAM identity in `SIA_S3_ACCESS_KEY_ID` /
  `SIA_S3_SECRET_ACCESS_KEY` / `SIA_S3_REGION`, deliberately not the `AWS_*` names so they never
  hijack an operator's own AWS CLI. Rows from before the S3 move with a local path are read
  from `WAG_MEDIA_DIR` (validated against that root, 25 MB cap); the 227 rows that existed were
  copied to S3 and rewritten on 2026-08-27.
- **Always run a local connector with the bucket set.** Without it, media lands on that
  laptop's disk where the app can never reach it.

## The heartbeat and the alarm

The watcher beats `wag_watcher_status` every 60 seconds and on every state change (`pairing`,
`connecting`, `connected`, `logged_out`). Liveness is judged by this pulse, never by group
traffic, because groups sleep at night. The `/sia` status dot and console banner read the same
row. Each beat also reads `restart_requested_at` and exits cleanly when it is newer than the
boot (the console's Restart and Re-pair channel).

`src/trigger/sia-silence.ts` (Trigger.dev `sia-silence-watch`, every minute) raises one
condition at a time, most severe first:

| Condition | Meaning | Fires after |
| --- | --- | --- |
| `down` | No heartbeat: the process is not running | 3 minutes without a beat |
| `session_lost` | WhatsApp logged the watcher out, or it is waiting to be paired | At once on logout; after 15 minutes unpaired |
| `unreachable` | The process is alive but stuck connecting | 15 minutes |
| `quiet` | Connected, but no events at all | 6 hours (soft, to avoid 3 a.m. false alarms) |

Who hears it and when:

- **First:** the named tech responders in `SIA_ALERT_TIER1_PROFILE_IDS`
  (`src/lib/constants/sia-alerts.ts`), in-app, by push and on WhatsApp. A reminder every 10
  minutes while it lasts (a Redis latch per condition).
- **After one unresolved hour:** the founders join, then the same cadence.
- **On recovery:** one message to everyone who was alerted (founders only if it escalated).
- **WhatsApp leg:** `sendSiaAlertNotification` in `src/lib/services/whatsapp-api.ts`, over the
  Gupshup "Sia alert" template (id in `GUPSHUP_SIA_ALERT_TEMPLATE_ID`,
  `src/lib/constants/whatsapp.ts`; parameters: first name, title, detail). It is deliberately not
  gated by notification preferences, because it means the archive is at risk. A responder with
  no `profiles.phone` gets in-app and push only.
- TODO: verify that the `GUPSHUP_*` variables are set on the Trigger.dev production
  environment. The WhatsApp leg runs there; a missing variable makes it fail quietly (the
  in-app and push legs still land).

A WhatsApp ban currently shows as `unreachable` after 15 minutes; a distinct "possible ban"
alert is an open candidate in `../operations/maintenance.md`.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | watcher | the database |
| `SUPABASE_SERVICE_ROLE_KEY` | watcher (SSM secret) | direct writes |
| `WAG_MEDIA_BUCKET` or `SIAMEDIA_NAME` | watcher | S3 mode; unset = local disk (development only) |
| `AWS_REGION` | watcher | default `ap-south-1` |
| `WAG_MEDIA_DIR` | watcher and app | local media folder (default `connector/media`); the app reads legacy local rows from it |
| `WAG_PAIR_NUMBER` | watcher | emergency pairing-code path only; leave unset |
| `SIA_S3_ACCESS_KEY_ID`, `SIA_S3_SECRET_ACCESS_KEY`, `SIA_S3_REGION` | app (Vercel, `.env.local`) | the read-only identity that presigns media links |

Locally the watcher reads `../.env.local` and then the process environment. Full variable
list: [`../operations/environments.md`](../operations/environments.md).

## Files

| File | Role |
| --- | --- |
| `connector/src/index.ts` | Socket lifecycle, thin handlers, drain loop, heartbeat, pairing, crash-only exits |
| `connector/src/db.ts` | Every write to `sia.wag_*` (batching, trimming, the placeholder correction, heartbeat, QR) |
| `connector/src/normalize.ts` | One WhatsApp message to rows; never throws |
| `connector/src/media.ts` | The live media worker and the shared S3 store write |
| `connector/src/media-backfill.ts` | The backfill drip |
| `connector/src/auth-postgres.ts` | The Postgres session store and `wipeAuthState` |
| `connector/src/config.ts` | Environment |
| `connector/RUNBOOK.md` | Pairing, session SQL, number replacement, outage arithmetic |
| `backend/copilot/watcher/` | The Fargate manifest and the S3 addon |
| `src/trigger/sia-silence.ts`, `src/lib/constants/sia-alerts.ts` | The alarm |
| `src/lib/services/sia-service.ts`, `src/lib/actions/sia.ts` | The app side: reads, media presigning, console controls |
| Migrations 0169 to 0178, 0204 | The schema (foundation, RLS on partitions, activity RPC, schema move, previews, auth state, heartbeat, remote pairing, media order, the `joker` contact role) |

## Known gaps in the code's own notes

These files describe an older state; the code above is current. They are outside this doc's
ownership and are listed so nobody trusts them:

- `connector/README.md` still says the session is in `connector/auth/`, media is on local disk,
  and Fargate is "later".
- `connector/Dockerfile`'s header comment still says the auth keys are on EFS (EFS was removed
  on 2026-08-27).
- `backend/copilot/watcher/manifest.yml`'s header says liveness is read from
  `wag_raw_events`; it is read from the heartbeat.
- `connector/RUNBOOK.md` calls the alert template an environment variable; it is a constant in
  `src/lib/constants/whatsapp.ts`. The comments on `sendSiaAlertNotification` and on that
  constant still say "admins"; the first tier is the named responder list.
- The `wag_contacts.participant_role` column comment says an unknown member blocks profiling;
  since 2026-09-17 the gate is the group link only.
