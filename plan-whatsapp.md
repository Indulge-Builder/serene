# The Sia WhatsApp Data Layer Plan

> **Purpose:** the plan for capturing every message from Indulge's client WhatsApp groups into our own database, live, clean, and built for fast retrieval. This layer is the base of client profiling, concierge tickets, reviews, and everything the AI builds on top.
> **Module:** this is **SIA**, the client-operations side of Serene, and the bigger, more important half of the system. It is NOT part of Gia. Gia already has its own WhatsApp (the Gupshup number, the `whatsapp_`\* tables, the `/whatsapp` page) for the onboarding CRM and leads, and that stays exactly as it is. Everything in this document is new, separate, and belongs to Sia.
> **Audience:** us. Plain language on purpose.
> **Decided:** 2026-08-25.
> **Sits under:** `master-plan.md` (start there for the overall sequence). The profiling and tickets this feeds are Phase 3c in `plan-elaya.md`.
> **Related:** `elaya-workflow.md` (the AI layer this data will power).

---

## 1. What we are building, in one paragraph

A dedicated WhatsApp number (the watcher) sits silently inside every Indulge client group. Through Baileys it hears every message in real time: text, voice notes, images, documents, reactions, edits, deletes. Every event is stored raw, then normalized into a clean message database designed like the ones real messaging companies run. On top of that database: a Sia section in Serene to browse every group and chat, and the Python pipeline that turns raw conversation into client profiles, tickets, and reviews.

This is the heart of **Sia**. Gia (the onboarding CRM) already has its own separate WhatsApp world on the Gupshup number for one-to-one lead chat, and nothing here touches it. Sia is the client-operations half of Serene, where the real 24-hour business lives, which is why this layer is the base of the whole system.

---

## 2. Why it must be built exactly this way

### Why Baileys and not the official API

The official WhatsApp Business API (what Gupshup gives us today) **cannot see groups. At all.** It only does one-to-one business messaging. Our entire client world lives in groups, so the official road is closed. Baileys speaks the same protocol WhatsApp Web speaks, which means it sees exactly what a phone in the group sees, including groups. That is why Baileys, and there is no official alternative.

### The honest risk, and how we neutralize it

Baileys is unofficial. Meta's terms do not allow it, and numbers running it can get banned. We do not pretend this risk away, we design around it:

| Rule                                                                                                     | Why                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| The watcher number **never sends a message**. It is a pure listener.                                     | Sending patterns are what gets numbers flagged. A silent member looks like any quiet participant. |
| The watcher is a **dedicated number**, not anyone's personal number and not the Gupshup business number. | If it gets banned we lose nothing but a SIM. Never risk a number the business depends on.         |
| **Session credentials are backed up** (encrypted, in our database).                                      | A container restart or crash must never require re-scanning the QR.                               |
| A **standby second number** is prepared and documented.                                                  | If the watcher dies, the standby joins the groups and we re-link in minutes, not days.            |
| **The data outlives the number.** Everything is in our database the moment it arrives.                   | A ban loses the ear, never the memory.                                                            |
| Joining groups is done **gradually**, not 500 groups in one hour.                                        | Sudden mass activity is a flag pattern.                                                           |

### Why this cannot run on Vercel

Baileys holds a **permanent live WebSocket connection** to WhatsApp's servers, the same way your phone does. Vercel runs serverless functions that wake up for a request and die seconds later. A phone that turns off after every sentence cannot listen to anything. This needs a process that runs 24/7, reconnects when the connection drops, and keeps session state alive. That is a persistent server, which is exactly what the AWS move in `master-plan.md` gives us. This project and the AWS move are the same journey.

### Why the connector is Node while our backend is Python

Baileys is a Node library. So the connector service is Node, and that is fine, because the connector is deliberately **dumb**: hear event, normalize, store, nothing else. Roughly 500 lines. Zero business logic. All the intelligence (profiling, tickets, Elaya) lives in Python and reads from the database. One small Node ear, one Python brain.

---

## 3. The database design

This is the most important section. The design steals the three lessons that every serious messaging system (WhatsApp itself, Slack, Discord) learned the hard way.

### Lesson 1: store raw first, understand second

WhatsApp has dozens of message types and edge cases (polls, live locations, view-once, ephemeral, system events). Our normalizer WILL have bugs at the start. So every Baileys event is appended to a raw event log **before** any parsing. When we find a normalizer bug, we fix the code and **replay from raw**. Nothing is ever lost to a parsing mistake.

