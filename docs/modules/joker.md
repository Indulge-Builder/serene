# Jokers

> **Purpose:** show what the four Jokers send to clients on WhatsApp and how the clients answer
> (Recommendations & Engagement), and how much the clients themselves are talking in their groups
> (Activity).
> **Audience:** the owner, the Joker team, and the engineers who build and run it.
> **Source-of-truth scope:** the whole Jokers module: capture, replies, Activity, both dashboards,
> their tables, jobs, costs and the owner's decisions.
> **Status (2026-09-28):** built and tested on a local copy of real data. Not in production yet
> (migrations 0248–0251 unreleased, jobs not deployed). See [Going live](#going-live).
> **Last verified:** 2026-09-28 against `src/lib/services/{joker-capture,joker-capture-rules,joker-replies,client-activity-service,joker-board-service}.ts`,
> `src/lib/utils/{client-activity,joker-board}.ts`, `src/components/jokers/`, `src/app/(dashboard)/jokers/`,
> `src/trigger/{joker-capture,client-activity}.ts` and migrations 0248–0251.

---

## At a glance

| | Recommendations & Engagement | Activity |
|---|---|---|
| Question it answers | What did the Jokers send, and how did clients answer? | Is the client's side talking in their group? |
| Unit | One item sent to one client's group (an "opening") | One linked WhatsApp group (one group = one client entry) |
| Source | The Jokers' messages in client groups, read by rules and an AI label | Every message in client groups, counted; no AI |
| Refreshed | Every 3 minutes (the capture job) | Every 5 minutes; the last 30 days every night |
| Cost | AI calls: about $14 a month (estimate) | Nothing |
| Page | `/jokers/recommendations` | `/jokers/activity` |

**Who can open it:** admin, founder, the tech workbench, and anyone holding a `joker` or
`joker_head` seat (`hasJokersAccess` in `src/lib/utils/route-access.ts`). Every Joker sees all four
Jokers and every queendom (owner: "all four jokers for now"). Clicking **Jokers** in the sidebar
opens two compact blocks, one per dashboard; a block opens its dashboard.

---

## Part 1 — Recommendations & Engagement

### What counts

- **WhatsApp client groups only**, linked to a member. No Freshdesk, no direct messages, no calls.
  A group linked later is back-filled. Active **and** Expired members' groups count: the Jokers are
  responsible for bringing expired clients back.
- **Only the Jokers' messages**: whoever holds a `joker` or `joker_head` seat on their Serene account
  (`JOKER_SEATS`), through the WhatsApp numbers linked to that account (both ids). A new Joker needs no
  code change; each item saves the Joker's account, so a company number handed to someone else never
  moves old items. Messages by genies, queens or other staff are not captured.
- **Openings, never follow-ups.** An opening is the first message of a new thing the Joker offers or
  says. A reminder, a "shall I book it?", logistics, call scheduling are follow-ups of the opening
  they continue.
- **The first message decides the tag, and it never changes.**
  - **Recommendation**: the Joker offers something (an experience, an event, a restaurant, a
    product, a trip, news). A pick prompted by something the client said on their own is a new
    Recommendation.
  - **Engagement**: a wish, a check-in, an intro ("I'm your Joker"). A birthday wish followed by
    "shall we send a cake?" stays one Engagement; the offer is its follow-up.
- **Categories** (Recommendations only; owner, 2026-09-28, from the Jokers' own sheet):
  Experience, Retail, Event, Restaurant, News/Info, Travel.

### How an opening is captured (`joker-capture.ts`, `joker-capture-rules.ts`)

1. Every 3 minutes the job reads the Jokers' new messages in linked client groups (48 hours back, so
   a late delivery still lands; a message is decided once it is 3 minutes old, so its photos and its
   second part have arrived).
2. **Rules first, free** (`decideJokerMessage`): pieces of one send fold together; a text sent to 3+
   groups within a day is a broadcast and always an opening; chases, logistics and onboarding are
   follow-ups; the same text re-sent within 7 days is a reminder. Every verdict records its reason.
3. **The AI only where the rules cannot settle it** (a pick inside a live conversation, an offer
   made in reply to the client), and **once per distinct text** to label it: kind, category, title.
   A broadcast to 173 groups is labelled once, not 173 times.
4. **One item, one title.** A new title that names an item already sent in the last 45 days reuses
   that item's title and category (`sameItemTitle`; the AI also sees the recent titles that share a
   word and can say "same as"). A title never carries a person's name.

### How replies are tied and read (`joker-replies.ts`)