### Lesson 2: identity is the JID, and it is sacred

WhatsApp identifies everything by JID (its internal ID): a person is `919812345678@s.whatsapp.net`, a group is `1203630XXXX@g.us`. Names change, numbers stay. Every table keys on JID, and one table maps JIDs to who they actually are for us (a client, a concierge, a manager). WhatsApp also has newer privacy IDs (LIDs) for some accounts, so the contact table keeps both and maps between them.

### Lesson 3: messages are append-only facts, changes are new facts

A message row, once written, is never edited. An edit is a new row pointing at the original. A delete is a flag flip, never a removal (WhatsApp itself keeps revoked messages this way). Reactions live in their own table because one message gets many. This is what keeps history trustworthy for the AI: the record of what happened never mutates under it.

### Where it lives

Same Supabase Postgres, its own clean table family with the `wag_` prefix (WhatsApp Groups), fully separate from the existing `whatsapp_*` tables. Those belong to **Gia** (the Gupshup one-to-one lead pipeline of the onboarding CRM); the `wag_` family belongs to **Sia** (the client group world). Never mix them, never append a Sia column to a Gia table or the other way around. They meet later inside the client profile, not in the schema.

The messages table is **partitioned by month** from day one. In plain words: Postgres physically stores each month's messages in its own box, so a query about this week never wades through last year. This is the standard trick for high-volume message tables and it is nearly free to set up now, and painful to retrofit later.

Volume check, so we know Postgres is enough: even at 500 groups producing 200 messages a day, that is 100k messages a day, about 36 million a year. Partitioned Postgres with the right indexes handles that comfortably. We do not need Kafka or a separate cluster today. If we ever hit 10x that, the escape hatch is moving these tables to a dedicated Postgres instance, and because the schema is its own clean family, that move is a lift, not a redesign.

### The tables

```
wag_raw_events                     the black box recorder (append-only)
  id, event_type, account_jid, payload jsonb, received_at
  -> everything Baileys emits lands here first, untouched

wag_contacts                       every person we have ever seen
  jid (PK), lid, phone, push_name, business_name,
  participant_role (client|genie|bishop|queen|founder|
                    vendor|watcher|unknown),
  staff_profile_id -> profiles(id)  when they are our team,
  client_id  -> (future client profile table),
  vendor_id  -> (future vendor profile table),
  first_seen_at, last_seen_at

wag_groups                         every group the watcher is in
  group_jid (PK), subject, description, owner_jid,
  group_kind (client|vendor|internal|unmapped),
  client_id -> (future client profile),
  vendor_id -> (future vendor profile),
  member_count, watcher_joined_at, is_active,
  created_at, updated_at

wag_group_members                  who is in which group, WITH history
  group_jid, member_jid, role (member|admin|superadmin),
  joined_at, left_at (null = still in)
  -> a leave writes left_at, never deletes the row,
     so "who was in this group in March" is always answerable

wag_messages                       the heart (partitioned by month)
  id (PK), chat_jid, wa_message_id, sender_jid, from_me bool,
  type (text|image|video|audio|voice|document|sticker|location|
        contact|poll|system|unknown),
  text,                            the text or caption
  quoted_wa_message_id,            reply threading
  wa_timestamp,                    when WhatsApp says it was sent
  received_at,                     when we stored it
  is_revoked bool,                 deleted-for-everyone flag
  edit_of_wa_message_id,           set when this row IS an edit
  raw jsonb,                       the normalized payload, kept for replay
  UNIQUE (chat_jid, wa_message_id, sender_jid)
  -> WhatsApp's own dedup key; a redelivered event hits this
     wall and bounces, so reconnects can never double-store

wag_media                          files, stored by us not by WhatsApp
  message_id ->, media_type, mime, size_bytes, duration_seconds,
  storage_path (S3), thumbnail_path,
  download_status (pending|retrying|done|dead_letter),
  attempts, last_attempt_at
  -> WhatsApp media links EXPIRE, and Baileys hands us ENCRYPTED
     media we must download and decrypt ourselves. Aggressive
     retries inside the window; after the window, dead_letter.
     A partial index on dead_letter is the orphaned-media list
     the health panel shows: message rows whose file is gone.

wag_embeddings                     the search-by-meaning index (pgvector)
  message_id ->, chunk_index, embedding vector, model_version,
  embedded_at
  -> built by a downstream job off the cursor, NEVER at ingest.
     The text sent to the embedding API is MASKED text (section 9,
     the border applies to every AI egress, embeddings included).

wag_reactions
  message_id ->, reactor_jid, emoji, reacted_at
  -> upsert per (message, reactor); removal clears the emoji

wag_pipeline_cursors               how downstream readers keep their place
  consumer_name (PK), last_processed_at, last_message_id
  -> the profiling pipeline, the ticket builder, and any future
     consumer each track their own cursor and read incrementally
```

### The indexes that make retrieval fast

| Query we will run constantly               | Index                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| Open a group chat, scroll history          | `(chat_jid, wa_timestamp DESC)` on messages, the workhorse |
| Full text search across chats              | Postgres full text index on `text`                         |
| Everything one person ever said            | `(sender_jid, wa_timestamp DESC)`                          |
| What has the AI pipeline not processed yet | `(received_at)` plus the cursor table                      |
| Un-downloaded media to fetch               | partial index on media where `download_status = 'pending'` |

Chat scrolling uses keyset pagination (give me 50 messages older than timestamp X), never page numbers. Page numbers get slower the deeper you scroll; keyset stays instant forever. This is how every real chat app does it.

### Access rules

These tables hold client conversations, the most sensitive data we have. Same posture as the rest of Serene: RLS on, reads gated by role (which roles see which groups gets decided when the UI is specced), all connector writes through the service role, and the raw event log readable by admin only. Client chat content never goes into logs.

---

## 4. The phases

### Phase W1. The ground: AWS persistent service. (with or right after the master-plan AWS step)

The connector needs a 24/7 home. This rides the same AWS move already planned.

1. ECS Fargate service for the connector (its own small container, separate from the Python backend container, so a backend deploy never drops the WhatsApp connection).
2. S3 bucket for media.
3. Health checks and an alert when the WhatsApp connection drops (this is our ear, we must know within a minute if it goes deaf).

**Done when:** a trivial Node process runs 24/7 on Fargate, restarts itself on crash, and pages us on failure.

### Phase W2. The database. (1 week, can start immediately, does not wait for AWS)

1. Migrations for the `wag_` family above, messages partitioned by month, all indexes, RLS.
2. Write the schema doc (`docs/modules/whatsapp-groups.md`) so the contract is recorded the way the rest of Serene records contracts.

**Done when:** migrations applied, a seeded fake conversation queries fast, RLS verified.

### Phase W3. The connector. (2 to 3 weeks)

The Node service, kept deliberately thin:

1. **Pairing:** QR flow, session credentials encrypted and persisted so restarts never need a re-scan.
2. **Listening:** handle the Baileys event set: new messages of every type, edits, revokes, reactions, group metadata changes, members joining and leaving.
3. **The two-step write:** raw event to `wag_raw_events` first, then normalize into the clean tables. Normalizer bugs are fixed by replaying raw.
4. **Media fetcher:** download every media file within minutes into S3, because WhatsApp links expire. Retry queue for failures.
5. **History backfill:** when the watcher joins a group, WhatsApp offers recent history. Capture whatever it gives, gradually, group by group.
6. **Resilience:** auto-reconnect with backoff, dedup on redelivery (the unique key does the work), the standby-number runbook written down.
7. **Onboarding the groups:** add the watcher to client groups in slow batches over days, not all at once.

**Done when:** the watcher sits in the first 10 real groups for two weeks with zero message loss (spot-audited against a phone), media downloading reliably, reconnects surviving without duplicates.

### Phase W4. The Serene UI. (2 to 3 weeks, overlaps W3)

What we build in Serene to see it all:

1. **Groups page:** every group the watcher is in, client name, member count, last activity, message volume. Filter and search.
2. **Chat viewer:** open any group, scroll the full history like WhatsApp itself: bubbles, media, voice notes playable, replies threaded, edits and deletes marked. Read-only.
3. **Search:** across all groups or within one, by text, sender, date range.
4. **People view:** click any participant, see who they are (mapped to client or staff) and their messages.
5. **Health panel (admin):** connection status, QR re-link flow right in the UI, events per hour, media queue depth, last-event-seen clock. The "is the ear alive" page.
6. **Mapping tool (admin):** assign each group to its client, mark which members are staff. This mapping is what makes the data meaningful, and a human confirms it once per group.

**Done when:** a manager can find any group, read any conversation, and search history faster than scrolling their phone. Admin can re-link a dropped session without touching a terminal.