Each client reply is tied to the opening it answers, then read:

| How it was tied | Rule |
|---|---|
| **Quote** (swipe-reply to anything in the item's thread) | Certain, at any time |
| **Reaction** (an emoji on the item) | Certain, at any time |
| **Typed words** | Read per conversation by the AI once the client goes quiet, up to 30 days after the item; the AI sees the Joker's latest 5 items plus up to 3 older ones the words name |
| **Thanks** ("ok thanks", 🙏, no AI) | Ties to the newest item when it is the client's first word since it and our team said nothing else since (10-minute gap) |

**Outcomes** (`outcomeOf`): every item starts as **No reply**; there is no "waiting" state and no
cut-off. The client's **latest** reply with a stance wins; words beat emoji.

- **Interested**: yes, or anything that moves toward it ("share details", "price?", "I'll let you know").
- **Undecided**: neither yes nor a clear no ("we're travelling", "too expensive", "let's see").
- **Not interested**: only a **clear** no, enforced by a word list in code (`JOKER_CLEAR_NO`), never
  left to the AI alone.
- **Replied**: an Engagement answered with no offer in it.

A client's yes can also become a ticket; the two are separate (a message can be both).

### The team's Fix

On the List, every answered item has **Fix** (Interested, Undecided, Not interested, Replied on an
Engagement, or **Not a reply to this item**). Anyone who can open the page can use it.
`correctJokerReplyAction` → `correctReplyCore`:

1. the correction is saved, append-only, with the person's name and the client's words hidden
   behind code names (`sia.joker_reply_corrections`);
2. the reply takes the team's reading (or stops counting, for "not a reply");
3. every other reply with the **same words** on the same kind of item follows it (not for "not a reply");
4. from then on the same words get the team's reading without the AI, and the latest corrections
   are shown to the AI as examples.

### The dashboard (`/jokers/recommendations`)

**Filters:** Type (Recommendations, Engagements, or both, as a dropdown), Category, Joker, Queendom,
Client (type a name and tick), Period (Today, Yesterday, Last 7/14/30 days, This month, custom dates).
Default: Recommendations, last 7 days.

**Widgets:** total sent and the reply rate; one tile per outcome; sent per day (split by title,
category or Joker); client response; sent today; most active clients (top 10); sent vs client
response by title and by date; sent by category and Interested by category (pies, stepped shades of
one colour); highest interest (top 10) and for the day; best day to send (reply rate by weekday);
best time to send (weekday × hour heatmap of reply rate).

**Every mark opens its items in the List:** a tile, a bar, a bar segment, a pie slice or legend row,
a heatmap square. The List (never called "items" on screen) shows when, client, Joker, title and
category, outcome, what the client said and how long after, the Fix, and a link to the group in Sia;
it can be searched by title or client.

---

## Part 2 — Activity

### Client or team: who is counted

Every message in a client group comes from someone. Before counting, each sender is placed on a
side; the first answer wins (`sia.client_side()`, used by both the counting and the message list):

1. sent from **our own WhatsApp number** (the number Serene reads the groups through) → team;
2. the **member's own number, in their own group** → the client, whatever else is true;
3. an id in **`sia.team_senders`** that was team when it wrote → team. An id is team when any of these
   is true:
   - linked to a **Serene account** by phone (the staff link, every 15 minutes);
   - tagged with a **position** (genie, bishop, queen, joker, founder, watcher);
   - linked to a **vendor** (vendors are never in client groups; a safety net);
   - **"Indulge"** in the WhatsApp name;
   - writes in **6 or more different client groups** in 90 days (no client does);
4. anyone else → **the client's side**: the member, family, a plus-one, an assistant.

The team list keeps **history**: an id that stops being team gets `team_until` and is never deleted,
so a recount judges each message by who the sender was when it was sent. A company number handed to
a new hire stays team throughout (the position tag stays when an account is deactivated).

**What counts as a message:** everything a person sends, including a message later deleted. Not
counted: WhatsApp notices (joined, left, renamed), edits (the same message again), the album
envelope (its photos arrive as their own messages) and WhatsApp's own background traffic.
**A reaction makes the client active but is not a message.**

### Active and Silent (owner, 2026-09-28: two states, never a third)

- **Active**: a client message or reaction in the **last 14 days**.
- **Silent**: none for 14 days or more.

Active + Silent always equals the total. These use the 14 days whatever the Period filter says; the
Period changes the message counts and the charts.

**One group = one client entry.** A client with their own group and a family group is two entries,
each with its own numbers (owner: "what matters is the groups").

### The dashboard (`/jokers/activity`)

**Filters:** Queendom, Client (type and tick), Membership (Active and Expired, both on; a member with
no status appears as "No status"), Period. No Joker filter. No team-messages widget. Default: last 7
days, with no comparison to the previous period.

**Widgets:** Active clients (the headline tile), Client messages (+ reactions), Silent 14+ days (and
how many are Active members); client messages over the period (one day shows its 24 hours); active
clients per day; how long they've been silent (14–30, 31–60, 61–90, 91+ days, no word on record);
most active clients; silent clients (Active members first, then the longest silent; "Last word: Our
team" when we wrote last and the client hasn't answered); by queendom (active, silent, messages);
busiest day of the week (messages a day, averaged); when clients are talking (weekday × hour).

**Clicks:** a client mark (Active, Silent, a day's bar, a queendom, a silence bucket, a silent
client) opens the **clients** in the List; a message mark (the Client messages tile, a point on the
messages line, a Busiest-day bar, a heatmap square, a most-active client) opens the **client
messages themselves** (when, client and group, who wrote it, the text), each with a link to that
message in Sia.

---

## The data

All in schema `sia`, RLS on, service role only; the pages and actions gate with `hasJokersAccess`.

| Table / function | Migration | What it holds |
|---|---|---|
| `joker_texts` | 0248 | One row per distinct text a Joker wrote: kind (→ tag), category, title. Labelled once. |
| `joker_openings` | 0248 (+0249) | One row per item sent to one client's group: client, queendom on the day, Joker, time, text, **outcome**, first and last reply, reply count. Every R&E number counts these. |
| `joker_messages` | 0248 | Every Joker message in a client group and what it was: opening, piece, follow-up, undecided, unlinked. The capture's working record. |
| `joker_replies` | 0249 | Every client message or reaction tied to an item: how it was tied, what it said, whether it counts. |
| `joker_reply_corrections` | 0249 (+0251) | Every Fix: who, from what, to what, the words masked, `not_a_reply`. Append-only. |
| `team_senders` | 0250 | Every WhatsApp id that is not the client's side, with why and `team_until`. Never deleted. |
| `client_activity_daily` | 0250 | One row per linked client group per India day: client messages, reactions, how many people on the client's side wrote, first/last client message, our team's last message, and both by hour. Every Activity number adds these up. |
| `client_side()` | 0250 | THE side rule. |
| `refresh_team_senders()`, `refresh_client_activity(from, to)` | 0250 | The recount. |
| `client_activity_board(days)` | 0250 | The Activity page's one read (compact JSON). |
| `client_activity_messages(...)` | 0250 | The client messages behind a chart mark. |
| `joker_board(days)` | 0251 | The R&E page's one read (compact JSON). |

Read only, never changed: `sia.wag_messages`, `wag_reactions`, `wag_contacts`, `wag_groups`,
`member.members`, `sia.queendoms`, `public.profiles`.

## The jobs

| Task | Schedule | Switch | What it does |
|---|---|---|---|
| `joker-capture` (`src/trigger/joker-capture.ts`) | every 3 minutes | `elaya_settings.joker_capture_enabled`, seeded **false** | Capture openings, then tie and read replies. |
| `client-activity` (`src/trigger/client-activity.ts`) | every 5 minutes | `client_activity_enabled`, **on unless false** | Refresh the team list, recount today and yesterday. A client who writes shows as Active within 5 minutes. |
| `client-activity-nightly` | 04:00 IST | same | Recount the last 30 days (a phone linked late corrects the past). |

Measured locally: team list 0.13 s, today + yesterday 0.06 s, 44 days 1.6 s.

## Costs

- **Labels:** about $0.0015 per distinct text (a broadcast is one text).
- **Reply reading:** about $0.0018 per conversation read; about 255 a day across all Joker groups →
  about **$14 a month** (estimate from the local copy).
- **Activity:** nothing (counting in the database).

## Privacy

- Client names never reach the AI: each group has its own code names (`openVault`, shared with the
  member profiler), phone numbers and emails are masked, and a leak check stops the read.
- Reports with real client names and words are written **outside the repo**
  (`~/Desktop/serene-backups`), never committed. Real client data is never published to a shared link.

## Testing tools (`scripts/jokers/`)

| Script | What it does |
|---|---|
| `copy-chats-for-testing.ts` | Copies real client-group chat from production **read-only** into the local database. `--all-groups` copies every linked client group and keeps staff links (pointed at one local stand-in account; no staff details copied). |
| `capture-pilot.ts`, `replies-pilot.ts` | Dry-run the capture and the reply reading on any window; compare with Lilian's sheet. `--apply` only on localhost. |
| `titles-check.ts` | Replays titles through the one-item-one-title rules. |
| `activity-pilot.ts` | Recounts one day locally and reports who was put on which side in sample groups, plus client-side senders seen in 2+ groups (the likeliest missed staff). |

**Checked on real data (local copy):**
- **Recommendations:** the owner hand-checked about 10 captures: "perfect, spot on". A Fix saved in
  the List moved "Ah may be" from Interested to Undecided.
- **Activity, 27 Sep:** 805 client messages and 49 reactions across 111 groups. Of 421 groups, 286
  were Active and 135 Silent. In the sample groups every staff member landed on the team side.
- **Totals agree:** the per-hour counts, the messages list and the daily totals all give the same 805.

## Owner decisions (2026-09-23 → 2026-09-28)

- WhatsApp only; openings only; the first message decides the tag.
- Replies counted however late; no waiting state; latest stance wins; Not interested only on a clear no.
- Lilian's "Yes" column means the client responded (used only to test).
- Expired members included; the Jokers bring them back.
- Categories: Experience, Retail, Event, Restaurant, News/Info, Travel.
- One item, one title.
- Dashboard layout from the owner's reference, in Serene's design.
  - Type as a dropdown with both allowed; the second tab is called "List"; every mark opens its rows.
  - No client-response chips; pies in shades of one colour; a Best day widget.
- Access: Jokers, the Joker head, founder, admin; every Joker sees all four.
- Activity:
  - no Joker filter and no team-messages widget;
  - Silent = 14 days; Active/Silent only, never a third state;
  - one group = one client entry;
  - last 7 days with no previous-period comparison;
  - active clients per day only (no separate groups chart);
  - "Last word" shows only "Our team";
  - a recount every 5 minutes.
- Jokers home: two compact blocks, title only; no explanatory text on the dashboards.
- No trial run beside Lilian's sheet before going live (2026-09-28).

## Going live

No trial run beside Lilian's sheet (owner, 2026-09-28): the local tests on real data are the check.

**Before the owner's local test (engineering, local only)**
1. ~~Find the Jokers by their Serene accounts~~ done (2026-09-28): seats + linked WhatsApp ids; each
   item saves the Joker's account (`joker_profile_id`, 0251).
2. ~~A one-off back-fill task~~ built (2026-09-28): `src/trigger/jokers-backfill.ts` (`jokers-backfill`),
   started by hand from the Trigger.dev dashboard, never on a schedule. The activity part was run
   locally over 90 days (2 seconds, 7,968 day-rows).
3. ~~Re-label the local copy with the six categories~~ done ($1.07). The local reply reading of 22–28
   Sep was skipped by the owner's choice, so locally those days show mostly No reply.

**The owner's local test:** open `/jokers` in the local app, click through both dashboards, try the
filters and the Fix; changes are made and re-checked locally.

**The pull request:** update the branch from `main` (renumber the migrations if `main` has added any
since), `pnpm build` clean, check the other pages that use the extended shared pieces (filter bars,
bar charts, tiles), then commit, push and open the PR — only on the owner's word.

**Release (additive migrations: the database first, then the code; `docs/operations/deployment.md`)**
1. Migrations 0248–0251 to production with the Supabase CLI (list → dry run → push → verify), on the
   owner's go-ahead. The current app keeps working.
2. Merge the PR: Vercel deploys the pages.
3. `pnpm trigger:deploy`: the Activity recount (every 5 minutes, nightly) starts; the capture job
   registers but stays off.
4. Activity back-fill (free): run `jokers-backfill` with `{ "part": "activity" }`. It recounts the
   last 90 days; the Activity dashboard is full at once.
5. Switch the capture on (`joker_capture_enabled`, through a migration or the owner's explicit word),
   then run `jokers-backfill` with `{ "part": "capture" }` (optional `"days"`, default 30, and
   `"maxUsd"`, default 20). It refuses while the capture is off. It records the Jokers' items of
   the window and reads the replies in chunks, each saved before the next, and stops when nothing is
   left, at the spend cap (checked between chunks; one chunk costs well under a dollar) or after 50
   minutes. Starting it again carries on where it stopped; nothing is bought twice. Expect about
   $15 for a month.
6. Check both dashboards on the live site with the Jokers.