### Phase W5. Feed the brain. (this is plan-elaya.md Phase 3c, now with its fuel line connected)

The whole point. The Python pipeline reads incrementally through its cursor and:

1. **Client profiling:** every new message batch updates the group's client profile: preferences, requests, occasions, budget signals, sentiment, open threads.
2. **Ticket detection:** a request spotted in chat ("book us a villa for the 14th") becomes a draft concierge ticket for the team to confirm.
3. **Review capture:** praise and complaints get extracted and logged against the client and the service.
4. **Elaya tools:** new read tools over this data ("what has the Mehta family been asking for this month"), under the same Golden Rule and PII gateway as every other tool.
5. **Voice notes:** transcribed by the existing transcription service, so voice messages join the profile like text does.

This phase gets its own detailed spec before building, like every serious module. The plan here just guarantees the data it needs is flowing and clean.

---

## 5. The order, at a glance

```
NOW        W2  Database schema and migrations        (no dependencies, start today)
WITH AWS   W1  Fargate home for the connector        (rides the master-plan AWS move)
THEN       W3  Baileys connector, raw-first pipeline  (10 pilot groups, 2 weeks proving)
OVERLAP    W4  Serene UI: groups, chat viewer, search, health, mapping
THEN       W5  Client profiling, tickets, reviews     (= plan-elaya Phase 3c)
```

---

## 6. The rules of this layer

1. **The watcher never speaks.** Read-only, forever. The day we want a bot that talks in groups, that is a different number and a different decision.
2. **Raw first, always.** No event is normalized before it is stored raw. Replay is the safety net.
3. **Append-only truth.** Messages are never edited or deleted in our database, only flagged. History must stay trustworthy for the AI.
4. **The number is replaceable, the data is not.** Session backed up, standby ready, everything in our tables the moment it arrives.
5. **The connector stays dumb.** Hear, normalize, store. Intelligence lives in Python, downstream, reading through cursors.
6. **Sia and Gia never mix.** The existing `whatsapp_`\* tables and `/whatsapp` page are Gia (the Gupshup lead pipeline of the onboarding CRM) and are not touched, not extended, not appended to. Everything in this plan is Sia: its own `wag_` tables, its own UI section, its own pipeline. The two meet in exactly one place, the client profile.
7. **Client conversations are the most sensitive data we hold.** Role-gated access, no chat content in logs, media in our private bucket.

---

## 7. Decisions already made (do not re-debate)

| Decision                               | Why                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baileys, not the official API          | The official API cannot see groups. There is no official option for our use case.                                                                                                  |
| Postgres (Supabase), not a new cluster | 36M messages a year is comfortable for partitioned Postgres. A separate cluster is the documented escape hatch if we 10x, and the clean `wag_` schema makes that move cheap later. |
| Node connector in a Python company     | Baileys is Node. The connector is a 500-line dumb adapter, not business logic. Not worth fighting the ecosystem over.                                                              |
| Watcher never sends                    | Ban-risk control number one, and it keeps the connector read-only simple.                                                                                                          |
| Partition by month from day one        | Nearly free now, painful to retrofit at 30M rows.                                                                                                                                  |

---

## 8. What can go wrong, and the defense (added 2026-08-25)

The realistic failure list, walked through against the real scenario: an HNI client sends a voice note, an Instagram link, or a location pin, and ten staff members respond.

### The number layer

| What goes wrong                                                                                                | The defense                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The watcher gets banned and the standby has to join 500 groups in a rush, which is itself ban-trigger behavior | **AMENDMENT to section 2: TWO watchers sit in every group from day one.** Both record everything. The unique key on messages silently drops the duplicates. One dies, coverage continues with zero gap and zero suspicious mass-joining. |
| WhatsApp logs out linked devices when the phone itself stays offline too long (about 2 weeks)                  | The watcher SIMs live in managed office phones: charged, on Wi-Fi, checked weekly. An alarm fires if a session drops. This boring detail is the number one silent killer of these setups.                                                |
| Session credentials lost on crash or redeploy                                                                  | Already covered: encrypted session backup in the database, restarts never need a QR re-scan.                                                                                                                                             |

### The protocol layer

| What goes wrong                                                              | The defense                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp changes the protocol and Baileys (community maintained) lags behind | Pin the Baileys version. Test every upgrade against a throwaway test group before production. Subscribe to Baileys releases.                                                           |
| A message type arrives that our normalizer does not understand               | It stores as type `unknown` AND the raw event is already saved. After we update the parser, we replay from raw and backfill. Protocol drift can delay understanding, never cause loss. |
| Baileys the project dies                                                     | The connector is a dumb, separate container. The swap target is whatsmeow (Go). Nothing downstream changes. There is no Python Baileys and there does not need to be.                  |

### The media layer

| What goes wrong                                                                          | The defense                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice notes are the client's main language and sit in the database as silent audio files | Transcription is part of INGEST, not a later phase: voice note arrives, downloads to S3, transcribes via the existing transcription service, and the text is stored next to the audio. The profiling AI reads it like any message.                                    |
| "Get me this" plus a naked Instagram link means nothing to the AI                        | A link enrichment worker fetches title, thumbnail, and description for every link and stores it beside the message. Instagram fights scraping, so this is best effort via their embed API, but even a thumbnail plus caption turns a mystery URL into a real request. |
| A location pin is just two numbers                                                       | Reverse-geocode every location message: lat/long becomes "Amalfi Coast, Italy", stored beside the pin. "Design a travel plan here" becomes actionable.                                                                                                                |
| WhatsApp media links expire within days; a missed download is gone forever               | Aggressive retries inside the expiry window. Failed downloads show red on the health panel, not buried in a log.                                                                                                                                                      |
| A 200MB video floods memory                                                              | Streamed downloads straight to S3, size caps, media fetching runs in async workers so it never blocks message ingest.                                                                                                                                                 |
| Storage costs grow forever                                                               | S3 lifecycle rules: old media moves to cheaper storage tiers automatically.                                                                                                                                                                                           |

### The meaning layer

| What goes wrong                                                                                                     | The defense                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The AI profiles an unmapped group and guesses wrong about who is the client and who is staff, poisoning the profile | An unmapped group is a landmine. New groups land in an "unmapped" queue in the UI. Profiling is BLOCKED until a human confirms the mapping. Staff membership auto-syncs against phone numbers in the existing profiles table. |
| The AI profiles an unmapped group and guesses wrong about who is the client and who is staff, poisoning the profile | **AMENDED 2026-09-17:** the gate is the LINK, not the members. A group is read only when linked to a member, vendor or internal team. Inside a linked group, tagged staff are staff and everyone else is the member's side (memberships cover family), so an unlabelled household member never blocks. See `plan-sia-intelligence.md` rule 4. |
| Out-of-order or clock-skewed timestamps                                                                             | `wa_timestamp` (WhatsApp's clock) for display order, `received_at` (our clock) for pipeline ordering. Both stored, never conflated.                                                                                           |
| A message burst (wedding week in a big group) overwhelms processing                                                 | The connector only ever does the fast write. Everything heavy (media, transcription, enrichment, profiling) runs async behind cursors and queues, and catches up.                                                             |

---

## 9. Privacy without losing the brain (added 2026-08-25)

The requirement: HNI client privacy is non-negotiable, AND the AI must process the full meaning of every conversation for profiles, tickets, and staff monitoring, with zero percent capability loss. Both at once.

The answer is one idea: **masking is a border checkpoint, not a shredder.**

### Zone 1: the fortress

Our database and our AWS. Everything lives here in FULL detail: real names, real numbers, real locations, full transcripts, all media. The client profile, the tickets, the staff performance monitoring are all built HERE, at 100 percent fidelity. Masking never happens inside the fortress, so nothing is ever lost.

### Zone 2: the border

The single moment text leaves us for a model API. At that border, identity is swapped for CONSISTENT code names: "Rohan Mehta" becomes CLIENT_7, and it is CLIENT_7 every time, in every message, forever. The model reasons at full power ("CLIENT_7 wants a villa in Goa for DATE_2, budget AMOUNT_1, sounded frustrated about the delay") and when the answer returns, the real names are swapped back before storing or displaying. The model never learned WHO. We never lost WHAT.

### The rule that guarantees zero capability loss

**Mask identity, never intent.** Names, phone numbers, exact addresses: masked at the border. "Wants a yacht for their anniversary, prefers Italian food, budget around 40 lakh, always travels with the kids": kept whole, because that IS the signal the profiling runs on.

### The reinforcements

1. Claude via Bedrock does not train on our data and runs inside our own AWS account. The border risk is already low; masking is the belt on top of those suspenders.
2. The `wag` media bucket is PRIVATE (unlike the public Elaya training bucket, which is public on purpose for Gupshup). The Serene UI gets media through signed, expiring URLs only.
3. Group access inside Serene is role-gated with a viewed-by audit trail. The other privacy risk is not the model, it is which staff member can read which client's chats.
4. This is the D-01 pseudonymisation vault the Serene docs always promised. The WhatsApp layer is where it finally gets built, and once built, Elaya's existing PII gateway upgrades to use the same vault.

### Staff monitoring, named plainly

Because staff are mapped per group (section 4, the mapping tool), the same pipeline that profiles clients also measures the team: response time to client messages, who picked up which request, requests dropped or left hanging, tone. This is a W5 deliverable built on the same clean data, and it needs no extra collection, only the mapping.

---

## 10. The ingest discipline, the roles, and where this module lives (added 2026-08-25)

### 10.1 The socket handler does almost nothing

Baileys' `messages.upsert` is a live stream, like water from a tap. If the handler that receives it does slow work (download a 200MB video, call a model, run ticket detection), the stream backs up and messages drop. Silently. So the iron rule:

**The socket handler does exactly two things: write the raw envelope to** `wag_raw_events`**, return.** Milliseconds, every time.

Everything else is downstream work off that table, running as queued jobs :

```text
socket -> wag_raw_events (instant, append-only)
              |
              |-- normalize job     -> wag_messages / contacts / groups
              |-- media job         -> download, DECRYPT, S3, thumbnail
              |-- transcription job -> voice notes to text
              |-- enrichment job    -> links unfurled, locations geocoded
              |-- masking + embedding job -> wag_embeddings
              |-- profiling / ticket jobs (W5, Python)
```

This mirrors the posture the Gupshup webhook already proved: ack instantly, work later.

### 10.2 The write path is direct, no webhook hop

The connector holds a service-role Postgres connection and **writes straight to the database**. There is no HTTP route in between, no webhook to our own backend, no extra hop to fail or slow down. A webhook route would add latency, a second failure point, and a parsing layer for zero benefit. Direct service-role write, full stop. The connector is trusted infrastructure, the same trust class as the existing webhook handlers.

### 10.3 Encrypted media and the dead-letter rule

Baileys does not hand us files, it hands us **encrypted references we must download and decrypt ourselves**, and the reference expires. Miss the window and the media is gone forever even though the message row exists. So the media job:

1. Retries aggressively inside the expiry window (attempts and last_attempt_at tracked on the row).
2. After the window, marks the row `dead_letter`. Never silently forgotten.
3. The health panel shows the orphaned-media list (message rows whose file was lost) so we always KNOW what we lost, even when we could not save it.

### 10.4 Deletes and disappearing messages: tag, never remove

When anyone deletes a message (client or our member), we flip the `is_revoked` tag and keep everything. Disappearing-mode and view-once content that reaches us is stored and flagged the same way. Our database never forgets; the UI shows "deleted" tags so humans see what happened. This is already Lesson 3 in section 3, restated here as a hard rule because it is also an accountability tool: a deleted message is often the most interesting one.

### 10.5 Embeddings: decided now, not discovered later

"Elaya remembers years of chat" means semantic search, which means embeddings and a vector store. That is a real second AI egress path and a real storage decision. **The decision:**

| Question           | Decision                                                                                                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vector store       | **pgvector on the same Supabase Postgres** (the extension is already installed there). One database, one backup story, joins between messages and vectors for free. The escape hatch at serious scale is a dedicated vector database, and because embeddings live in their own table, that later move is a lift, not a redesign. |
| What gets embedded | Normalized message text, voice-note transcripts, and enrichment summaries, chunked per message.                                                                                                                                                                                                                                  |
| When               | A downstream job off the cursor, never at ingest.                                                                                                                                                                                                                                                                                |
| Privacy            | The text sent to the embedding API is **masked text**. Section 9's border applies to every AI egress path, and embeddings are one.                                                                                                                                                                                               |

### 10.6 Who is who: the role model

Every participant in every group resolves to one of these roles (the `participant_role` on `wag_contacts`):

| Role      | Who                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `client`  | The member(s) the group exists for. Usually one or two people per membership (for example husband and wife). |
| `genie`   | Our concierge on the group.                                                                                  |
| `bishop`  | The team manager.                                                                                            |
| `queen`   | The team lead.                                                                                               |
| `founder` | Oversees everything.                                                                                         |
| `vendor`  | Partner-agency staff (vendor groups).                                                                        |
| `watcher` | Our Baileys number(s). Excluded from all analytics automatically.                                            |
| `unknown` | Not yet mapped. A group with unknowns stays blocked from profiling (section 8, the meaning layer).           |

Staff roles sync automatically against phone numbers in the existing `profiles` table; clients and vendors are confirmed once by a human in the mapping tool.

**Vendor groups are first-class.** A vendor group typically holds 2 to 3 vendor staff, around 10 of our staff, and the watcher. Same tables, same pipeline, `group_kind = 'vendor'`, linked to a vendor profile instead of a client profile. W5 gains a fourth output next to client profiling, tickets, and reviews: **vendor profiling**, how each partner performs, turnaround, reliability, and tone, read from the same clean data.

### 10.7 This module is Sia, not Gia

The existing WhatsApp system (the Gupshup number, the `whatsapp_*` tables, the `/whatsapp` page) is **Gia**: the CRM, leads, one-to-one sales chat. It is finished work and it is not touched.

This group-watching layer is **Sia**, its own module, the way the industry keeps systems separate:

|         | Gia WhatsApp (exists)                    | Sia WhatsApp (this plan)                                                   |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Number  | Gupshup business number                  | Dedicated watcher numbers                                                  |
| World   | One-to-one lead chats                    | Client and vendor GROUPS                                                   |
| Tables  | `whatsapp_*`                             | `wag_*`                                                                    |
| UI      | The existing `/whatsapp` page, unchanged | A NEW Sia section in Serene (groups, chat viewer, search, health, mapping) |
| Purpose | Lead pipeline, sales                     | Client profiling, tickets, reviews, vendor and staff intelligence          |

They never share tables and never share UI tabs. They meet in exactly one place: the client profile, where both sources enrich the same person.

---

## 11. The database contract, LOCKED and LIVE (2026-08-27, migration 0169)

Phase W2 is built. The eight decisions, agreed and applied to production:

| # | Decision |
| --- | --- |
| 1 | Message `type` is plain text with NO database CHECK. WhatsApp invents types; an insert must never fail. Unknown stores as `unknown` + raw, backfilled by replay. |
| 2 | Reply links are SOFT references (`quoted_wa_message_id`), never foreign keys. A reply quoting a message from before the watcher joined still stores; the UI shows "quoted message unavailable", like WhatsApp itself. |
| 3 | Reactions are a CURRENT-STATE table (upsert on change, delete on removal). Full history replayable from raw. |
| 4 | Edits are NEW rows chained via `edit_of_wa_message_id`. The original never changes. Deletes flip `is_revoked`; content stays. |
| 5 | Read receipts: `wag_receipts` exists but stays EMPTY BY DESIGN (audit 2026-08-27): WhatsApp only delivers receipt events for messages the account itself sends, and the watcher never sends. The table is kept (costs nothing, and a future two-way account would fill it) — never debug its emptiness, never build features expecting its data. |
| 6 | Polls: raw-only in v1, replayable later. |
| 7 | Every message carries `source` (live / history_sync / backfill) and `normalizer_version` — replay re-processes only old-version rows. |
| 8 | Monthly partitions on `wag_messages` (by `wa_timestamp`) AND `wag_raw_events` (by `received_at`), pre-created through 2027-03, each with a DEFAULT partition so an insert can never fail on a missing month. |

Load-bearing implementation facts:

- **Replay-safe identity:** a message's canonical key is WhatsApp's own triple `(chat_jid, wa_message_id, sender_jid)`. Child tables (media, reactions, receipts) reference the triple, never our uuid, so references survive re-normalization. Normalization is an UPSERT on the triple.
- **The dedup wall:** unique index on the triple + partition column. Dual watchers both record; the second insert bounces silently (smoke-verified).
- **RLS deny-by-default:** enabled on all nine tables with zero user policies. Service role only (connector writes, Python pipeline reads) until the Sia UI (W4) ships role-gated read policies in its own migration.
- **Search:** full-text index uses the `simple` config on purpose — English stemming would mangle Hinglish and roman Marathi.
- **`wag_embeddings` is deliberately deferred** to the embedding job (Step 6e): its vector dimension is pinned to the model chosen then.
- **Partition upkeep:** future months are extended by the connector deploy checklist (later pg_cron); rows past 2027-03 land in DEFAULT and stay fully queryable.
