# The Member and Ticket Plan

> **Purpose:** the architecture for the two halves of Sia that are not built yet: the living member
> profile, and the ticketing system that replaces Freshdesk. One document, both halves, because a
> ticket is the richest thing we ever learn about a member and a profile is the thing that makes a
> ticket easy.
> **Audience:** the founder and the engineers who will build it.
> **Status:** v2, 2026-09-15. Version 1 was written the same morning from exports and old code;
> this version is grounded in the live Freshdesk account (read with the API key the founder
> supplied), the mirror that now exists in Serene (migration 0193, `docs/integrations/freshdesk.md`),
> the WhatsApp archive, the member app's code and the three earlier plans (`plan-whatsapp.md`,
> `plan-sia-intelligence.md`, the Notion "Concierge" vision). Items marked **DECIDE** need the
> founder. Everything else is a recommendation with a reason.
> **Founder answers recorded 2026-09-15 (evening):** `/freshdesk` stays admin and founder for now; the 78 Freshdesk agents are stale and are NOT loaded as users (a fresh roster comes when profiles are created); the acknowledgement stays fully human (Serene suggests what to send, the agent types it, no model ever posts in a member group); the `sia` schema is the whole module and the WhatsApp tables are one family inside it (no rename); SLA policies, statuses and tags get a settings page in Sia, not code; the member app is a later addition to the profile; the API rate limit is not a worry, the mirror is the priority consumer.
> **What it supersedes:** the 2026-09-04 decision that "Freshdesk is and stays the ticket system"
> (`plan-sia-intelligence.md` section 9, decision 1). Freshdesk stays the ticket system only until
> Serene's own ticketing is proven; from today it is also a mirrored, learnable data source.

---

## 1. What we are building, in plain words

A member of Indulge is a person we serve for years. Today the memory of that person is spread across
a WhatsApp group, a Freshdesk contact, a Zoho customer, an app account, and the heads of the genies
who worked with them. Nobody can ask one question and get one answer.

We are building three things on top of the member spine that already exists (`public.members`):

1. **The Freshdesk mirror (built today).** A faithful copy of the ticket system as it runs now,
   updated every minute and within seconds on a change, with a movement history Freshdesk itself
   does not keep. It is the classroom: Serene learns from it how tickets are born, moved, and
   closed, and which WhatsApp message started which ticket, before it takes the work over.

2. **The living member profile.** Everything we know about a member, kept as evidence-backed facts,
   summarised into one fast card, indexed for search by meaning, and scored for how happy the member
   is right now. It updates itself from every ticket, every group message, every genie note, and
   every tap in the app. Elaya reads it on both channels before she answers anything about a member.

3. **The ticketing system.** A member request becomes a ticket inside Serene: classified, attached
   to the member, pre-filled with what we already know (their addresses, their usual vendor, their
   dislikes), assigned to the right genie, moved through clear stages, watched by a small per-ticket
   agent we call the **sentinel**, and closed with the member informed. Freshdesk becomes history.

Elaya is the face of all of it. The sentinels are her hands. The genie is still the craft.

---

## 2. The ground truth (read live, 2026-09-15)

### 2.1 What Freshdesk actually holds

Read from the account through the API, not from an export.

| Fact | Value | What it means for the design |
| --- | --- | --- |
| Tickets | #415 (30 Jan 2024) to #55054 (14 Sep 2026), about 55,000; 2,217 created between 1 and 14 September, so about **150 a day**; 75 open at the time of reading | Build for 200 a day, comfortable at 500. Not 30 |
| Queendoms | **Three**: Anishqa's, Ananyshree's, Sanika's (created Nov 2025). Nine more groups: Bishop, Concierge, Finance and Billing, Global Events, Indulge Shop, Jokers, Management, Queendom, Retail | The org unit is the queendom (decision 3a of 2026-09-04). The other groups are departments a ticket can be handed to |
| Agents | 78 accounts, many stale, job titles like "Concierge Manager" | Mirrored for display only (names on tickets). NOT the roster: the founder supplies the current roster when profiles are created (T0) |
| Statuses | 2 Open, 3 Pending, 4 Resolved, 5 Closed (customers see "Did not solve"), 6 Nudge Member, 7 Nudge Vendor, 8 Ongoing Delivery, 9 Invoice Due (Finance group only), 9000 Assigned to AI Agent. Nudge Member, Ongoing Delivery, Invoice Due and the AI status stop the SLA timer; Nudge Vendor does not | The state machine in section 7.3 keeps every one of these meanings |
| Category | `cf_category_of_request`, required, nested three levels: Travel (Flight > Tickets or Web Check-in; Hotel Booking; Car Transfer; Experiences; Airport Assistance; Visa), Dining, Retail (Bag, Watch, General, Gifting), Special Request, and the rest | The brief vocabulary. The sub-category was blank on 59% of the July export, so the model should fill it |
| Type | 14 values the SLA policies key on: "Travel - Flight", "Travel - Itinerary", "Travel - Hotel Booking", "Travel - Car transfers", "Travel - Airport Protocols", "Travel - Experiences", "Travel - Visa", "Dining", "Retail - General", "Retail - Watches", "Retail - Bags", "Gifting", "Special Requests", "Events" | Two overlapping vocabularies (category and type) exist because SLA policies can only key on type. Serene keeps one |
| SLA policies | 9. Most types: respond within 15 minutes, resolve within 8 business hours, all priorities the same; watches and bags 48 hours; the default policy 24 hours first response. Business hours 09:00 to 20:00 IST. Escalation: resolution breaches on Travel go to Anishqa | These are the real numbers to seed section 7.2's policy table with. Note that priority does not change the target today |
| Priority | Low 55%, Medium 41%, High and Urgent 4% (July export) | Priority is almost never set deliberately, and the SLA ignores it. Elaya should suggest it and the SLA should use it |
| Resolution | 62% resolved inside a week, median 22 hours, p90 73 hours (July export) | A ticket lives one to three days; the sentinel lives days |
| Custom ticket fields | About 110 `cf_*` fields, most of them checkbox "task list" items per category (MMT checked, hotel concierge called, cost or timeline informed …). The brief fields: pax, date, from and to location, budget, request, product details, events, note, poc, time, duration, luggage, airport, early check-in, assistance required, gift specifications, quantity, model, delivery contact. Also `cf_escalation` (Delay in Response, Unable to solve), `cf_is_the_request_billable`, invoice amount and GST | The typed `brief` per category in section 7.2 replaces all of this; the checkbox task lists become the sentinel's checklist |
| The WhatsApp link | `cf_periskope_message_id`, `cf_periskope_chat_id`, `cf_periskope_ticket_id`: Periskope (a WhatsApp-to-Freshdesk tool) stamps the originating message on some tickets, and receives every ticket update by webhook | When present, this is the ground truth for "which message became this ticket". Where absent, the join is contact phone + member + time |
| Contact fields | 51, of which 40 are preferences: birthday, anniversary, marital status, pet, sport, favourite brand, designer, book, country, travel frequency, car, watch, stays (Modern, Heritage, Boutique), flight seat (Window, Aisle, Centre), veg or non-veg, allergies, diet, drink, food, restaurant, coffee, cuisine, dessert, flowers, blood group, diabetic, need assistance with, company and designation, instagram, linkedin | The profile facet vocabulary the team already thinks in. Section 5.4 keeps all of it |
| Conversations | Almost entirely internal notes (417 of 417 in the July sample); member replies live in WhatsApp | Freshdesk holds the work log, WhatsApp holds the conversation. The mirror joins them |
| Rate limit | **50 API calls a minute** for the account | Every sync is budgeted (42 a minute, 6 in reserve). The founder's call: the mirror is the priority consumer; a full history pull takes about six hours for tickets and a day for threads, once |
| Automations | 22 creation rules, 30 time-trigger rules (per-category escalation ladders that reassign to a manager after 1, 2, 3 breaches), 30 update rules; webhooks already go to the member app, the old dashboard and Periskope | Freshdesk's escalation ladder is codified in rules. Section 7.9 keeps the ladder, in a policy table |

### 2.2 Freshdesk is connected. What the mirror is

Built 2026-09-15 (`docs/integrations/freshdesk.md`, migration 0193): a `freshdesk` schema in the
same database holding tickets, threads, contacts, agents, groups, fields, SLA policies, and two
things Freshdesk does not give us:

- **`ticket_changes`**, append only: every field flip the sync observes (status, agent, group,
  priority, type, category, due dates, escalation, tags, every custom field). This is how "how a
  ticket moves" becomes data. Resolution is the sync cadence: a minute from the poll, seconds
  from the webhook.
- **`member_id` on every ticket and contact**, resolved against the spine by Freshdesk contact id
  and then by E.164 phone. This is how tickets and WhatsApp groups meet on the same person.

The minute task polls `updated_since`; the webhook route brings a change in within seconds; the
backfill pulls the 55k history oldest-first while the threads come newest-first. `/freshdesk` shows
it all. Serene never writes to Freshdesk.

### 2.3 What the mirror teaches, and how (the learning programme)

This is the founder's stated purpose for the connection: learn how the work really flows before
we take it over. Each lesson is a query or a labelled set the mirror makes possible.

| Lesson | Source | Output |
| --- | --- | --- |
| How long each stage takes, per category, per queendom, per agent | `ticket_changes` on `status` joined to `tickets` | The real SLA numbers for section 7.2, replacing the flat 15 min / 8 h |
| Which message became which ticket | `cf_periskope_message_id` where stamped; else `sia.wag_messages` in the member's group within the hour before `fd_created_at`, sender = member | The intake golden set (T3): message, ticket, category, brief, the delay from message to ticket |
| Which messages are updates to an open ticket, and which are chatter | Member messages in the group between a ticket's creation and its resolution, against the notes written right after them | The `update` and `chatter` labels of the intake exam |
| What the bishop reads and what makes them ping a genie | Notes in the internal groups ("Jokers", "Office Indulge Backend") that name a ticket number or a member, against the ticket's timeline | The sentinel's escalation rules, learned from real pings |
| Who handles what, and how well | `tickets.responder_id` by category and outcome; time to first note; reopen rate | The genie picker's learned speciality weights (section 7.5) |
| What a request brief must carry, per category | The filled `cf_*` fields by category over 55k tickets | The Zod brief schemas of section 7.2, from evidence rather than guesswork |
| What members ask for, and how often | `tickets` by `member_id`, category, month | The first facts of the profile layer, and the anticipation rules of T7 |
| How much money flows through tickets | Notes matching "Cost Price / Selling Price / paid via", `cf_invoice_amount`, the Invoice Due status | The `money` shape of section 7.10 |

None of this needs a model to start. The first four queries are SQL over the mirror and the
archive. Their outputs are the exams every later tranche is graded against.

### 2.4 What the member app knows about a member

The app's own user record is thin: phone, role (`paid` or `unpaid`), push flag. The rich things are
in its side collections, and none of them reach Serene today:

| App collection | What it is | What it tells the profile |
| --- | --- | --- |
| `wishes` (the bucket list) | Free text wishes, done or not | Stated intent. The best "what would delight them" signal we have |
| `saved_items` | Products, experiences, posts the member saved | Interest by category and brand |
| `member_location` | Current point plus a trail | Where the member is this week. "Dinner tonight" means Dubai, not Delhi |
| `telemetry_events` | Screens viewed, per session | Browsing interest (watches, villas). Low weight, high volume |
| `inquiries` | Product enquiries | Already flow into Serene as `lead_product_enquiries` (migration 0180). Should attach to the member, not only the lead |
| `concierge_snapshot` | A mirror of the member's Freshdesk tickets | Goes away once the app reads tickets from Serene (section 7.11) |
| Wallet and renewals | Zoho-first: payment links, invoices, tokens | Membership and money. Serene already holds the membership summary on the spine |

The old Atlas `member_profiles` table held the same shape the team wants (personal, travel,
lifestyle, passions, an `elia_notes` jsonb the model wrote). Right idea, wrong storage: one mutable
jsonb per member, no evidence, no history. We keep the vocabulary and change the storage.

### 2.5 What Serene already has and reuses wholesale

| Piece | Where | Reused for |
| --- | --- | --- |
| The member spine | `public.members` (0181), 598 members, 207 groups mapped | Every fact, ticket and score hangs off `member_id` |
| The Freshdesk mirror | `freshdesk.*` (0193), `freshdesk-sync.ts`, `/freshdesk` | The classroom (2.3), the history import at cutover, the transition's shadow comparison |
| The WhatsApp archive | `sia.wag_*` (0169 onward), 108,879 messages, raw first, append only, cursor table | The intake classifier and the profiler are cursor consumers |
| The Sia UI | `/sia`, `sia-service.ts`, `SiaGroupInfoPanel` | The member card and the ticket rail render inside the panel that exists |
| The Python brain | `backend/app` on Fargate, both channels since 2026-09-04 | The sentinel worker, the intake consumer and the profiler are entry points in the same service |
| The write bridge | `/api/elaya/bridge`: Python thinks, Node mutates | Every ticket write Elaya makes goes through it. Never a second write path |
| Model tiers | `llm_providers` rows routing, reasoning, heavy | Classification on routing, judgement and drafts on reasoning, weekly digests on heavy |
| The PII gateway | `pii.py`, `pii.ts` | The regex floor under the vault (section 5.9) |
| `elaya_actions` | The proposal ledger with propose, approve, dismiss, execute | Sentinel and intake proposals are rows here. The Approve or Dismiss card is the UI this plan finally needs |
| Notifications | `createNotification` + the category catalog (0133) + Web Push + WhatsApp fan-out | Every alert rides this. New categories are catalog entries |
| Tasks | `tasks`, `task_events` (Realtime), `task_gia_meta` pattern, reminders | Sub-work on a ticket is a task with `task_ticket_meta`. No second task engine |
| Vendors | `vendors`, `vendor_engagements` (source `ticket` already reserved), `rankVendorsForRequest`, `find_vendors` tool | The ticket writes the engagement ledger and asks the ranker with the member's context |
| SLA engine pattern | `sla_policies`, `lead_sla_timers`, `src/trigger/lead-sla.ts` | The shape of the ticket SLA policy table. The evaluation moves into the sentinel |
| Round robin | `pick_next_agent_for_domain` with an advisory lock | The pattern for `pick_genie_for_ticket` |
| The eval harness | `evals/` | The intake exam, the extraction exam, the retrieval exam |
| Redis cache-aside | `withRedisCache` | The member snapshot read |
| pgvector | Installed since 0110 | The member index |
| The budgeted API client | `freshdesk-api.ts` `FdBudget` | The posture for every future third-party pull (Zoho, the app) |

Nothing in this plan creates a second pipeline, a second brain member, a second write path, or a
second UI stack.

---

## 3. The shape in one picture

```text
              SOURCES (truth arrives)                          THE CLIENT (one person)
  WhatsApp group archive (sia.wag_messages, cursor)     ┌────────────────────────────────────┐
  Freshdesk mirror (freshdesk.tickets + ticket_changes) │ members            the spine        │
  Sia tickets + ticket events (this plan)               │ member_facts       truth, append-only│
  Genie notes on the member card                        │ member_health_events  live score log │
  Member app signals (wishes, saves, location, taps)    │ member_snapshot    the fast card     │
  Zoho / subscriptions (membership, money)              │ member_chunks      search by meaning │
                 │                                      └────────────────────────────────────┘
                 ▼                                                     ▲
        ┌─────────────────┐   masked at the border   ┌─────────────────┴──────────────────┐
        │ intake consumer │ ───────────────────────► │ profiler + embedder (Python worker) │
        │ (per message)   │                          └────────────────────────────────────┘
        └────────┬────────┘
                 │ proposes
                 ▼
  ┌──────────────────────────────┐    wakes on events + timers    ┌──────────────────────┐
  │ sia.tickets + ticket_events  │ ◄────────────────────────────► │ sentinel worker      │
  │ (state machine, SLA, brief)  │                                │ one actor per ticket │
  └──────────────┬───────────────┘                                └──────────┬───────────┘
                 │                                                           │ reports
                 ▼                                                           ▼
  Genie board · Member dossier · Bishop approvals         Elaya (proposal cards, both channels)
```

Two rules make the picture safe: truth tables are append only, derived tables are rebuildable; and
nothing leaves for a model or an embedding API without passing the vault.

---

## 4. The laws of this layer

1. **One member, one spine.** `public.members` is the only identity. Nothing profiles a human who is
   not a row there. Unmapped groups stay unprofiled.
2. **Truth is append only.** `member_facts`, `ticket_events`, `ticket_message_links`,
   `member_health_events`, `member_access_log`, `freshdesk.ticket_changes` are never updated or
   deleted. A correction is a new row that supersedes the old one.
3. **Derived is rebuildable.** `member_snapshot`, `member_chunks`, the ticket `summary`, the health
   score: any of them can be dropped and rebuilt from truth. Nobody edits them by hand.
4. **Nothing leaves unmasked.** Every model call and every embedding call goes through the vault.
   Names, phones, emails swap for stable code names. Intent, places, preferences stay whole.
5. **The queendom is the boundary.** A member belongs to one queendom. Staff of that queendom see the
   member; admin and founder see everything. This is RLS, not a UI filter.
6. **Every automated decision is a run.** Model, prompt version, tokens, evidence span. A fact or a
   proposal without a run is a bug.
7. **The exam gates every prompt.** Score up, ship. Score down, fix. The mirror is the ground truth
   the exams are cut from.
8. **Elaya proposes, humans approve, until the exam earns autonomy.** State changes that touch a
   member (a ticket created, a status moved, a message sent) start as proposals. Autonomy is granted
   per action type, by category, once precision is proven for weeks, and it is revocable by one row.
9. **The watcher never speaks.** The Baileys number reads. Whatever speaks to a member is a separate
   identity with its own rules (section 7.8).
10. **One pipeline, one brain, one write path, one UI.** New consumers are cursor rows, new tools are
    registry entries, new writes go through the bridge, new cards live in the Sia panel.
11. **One schema per module.** `sia` is the Sia module's schema: the WhatsApp archive is one family
    inside it (the `wag_` prefix), the ticketing tables join it as `sia.tickets`, `sia.queendoms` and
    so on. The founder asked whether naming the WhatsApp schema `sia` was a mistake: it is not,
    because the schema is the module and the prefix is the sub-part, so nothing is renamed (a schema
    rename would touch the live watcher, the Python pipeline and the Sia UI for no gain). The mirror
    lives in `freshdesk` and is never merged into `sia`; the member layers live in `public` beside
    the spine because Gia and Sia both read them.

---

## 5. Part A. The member twin (how member data is stored)

The founder's ask, in his words: a virtual image of the member, updating in real time from every
input, with the latest, relevant, correct data in the least time possible, and the right thing
surfaced at the right time. Atlas stored the member as two tables of key-value columns plus a
few jsonb bags. That is where every CRM starts and where every CRM gets messy: one mutable blob
per member, no evidence, no time, no way to say "this changed in July". The design below is the
fresh answer. It is one Postgres, seven stores, one loop, and every piece has exactly one rule.

### 5.1 What we actually hold about a member (the inventory)

Read from Atlas (`members` + `member_profiles` + `profile_sources`), the Freshdesk export (the
contacts' 40 preference fields, 50k tickets, 209k notes), the WhatsApp archive, the member app's
collections and its telemetry, and Zoho.

| Kind of data | Examples | Shape | Volume | Where it lives in the twin |
| --- | --- | --- | --- | --- |
| Identity and membership | name, phones, emails, kingdom, tier, plan dates, amount, status, Zoho customer id, Freshdesk contact id, app member id, WhatsApp group | a few dozen typed columns | 1 row per member | **Store 1**, the spine |
| Simple facts | date of birth, blood group, marital status, anniversary, primary city, company and designation, social handles, "sunrise or sunset person" | one value each, sometimes changing | tens per member | **Store 2**, facts |
| Preference lists | seat, stays, cuisines, restaurants, brands, cars, watches, sports, drinks, coffee, dessert, flowers, diet, allergies, need assistance with | lists, multi-valued, contradictory over time | tens per member | **Store 2**, facts |
| Free-text notes by humans | the Atlas notes scratchpad, ticket internal notes, genie observations | prose | 209k notes today | **Store 5**, documents, and the fact they yield in **Store 2** |
| Conversations | WhatsApp group messages, replies, media | prose in sessions, 85% text | 108k messages, ~2k a day | **Store 4** (as events) + **Store 5** (as windows) |
| Requests and their outcomes | tickets, categories, briefs, timings, vendors used, cost and price, satisfaction | structured with prose attached | 50k, ~150 a day | **Store 4** (events) + **Store 5** (thread summaries) + **Store 2** (the facts learned) |
| Behaviour | screen time per product, explore card, post, category; saves; bucket-list wishes; tastes and connect interests; location city and trail | small typed events, high volume | thousands a day across members, wiped after 180 days in the app | **Store 4** (events) with a 180-day life, distilled into **Store 2** and **Store 3** |
| Money | wallet, invoices, payments, renewals | typed, ledgered elsewhere | tens per member | **Store 4** (events) pointing at Zoho; never cached balances |
| Model summaries | Atlas `elia_profile`: summary, sentiment, traits, communication style, relationship strength, recurring themes, milestones | prose + lists, versioned, may be wrong | 1 per member | **Store 6**, the snapshot (rebuilt), and the facts it can be reduced to in **Store 2** |
| People and things around the member | spouse, children, house staff, the driver, favourite venues, cities, vendors they liked or refused, brands, other members they know | a network | tens of edges per member | **Store 3**, relations |

The lesson from the inventory: four things are true of every input. It has a **source** and a
**time**, it may **contradict** an earlier input, and it may be **wrong**. The stores below are
built so those four facts are never lost.

### 5.2 The seven stores

```text
                 STORE 1  members (the spine)                 who; the join keys; membership
                     │
     ┌───────────────┼───────────────────────────────┐
     ▼               ▼                               ▼
 STORE 2         STORE 3                          STORE 4
 member_facts    member_relations                 member_events
 typed, append   the relationship map             the timeline: every touchpoint
 only, evidence  (member ↔ person/vendor/place/   from every source, one row each,
 confidence,     brand/interest/other member,     partitioned by month
 supersedes      strength, first/last seen)
     │               │                               │
     └───────────────┼───────────────────────────────┘
                     ▼
                 STORE 5  member_documents + member_chunks     prose + embeddings (masked)
                     │
                     ▼
                 STORE 6  member_snapshot (+ Redis)            the twin's face, versioned jsonb
                     │
                     ▼
                 STORE 7  member_health_events + member_anticipations   the score, and the right time
```

Truth stores are append only (2, 4, 7's ledger). Derived stores are rebuildable (3, 5, 6, 7's
anticipations). All in `public` beside the spine, because Gia and Sia both read them.

#### Store 1, `members`: the spine

Exists (0181). Gains `kingdom_id`, `tier`, `app_member_id`. Holds identity, the join keys to
every other system (Freshdesk contact, Zoho customer, WhatsApp group, app member) and the
membership summary. Nothing else, ever. When a fact is wrong here it is a data-entry error, not
an opinion, so it is the one store a human edits in place.

#### Store 2, `member_facts`: typed facts, append only

One row per observed fact. Both the simple values and the preference lists live here; a list is
several rows with the same facet and key.

| Column | Meaning |
| --- | --- |
| `member_id`, `facet`, `key` | facet from the controlled vocabulary (below); key the sub-name: `address.farmhouse_alibaug`, `preference.seat`, `family.daughter` |
| `value`, `value_json` | the plain-text value, and the structured form when there is one (an address, a date with recurrence, a number with currency) |
| `polarity` | `likes`, `dislikes`, `neutral`: "prefers window" and "hates aisle" are two rows, not one field with a sign lost |
| `source`, `evidence`, `run_id` | where it came from (`freshdesk_contact`, `freshdesk_ticket`, `whatsapp_group`, `ticket`, `agent_note`, `app_taste`, `app_behaviour`, `typeform`, `atlas`, `import`) and the pointer to the exact message, note, ticket or event |
| `confidence` | 0 to 1; a human's note is 1.0; a stated form answer 0.9; a model reading of chat 0.5 to 0.9; an inference from behaviour 0.3 to 0.6 |
| `observed_at` | when it was true in the world, from the source's own clock |
| `valid_until` | nullable; a fact with a natural expiry (a trip, a diet, "in Dubai this week") |
| `superseded_by` | set when a later fact for the same facet, key and polarity wins; the old row stays readable |
| `created_by` | the human, when human |

The facet vocabulary, read from the 40 Freshdesk contact fields, the Atlas profile and the
founder's examples, in `lib/constants/member-facets.ts` via `defineEnum`:

| Facet | Keys (examples) |
| --- | --- |
| `identity` | nickname, preferred_name, languages, birthday, anniversary, dating_anniversary, blood_group, diabetic, marital_status, company, designation, instagram, linkedin, chronotype (sunrise or sunset) |
| `address` | home, office, farmhouse, parents, one per named place; `value_json` holds the structured address |
| `family` | spouse, child_n, parent, pet, staff (driver, house manager, PA); who may raise requests |
| `dietary` | diet, veg_nonveg, allergies, drink, coffee, dessert, avoid |
| `preference` | seat, cabin_class, airline, hotel_brand, stays, room_type, cuisine, restaurant, table, car, car_you_travel_in, watch_brand, fashion_brand, designer, flowers, book, artist, actor, budget_band_by_category |
| `interest` | sport, travel_style, tech, art, music, wellness, collecting |
| `occasion` | dated events with recurrence: birthdays, anniversaries, festivals, school terms, board meetings |
| `travel` | go_to_country, travel_frequency, usual_pax, usual_notice, passport_expiry_hint |
| `budget_signal` | paid without blinking, pushed back on, with category and date |
| `contact_rule` | do not call before 10am, prefer voice notes, spouse handles dining, replies only on WhatsApp |
| `note` | free text a genie wants remembered |

Merge rules, the part that keeps this clean for a decade: a human fact is never superseded by a
model fact of lower confidence; two model facts that disagree both stay, the newer supersedes,
and the snapshot shows the newer with "changed in July" beside it; a fact whose `valid_until`
passed is not deleted, it stops appearing in the face; a wrong extraction is corrected by a human
adding the right fact, which supersedes it. There is no UPDATE on a value, ever.

#### Store 3, `member_relations`: the relationship map

The founder asked for a relationship map. It is an edge table, not a graph database.

| Column | Meaning |
| --- | --- |
| `member_id` | the member |
| `entity_kind`, `entity_id`, `entity_label` | `person` (a `member_people` row for family and staff), `vendor` (the vendor spine), `place` (a city or a venue, keyed by our places vocabulary), `brand`, `interest`, `member` (another member), `venue` |
| `relation` | `spouse`, `child`, `staff`, `uses`, `prefers`, `avoids`, `visits`, `lives_in`, `travels_to`, `knows`, `collects`, `follows` |
| `strength` | 0 to 1, computed from how often, how recently, and with what sentiment the evidence appeared; decays |
| `first_seen_at`, `last_seen_at`, `evidence_count` | when the edge was born, when it was last confirmed, how many facts and events support it |
| `evidence` | the top three pointers |

Rebuilt by the merger from facts and events, so a wrong edge is fixed by fixing the facts. It
is what the joker reads ("what would delight this family"), what the ranker reads ("this member
avoids this vendor"), and what the snapshot summarises ("closest venues: Bukhara, Zuma").

#### Store 4, `member_events`: the timeline

One row per touchpoint from every source, in one shape, so "everything that happened with this
member in March" is one ordered read.

| Column | Meaning |
| --- | --- |
| `member_id`, `occurred_at` | the partition key is the month of `occurred_at` |
| `kind` | `message_in`, `message_out`, `ticket_created`, `ticket_status`, `ticket_resolved`, `note_added`, `app_view`, `app_save`, `app_wish`, `app_taste`, `location`, `payment`, `invoice`, `renewal`, `call`, `fact_added`, `health_signal` |
| `source`, `source_ref` | which system and the pointer back to its truth row (the message triple, the ticket id, the app event id, the Zoho id) |
| `actor` | `member`, `staff:<profile>`, `system`, `model` |
| `summary` | one short line, human readable, unmasked (Zone 1) |
| `tone` | nullable: praise, neutral, frustrated, angry; written by the classifier |
| `weight` | how much this event matters for recency scoring (a payment 1.0, a screen view 0.05) |
| `expires_at` | app behaviour rows expire at 180 days, matching the app's own retention promise |

This is a projection of the source tables (the archive, the tickets, the mirror, the app feed,
Zoho), not a second truth: it can be rebuilt from them. It exists because retrieval and the
"right time" logic need one ordered stream per member, and because every source has its own
shape.

#### Store 5, `member_documents` and `member_chunks`: prose and meaning

Documents are the prose units worth reading whole: a chat session window (a group's messages
split on six quiet hours), a ticket thread summary, a ticket's notes, a genie note, a weekly
digest. `member_documents` holds the unmasked text, its source pointer and its time range.
`member_chunks` holds the masked chunks with their embeddings (`vector(1024)`, HNSW cosine), the
keyword vector (`simple` config for Hinglish) and `observed_at`. Hybrid search, scoped to a
member, reciprocal-rank fused, reranked. The embedding model is Jina v4 at 1024 dimensions via
the API on masked text; a self-hosted copy is the fallback if egress policy demands it. Never
embed a single message on its own; embed windows and summaries, because meaning lives in
sessions.

#### Store 6, `member_snapshot`: the twin's face

One versioned jsonb per member, rebuilt whenever truth changes (debounced 30 seconds), cached in
Redis, under 8 KB, layered so a reader can stop early:

```jsonc
{
  "version": 41, "built_at": "…",
  "core":          { "name", "kingdom", "tier", "member_since", "renewal_on", "team": { "genie", "bishop", "queen" } },
  "essentials":    { "addresses": [...], "family": [...], "dietary": [...], "allergies": [...], "contact_rules": [...] },
  "preferences":   { "travel": {...}, "dining": {...}, "retail": {...}, "dislikes": [...] },   // the current winner per facet+key, with "changed_at"
  "relationships": { "people": [...top 8...], "vendors": { "preferred": [...], "avoided": [...] }, "places": [...], "brands": [...] },
  "recent":        { "last_7_days": "…prose…", "open_tickets": [...], "last_contact_at", "city_now" },
  "signals":       { "health": { "score", "trend_30d", "reasons": [...] }, "upcoming": [...anticipations due in 30 days...], "spend_90d_inr" },
  "narrative":     { "summary": "…", "communication_style": "…", "traits": [...], "written_at", "model" }
}
```

`core` and `essentials` are what a genie needs in the first second. `narrative` is the Atlas
`elia_profile` reborn: written by the heavy tier weekly from the layers above it, never the
other way round, so a stale narrative can never contradict a fresh fact.

#### Store 7, `member_health_events` and `member_anticipations`: the score and the right time

The health ledger is section 5.5. `member_anticipations` is the "right time" store: one row per
thing the twin expects, with `due_at`, `kind` (`occasion`, `renewal`, `pattern`, `follow_up`,
`trip`, `silence`), `evidence`, `status` (`pending`, `surfaced`, `acted`, `dismissed`) and the
suggested action. Written by the merger and the weekly pass ("they book Friday flights to Dubai
every six weeks; the next is due"), read by a small scheduler that turns due rows into Elaya
proposals to the genie. This is how the twin speaks before being asked, without a model running
on a timer.

### 5.3 The loop: how an input becomes part of the twin, in real time

```text
input arrives (a message, a ticket event, a mirrored Freshdesk change, an app signal, a Zoho payment, a note)
  1. project     → one member_events row, deterministic, no model, milliseconds
  2. gate        → routing tier (Haiku): "does this carry anything about the member?" + tone
                   answers on 100% of events; costs almost nothing; most events stop here
  3. extract     → reasoning tier (Sonnet) on the events that passed: facts, relations, brief
                   updates, anticipations; masked through the vault; every output carries a run id
  4. merge       → the rules of store 2 (supersede, keep both, human wins); relations recomputed
                   for the touched entities; anticipations upserted
  5. face        → snapshot rebuilt (debounced), Redis key deleted, version + 1
  6. index       → new documents chunked, masked, embedded (off the queue, never inline)
  7. weekly      → heavy tier (Opus): the narrative, contradictions worth a human's eye,
                   pattern anticipations, the relationship strengths re-scored
```

Steps 1 to 5 finish within seconds of the input on the Python worker. Step 6 follows within a
minute. Step 7 runs Sunday night. The tiers are the existing `llm_providers` rows, so a model
change is an UPDATE. Cost at today's volume: about 2,500 gate calls a day, a few hundred
extractions, one weekly pass per active member; a few dollars a day.

### 5.4 Retrieval: the right data in the least time

An intent router (routing tier) reads the question and picks the layers; it never fetches more
than the question needs.

| Layer | What | Latency | Used for |
| --- | --- | --- | --- |
| L0 | Redis snapshot | ~2 ms | almost every question; every ticket open |
| L1 | `member_facts` by facet and key, current winners | ~10 ms | "does he have a farmhouse", "what does she avoid" |
| L2 | `member_events` window by time, weighted | ~20 ms | "what happened last week", "when did they last travel" |
| L3 | `member_relations` by kind | ~10 ms | "which vendors has this family used", "who is the spouse" |
| L4 | hybrid semantic over `member_chunks`, scoped to the member, top 6 after rerank | ~200 ms | "what did she say about the Maldives villa last year" |
| L5 | the source rows themselves | ~30 ms | showing the evidence behind any answer |

The context handed to the brain for a member question is the snapshot (about 1,500 tokens) plus
at most six chunks and the relevant events: under 3,000 tokens, under half a second on both
channels. Every answer can show "why": each fact and chunk carries its pointer to L5.

"Latest and correct" comes from three things working together: facts are versioned with
`observed_at` so the newest winner is a lookup, not a judgement; the snapshot is rebuilt on
every change, never on a schedule; and the narrative sits below the facts, never above them.

### 5.5 The health score, live

Signals arrive from the gate (tone of member messages), the sentinel (breaches, slow replies,
late resolution, reopen), the close pass (resolved on time, delight delivered), and humans
(manual adjust with a reason, bishop and up). The policy (delta and half-life per signal) is a
table. The score is `70 + Σ delta × decay(now − observed_at)`, clamped 0 to 100, recomputed on
every event, shown with its three reasons and a 30-day line. The mirror's timings seed the past
breaches on day one so the score starts with memory. Everyone in the member's kingdom sees it,
plus admin and founder (decided 2026-09-15). The member never does.

### 5.6 Loading what Atlas and Freshdesk already know (day one of the twin)

| Source (in `cleint-data/`) | Into | Confidence |
| --- | --- | --- |
| `export-1.csv` (446 rows, the subscription sheet) + `export-2.csv` (392 rows, the app member list with Zoho, Freshdesk and WhatsApp ids) | the spine: THE member list (decided 2026-09-15: the 1,577 Freshdesk contacts are history only, many are wrong; members come from these two sheets). Queendom, tier, dates, amount, Zoho customer id, Freshdesk contact id, app member id, WhatsApp group | 1.0 |
| `altas-cleint-profile.csv` personal, travel, lifestyle, passions | facts, source `atlas`, one row per value | 0.9 |
| `atlas-cleint-sources.csv` (121 Typeform answers) | facts, source `typeform`, the original raw answer as evidence | 0.9 |
| `freshdesk.contacts.custom_fields` (720 contacts with preferences) | facts, source `freshdesk_contact` | 0.9 |
| `altas-cleint-profile.csv` `elia_profile` (3 rows) | narrative seed and a few facts, source `atlas`, marked legacy | 0.6 |
| `freshdesk.tickets` (50k) | events, documents, and a one-time close pass per member for facts and relations (20 members first, the founder checks, then all) | model |
| the WhatsApp archive | events and windows; the profiler as planned | model |

### 5.7 Why this shape, and not the others

- **Not one big JSON per member** (Atlas): no evidence, no time, no contradictions kept, and every
  writer overwrites every other. The snapshot is that JSON, rebuilt, never edited.
- **Not a graph database**: the relationship map is a few tens of edges per member; a Postgres
  edge table with two indexes answers every question we have, joins to everything else for free,
  and needs no second backup, no second access model.
- **Not a document store for everything**: facts must be typed to be merged and compared;
  prose must be prose to be searched by meaning. Two stores, one loop.
- **Not embeddings for everything**: a birthday is a fact, not a vector. Vectors index prose only.
- **One Postgres**: identity, facts, events, edges, prose, vectors and the snapshot in one
  database with one backup and one RLS model, exactly as the archive and the vendors were built.
  The escape hatches are the same as before: a dedicated database for one schema, a dedicated
  vector store for chunks, each a lift, never a redesign.

### 5.9 The Members surface (what people see, and the first thing built)

**Decided 2026-09-15 (ten answers):** the record is the MEMBERSHIP (a couple is one member page with two names, the people under it as family); the word everywhere is **Members** (`/members`, table `members`); the whole queendom (every role), admin and founder see a member; the same set may edit facts, preferences, notes, links and membership data; money shows to everyone who sees the member; the App card shows everything the app records, raw screen time included; the profiler is built later but its architecture (stores, loop) is built now; new members come from a manual New member form for now (the won-deal hook later); WhatsApp linking is done from the member page AND from the Sia page (choose a member to link or unlink a group); Members before tickets.

The founder's ask: a page where every member is listed with everything we
hold, the Freshdesk history linked, and the WhatsApp group linked from the Sia page. This is the
twin's face for humans, and it is built first, before the ticketing, because every ticket screen
opens onto it.

#### `/members` (the list)

The standard list-page contract (title row, the shared FilterBar, a dense table, Pagination).
One row per member from the spine. Columns: name (with the second person of a couple beneath),
queendom, tier, status (active, expired, trial), health score, open tickets, last contact,
renewal date. Filters: search, queendom, tier, status, health band, "not linked" (no WhatsApp
group, no Freshdesk contact, no Zoho id, no app id). Access: a Sia member sees their queendom;
admin and founder see all; expired members stay listed with their status (decided 2026-09-15).

#### `/members/[id]` (the dossier)

Built from the seven stores, one card per store, in the order a genie needs them:

| Card | Reads | Day one content |
| --- | --- | --- |
| Identity and membership | the spine | names, phones, city, company, tier, plan dates, amount, status, the queendom and its team; the four links (WhatsApp group → the Sia viewer, Freshdesk contact, Zoho customer, app member) with a "link" control where one is missing |
| Health | store 7 | the score, its three reasons, the 30-day line; seeded from the mirror's SLA timings |
| Essentials | store 2 | addresses, family, dietary, allergies, contact rules; every fact shows its source and date; a genie can add or correct a fact (a human fact at 1.0) |
| Preferences | store 2 | travel, dining, retail, dislikes, interests, occasions; the Freshdesk contact fields and the Atlas and Typeform answers appear here with their source |
| Requests | the mirror now, `sia.tickets` later | the member's tickets, open first, with status, category, agent, age; a click opens the ticket (the Freshdesk dossier today) |
| WhatsApp | the archive via the Sia viewer | the mapped group, last message time, a "open the group" link, and the 7-day digest once the profiler runs |
| Activity | store 4 | the timeline: tickets, notes, app signals, payments, in one stream |
| App | store 4 (app kinds) | everything the app records: wishes, saves, tastes, city now, screen and item time, taps; and the derived interests (decided: show all) |
| Money | Zoho via `zoho-service.ts` | wallet balance, recent invoices and payments, read live, never cached (the app's own rule) |
| Relationships | store 3 | people, preferred and avoided vendors, places, brands |
| Notes | facts of facet `note` | free text by the team, newest first; each note is a fact with the author's name |
| Narrative | store 6 | the model-written summary, communication style and traits, with the date it was written; blank until the first pass runs |

Every card is display-only except Essentials, Preferences, Notes, the membership fields and the
link controls, which write through server actions into the facts and the spine (any queendom
member, admin or founder). A **New member** form (the AddLead pattern) creates a member by hand;
the won-deal hook comes later. Nothing on this page writes to
Freshdesk, Zoho or the app.

#### Where the day-one data comes from

| Data | Source | How it gets in |
| --- | --- | --- |
| The member list, queendom, tier, dates, amount, status, Zoho id, Freshdesk id, WhatsApp link, app member id | `export-1.csv` + `export-2.csv` | `scripts/import-members-and-map-groups.py` extended: the two sheets become the member source of truth; existing spine rows are matched by phone, then by Freshdesk id; the mapper re-runs so the 347 invite links help the WhatsApp mapping |
| Simple facts and preferences | the Atlas profile and Typeform CSVs, the 720 Freshdesk contacts with preferences | one seed script into `member_facts` with source and date, confidence 0.9 |
| Ticket history | `freshdesk.tickets` (47,409 already linked to a member) | read live from the mirror by `member_id`; no copy |
| WhatsApp | `sia.wag_groups.member_id` | the existing mapping (207 groups) plus the coverage push |
| App signals | `indulge-api` webhook | built now: wishes, saves, tastes, location city, product enquiries |
| Money | Zoho Books, the app server's setup | `zoho-service.ts`, read per open of the Money card |
| Health seed | the mirror's `first_responded_at`, `resolved_at`, `is_escalated`, reopen | one pass writes historical health events |

#### The order of the build, restated

Status as of 2026-09-18, checked against the code and the live database, not from memory.

```text
M0  the spine, queendoms, facts seeded                                  DONE 2026-09-15
M1  /members list + dossier + New member form + link/unlink             DONE, live. Renamed clients -> members 2026-09-17.
                                                                        Founder walk-through still to do
M2  zoho-service + the Money page                                       DONE 2026-09-15 (live Zoho, read only)
    the member app webhook + the App card                               NOT BUILT (needs a change on the app server)
T0  Freshdesk mirror live in the cloud, files copied, history loaded    DONE (file backlog still draining by itself)
    staff roster screen: domain -> role -> queendom, one seat each      DONE 2026-09-16 (0201)
    ... but nobody is seated yet: 0 staff hold a Concierge seat         DATA WORK, founder + team
    WhatsApp groups linked to members: 420 linked, 45 still open        DATA WORK, in progress in the other session
    176 members have no queendom                                        DATA WORK
T1  ticket tables, state machine, list, board (live drag), ticket page,
    new ticket from selected messages, help window, SLA + labels settings   DONE, live. 0 real tickets yet: waits on the roster
T2  the sentinel: rules pass + reading pass, runs every minute in cloud DONE 2026-09-16
    the judgement pass (the sentinel proposes a status move)            NOT BUILT
T3  intake phase 1: the genie selects messages -> a ticket draft        DONE
    intake phase 2: Serene reads the groups and proposes tickets itself NOT BUILT
T4  the profiler: reads chats, files facts / people / relations /
    coming up, names hidden from the AI                                 DONE, SWITCHED ON 2026-09-18 (whole history,
                                                                        Active members only, about a day to finish)
    the Observation box: a teammate types, facts are filed              DONE 2026-09-15
    health score with reasons, access log                               DONE
    the scored exam (golden set) for the profiler                       NOT BUILT (the founder's pilot review stood in for it)
    the fast snapshot per member                                        NOT BUILT (table exists, nothing fills it; reads are live and fast enough today)
    per-person tagging inside a group (husband vs wife)                 NOT BUILT (known limit of the profiler)
T5  Elaya member tools on both channels: overview, recent messages,
    history search, full profile, finance                               DONE 2026-09-18
    Elaya ticket tools: list, get, add note, propose a status move      DONE 2026-09-15
    meaning search (embeddings, member_chunks, Jina)                    NOT BUILT (word search works today)
T6  vendors learn from Freshdesk notes by themselves                    DONE 2026-09-18 (PR #4)
    ticket -> vendor ledger, ranker inside the ticket, review at close  NOT BUILT
    member app reads Serene tickets, pilot queendom, Freshdesk cutover  NOT STARTED
T7  anticipation, Joker suggestions, staff response metrics, autonomy   NOT STARTED (the profiler already files "coming up" items)
```

**Small open items:** rotate the Freshdesk API key and webhook secret (decision 12); the memberships
history table and the won-deal to member bridge; drop the old `get_client_*` tool aliases in the
Elaya bridge once the brain has run a week on the new names.

Members before tickets, because the ticket creator, the help window and the board all read
the member dossier. The profiler (T4) comes after tickets; its stores and loop are created in M0
so nothing is redesigned when it arrives.

### 5.8 Access and the audit trail

| Rule | Mechanism |
| --- | --- |
| A member is visible to everyone in their kingdom, plus admin and founder (decided 2026-09-15) | RLS on every member store: `kingdom_id = get_user_kingdom()` OR role in (admin, founder), one SQL helper reading `profiles`, Rule 09 |
| Opening a member card is recorded | `member_access_log` (append only): who, which member, which surface, when |
| Chunks are never readable by users | zero user policies; only the worker and the tools read them |
| A genie's Elaya tools see only their kingdom's members | `canAccessMember` in `lib/elaya/access.ts`, shared by both registries |
| Nothing leaves unmasked | the vault before every model and embedding call; the round-trip test in every exam. **DPDP posture (decided 2026-09-15):** the vault, the retention rules (app behaviour 180 days, everything else for the life of the membership plus the legal period), the consent record on the spine, the access log, the right-to-erasure procedure (a member's facts, events, documents and chunks deleted on request, the append-only ledgers tombstoned), and the list of external processors (Anthropic, Jina, Deepgram) are written up as one document for the security reviewer before T4 ships |
| Member text never reaches logs | the archive rule, extended |

---

## 6. Part B, first half. Tickets as they run today

Before the design, the process as it runs on Freshdesk, so we replace every step on purpose. This
version is read from the account's own configuration, not remembered.

1. A member writes in their WhatsApp group.
2. A **bishop** reads every group in the queendom. Within a minute someone acknowledges.
3. The bishop decides what the message is: a new request, an update to an open ticket, or general
   talk, feedback, a question.
4. For a request, the bishop creates a Freshdesk ticket: subject, the required nested category,
   the type (which is what the SLA reads), priority (rarely deliberate), the custom brief fields,
   the requester (contact matched by phone; Periskope sometimes stamps the message id).
5. Creation rules run: the category sets the "internal task list" (the per-category checklist of
   things to do: call the hotel concierge, check MMT, inform cost and timeline …). Finance tickets
   auto-assign to Murtaza. Webhooks fire to the member app, the old dashboard and Periskope.
6. The bishop assigns a **genie**, judging workload, shift, speciality, and the member relationship.
7. The genie works the ticket: sources options, talks to vendors, writes internal notes (the whole
   thread is notes), ticks the checklist, moves the status: Open, Pending, Nudge Member, Nudge
   Vendor, Ongoing Delivery, Invoice Due, Resolved, Closed.
8. Time triggers watch it: 30 escalation rules reassign a breached ticket to a manager after the
   first, second and third breach per category ("Travel - Escalation 1 - K"), and remind the agent
   when a vendor or the member has not replied. The old dashboard tagged `overdue_sync`.
9. Updates go back to the member in the WhatsApp group, typed by the genie or the bishop.
10. Money is logged in notes ("Cost Price 8250, Selling Price 8250, paid via card 1768"), in
    `cf_invoice_amount` and GST, and in Zoho. A customer reply reopens a resolved ticket
    automatically.
11. The member app shows the member their tickets as a four-stage journey (Received, Sourcing,
    In Progress, Completed), read live from Freshdesk by phone.

What is lost today: the link between the message and the ticket (Periskope keeps some of it, a
human remembers the rest), the reason behind each assignment, the member's tone, the vendor used
(free text in notes), the money as data, and any memory that outlives the genie. What the mirror
recovers from today: the movement history, the timings, and the member join.

---

## 7. Part B. The ticketing system

### 7.0 The kingdom, as the founder describes it (2026-09-15)

The unit is the kingdom, ideally about 200 members each. On top, a queen; a bishop who overlooks
the work; the genies who do it; and a joker for the creative side. When a member joins, they are
placed in one kingdom and a WhatsApp group is made for them with every genie of that kingdom, the
queen, the bishop and the joker inside. Any genie may reply in the group, but the one assigned to
the request should. When a genie's shift ends before a ticket resolves, the ticket is handed to
another genie with its whole history. Serene models exactly this: `sia.queendoms` (decided 2026-09-15: the word is queendom), `profiles.queendom_id` and `concierge_role`, the member's `kingdom_id`, the group
membership from the archive, `assignee_id` on the ticket with a `reassigned` event that carries
the reason `shift_end` and keeps every prior event, note and linked message in place.

The timeline the founder set: build the whole ticketing and member system now, ready to use;
the tech team works it for a month as if they were the agents, and Elaya is trained on real
tickets (how to create them, choose vendors, update, help the genie); about three months later,
when it is robust, the members and the agents move in. Automatic ticket creation and smart
assignment are built from day one and corrected over the weeks; nothing waits for the model to
be perfect, and nothing goes to a member without a human until the founder says so.

### 7.1 What we keep, what we change

| Topic | Freshdesk today | The Notion vision (April 2026) | This plan |
| --- | --- | --- | --- |
| Where the ticket lives | Freshdesk | Freshdesk, pre-filled by Elia | **Serene, schema `sia`.** Freshdesk mirrored now and imported as history at cutover, then read only |
| Who reads the groups | The bishop, by eye | Elia's chatbot reads and classifies | The intake consumer reads every member message in mapped groups and classifies it; the bishop approves proposals |
| The acknowledgement | A human, under a minute | Elia replies instantly | Phase 1: Elaya drafts, a human sends, under a minute. Phase 2: a separate speaking identity. **DECIDE 2** |
| Classification | Manual, two overlapping vocabularies (category and type) | Auto | Auto with confidence; one vocabulary (category tree); below the bar it is a bishop queue item, never a silent guess |
| Assignment | Bishop's judgement; finance auto-assigned by rule | Elia recommends by workload | A scored picker (shift, load, speciality, relationship) proposes; the bishop confirms; auto-assign once earned |
| Context for the genie | Old tickets, asking around | Chrome extension sidebar | The member card inside the ticket, in Serene, on desktop and on the mobile layer. No extension in phase 1 |
| The checklist | Per-category checkbox fields set by creation rules | not mentioned | The sentinel's per-category checklist, a table, ticked by the genie or inferred from notes |
| Vendor choice | Memory | Vendor score tab | `rankVendorsForRequest` with the member's preferences folded in, inside the ticket |
| Statuses | 9 statuses | same | A state machine with the same meanings, section 7.3 |
| SLA | 15 min / 8 business hours flat, 48 h for watches and bags; priority ignored | not mentioned | Policy rows seeded from those numbers, then tuned from the mirror's measured durations; priority and tier matter |
| Escalation | 30 time-trigger rules reassigning to managers | not mentioned | The same ladder as policy rows the sentinel walks, with the reason recorded |
| Watching a ticket | Time triggers, plus `overdue_sync` | Elia detects progress | The sentinel, section 7.6 |
| Member updates | Typed by hand | Elia drafts, bishop taps send | Same, through the sentinel and Elaya; sending identity per DECIDE 2 |
| Learning | Nothing | Elia updates the profile | The close pass writes facts, health events, vendor engagement, and a review prompt |
| Sub-work across departments | Group handoffs (Finance, Shop, Global Events groups) | Elia creates sub-tasks | `tasks` rows linked by `task_ticket_meta`; the existing task engine |
| Money | Notes, invoice amount field, Zoho | Finance flow via Elia | Quote, cost, price and payment fields on the ticket plus a `payment_due` state; Zoho stays the ledger |
| The member app | Reads Freshdesk live by phone | not mentioned | Reads Serene at cutover through one bearer-secured RPC (section 7.11) |

### 7.2 The data model

All in the **`sia` schema** (law 11): tickets are Sia's work layer and sit beside the archive. Today
`sia` is exposed to PostgREST for `service_role` only; T1's migration exposes it to `authenticated`
with `USAGE` on the schema and RLS on every table, so the session client reads tickets under the
queendom boundary. The mirror in `freshdesk` is never merged into it.

#### `sia.queendoms`

| Column | Meaning |
| --- | --- |
| `id`, `name`, `slug` | "Anishqa's Queendom" |
| `freshdesk_group_id` | the mirror's group id, so history joins without a name match |
| `queen_id`, `bishop_ids uuid[]` | profiles |
| `domain` | `concierge` |
| `is_active`, timestamps | |

`profiles` gains `queendom_id` and `concierge_role` (`genie`, `bishop`, `queen`, NULL). The concierge
staff become Serene users from the roster the founder supplies at T0 (role `agent` for genies,
`manager` for bishops and queens, domain `concierge`, queendom set). The 78 Freshdesk agent accounts
are stale and are not imported; `freshdesk.agents.profile_id` links a mirrored agent to a real user
only where the email matches, for history. Decided 2026-09-15.

#### `sia.tickets` (current state, the spine of the work)

| Column | Meaning |
| --- | --- |
| `id`, `ticket_no` | `ticket_no` is a human number from a sequence, `T-000001`, shown everywhere |
| `member_id` | the spine, NOT NULL. A ticket is always for a member |
| `queendom_id` | copied from the member at creation; the RLS key |
| `origin` | `whatsapp_group`, `app`, `call`, `email`, `manual`, `freshdesk_import` |
| `origin_ref` | jsonb: the message triple, the app inquiry id, or the Freshdesk id |
| `group_jid` | the member group the request came from, when it did |
| `category`, `sub_category`, `item` | the real nested tree from `freshdesk.ticket_fields` (Travel > Flight > Tickets), in `constants/tickets.ts` via `defineEnum`; ONE vocabulary, the type field is retired |
| `title` | one line, human or model written, editable |
| `brief` | jsonb, the typed request: pax, dates, from, to, budget, chosen address, product details, and so on. One Zod schema per category in `lib/validations/ticket-briefs.ts`, derived from which `cf_*` fields the mirror shows filled per category. The Freshdesk brief, done properly |
| `checklist` | jsonb: the per-category task list (from Freshdesk's "internal task list" checkboxes, read from the mirror), each item with `done_at` and by whom |
| `priority` | `low`, `medium`, `high`, `urgent` |
| `status` | the state machine, section 7.3 |
| `requested_for` | the date the member needs it, nullable |
| `first_response_due_at`, `next_update_due_at`, `resolve_due_at` | computed from the SLA policy on create and on every status or priority change |
| `assignee_id`, `bishop_id` | profiles |
| `handoff_department` | nullable: `finance`, `shop`, `events`, `retail` (the Freshdesk group handoffs, as a field, not a move) |
| `vendor_id` | the chosen vendor, nullable; the engagement ledger row is written at close |
| `money` | jsonb: `quote_inr`, `cost_inr`, `price_inr`, `currency`, `tax_mode`, `payment_status`, `zoho_ref`, `invoice_no` |
| `summary` | model written, refreshed by the sentinel, two to four sentences |
| `created_by` | profile id, or NULL with `created_by_kind = 'elaya'` |
| `proposed_by_run_id` | when intake created it |
| `sentinel_state` | jsonb: the actor's memory (section 7.6) |
| `next_wake_at`, `wake_reason` | the sentinel's alarm clock |
| `closed_at`, `resolution` | `delivered`, `cancelled_by_member`, `could_not_source`, `duplicate`, `not_a_request` |
| `satisfaction` | 1 to 5 when known, nullable; how it was known lives in the events |
| `freshdesk_id` | for imported and transition-period tickets; joins to the mirror |
| timestamps | |

`sia.tickets` is a current-state table, so it is updated in place, but every change goes through one
core (`ticket-mutations.ts`, the `lead-mutations.ts` pattern) that also inserts a `ticket_events`
row inside the same transaction (an RPC, like `update_lead_status`). No UI, no tool, no worker
writes `tickets` directly.

#### `sia.ticket_events` (truth, append only, Realtime)

The diary of the ticket. Every actor writes here: humans, the sentinel, intake, Elaya, the system.

| Column | Meaning |
| --- | --- |
| `ticket_id`, `member_id`, `queendom_id` | denormalised so the feed needs no join and RLS is direct |
| `actor_kind` | `human`, `sentinel`, `intake`, `elaya`, `system`, `member` |
| `actor_id` | profile id when human |
| `event_type` | `created`, `proposed`, `approved`, `classified`, `assigned`, `reassigned`, `status_changed`, `priority_changed`, `brief_updated`, `checklist_ticked`, `note`, `member_message_linked`, `member_update_drafted`, `member_update_sent`, `vendor_shortlisted`, `vendor_chosen`, `quote_added`, `payment_requested`, `payment_received`, `subtask_created`, `handed_off`, `sla_warning`, `sla_breached`, `reminder_sent`, `observation`, `escalated`, `closed`, `reopened`, `learning_written` |
| `body` | the note text, the draft, the observation |
| `meta` | jsonb: from and to status, the vendor id, the SLA code, the message triple |
| `run_id` | for model-authored rows |
| `created_at` | |

Published to Supabase Realtime (the `task_events` precedent), so the genie board and the ticket page
update live. Internal notes are rows here with `event_type = 'note'`; the whole notes stream lands
in one place with everything else. Full text index on `body` for search. Monthly partitions from day
one (the fastest-growing table; the `wag_messages` precedent).

#### `sia.ticket_message_links` (truth, append only)

The link the founder said the model should learn first: "in this group the member sent this, and
this ticket was made for it".

| Column | Meaning |
| --- | --- |
| `ticket_id`, `chat_jid`, `wa_message_id`, `sender_jid` | the soft triple, the archive law |
| `link_kind` | `origin`, `update`, `member_reply`, `staff_reply`, `attachment` |
| `confidence`, `run_id` | model links carry both; human links (drag a message onto a ticket in the Sia chat viewer) carry 1.0 |
| `created_by` | |

The ticket page shows the linked messages as its conversation. The Sia chat viewer shows a small
ticket chip next to any linked message. Same data, two views. The same table also links mirrored
Freshdesk tickets (`freshdesk_id` set, `ticket_id` NULL) so the learning programme of section 2.3
has one home for the message-to-ticket truth.

#### `sia.ticket_sla_policies` (config)

| Column | Meaning |
| --- | --- |
| `queendom_id` (nullable = default), `category` (nullable = any), `priority`, `tier` (nullable) | the match key, most specific wins |
| `first_response_min` | seed: 15 for every priority (Freshdesk today); proposal after the first month: 10, 15, 30, 60 by priority |
| `update_cadence_min` | how often the member must hear from us while active: 120, 240, 720, 1440 |
| `vendor_silence_min` | how long `awaiting_vendor` may sit before a nudge (Freshdesk's "Awaiting Vendor response" reminder rule) |
| `member_silence_min` | how long `awaiting_member` may sit before a gentle follow-up |
| `resolve_target_min` | seed: 480 business minutes for most categories, 2,880 for watches and bags (Freshdesk today); tuned from the mirror's measured medians per category |
| `business_hours` | boolean; the calendar is 09:00 to 20:00 IST like Freshdesk's, in `constants/business-hours.ts` |
| `escalation` | jsonb ladder: genie at breach, bishop at +15 min, queen at +60 min, founder in the daily digest; the three-level reassignment Freshdesk runs today is expressible here |

Rows, not code, and **edited in a Sia settings page** (decided 2026-09-15): the founder wants SLA
policies, statuses and tags created in the app the way Freshdesk allows, not by a deploy. The core
state machine (section 7.3) stays fixed because the sentinel and the app stages depend on it, but
each state can carry configurable sub-labels and tags, and every SLA number, cadence and escalation
ladder is a row a manager edits. The numbers start as Freshdesk's today and are tuned after the
mirror has measured a month.

#### `sia.genie_roster` (config, one row per genie)

| Column | Meaning |
| --- | --- |
| `profile_id`, `queendom_id` | |
| `shifts` | jsonb weekly pattern in IST |
| `capacity` | max weighted open tickets |
| `specialities` | jsonb category weights, declared; the learned part comes from the mirror's history (who resolved what, on time) at pick time |
| `languages` | |
| `is_on_leave`, `leave_until` | the `agent_routing_config` idea, for concierge |

#### Reused, not new

- Sub-work: `tasks` + a `task_ticket_meta (task_id, ticket_id)` table, the `task_gia_meta` pattern.
  A ticket page lists its tasks; the task engine's reminders, oversight and events keep working.
- Vendors: `vendor_engagements` with `source = 'ticket'` and `source_ref = ticket_no`, written once
  at close by the core, plus a `vendor_reviews` prompt to the genie.
- Invoices and attachments: a private `ticket-files` bucket with the `vendor-invoices` posture
  (path stored, signed URLs, never a public link).
- Notifications: new catalog entries `ticket_assigned`, `ticket_proposed_for_approval`,
  `ticket_sla_warning`, `ticket_sla_breach_manager`, `ticket_member_replied`,
  `ticket_member_unhappy`, `ticket_daily_digest_founder`. `ticket_assigned` and
  `ticket_member_replied` are transactional, not muteable.

### 7.3 The state machine

Every Freshdesk status keeps its meaning under a name that says who is waiting on whom. The
"stops the SLA timer" column is Freshdesk's own configuration, kept.

| Status | Freshdesk id and name | Meaning | SLA timer | Who moves it here | App stage |
| --- | --- | --- | --- | --- | --- |
| `proposed` | (none) | Intake or Elaya thinks this is a request; not yet a promise | off | intake | not shown |
| `open` | 2 Open | Accepted, not yet assigned or not yet started | runs | bishop approves, or a human creates | Received |
| `sourcing` | 3 Pending | The genie is working it | runs | genie | Sourcing |
| `awaiting_member` | 6 Nudge Member | We asked the member something and wait | stopped | genie, sentinel draft | In Progress |
| `awaiting_vendor` | 7 Nudge Vendor | A vendor owes us a reply | runs | genie | Sourcing |
| `in_delivery` | 8 Ongoing Delivery | Booked or ordered; happening | stopped | genie | In Progress |
| `payment_due` | 9 Invoice Due | Delivered or booked, money outstanding | stopped | genie or finance | In Progress |
| `resolved` | 4 Resolved | Done, member informed | stopped | genie; sentinel proposes when evidence says delivered | Completed |
| `closed` | 5 Closed | Resolved and quiet for 48 hours, or closed by a human with a resolution | stopped | sentinel or human | Completed |
| `dropped` | (none) | Not a request, duplicate, or cancelled by the member | off | bishop, or genie with a reason | not shown |

Freshdesk's 9000 "Assigned to AI Agent" has no twin: in Serene the sentinel is on every ticket, and
"proposed" is the only state where a model holds the ticket. Allowed transitions live in
`constants/tickets.ts` as a table; the mutation core refuses anything else. `closed` reopens to
`open` on a linked member message that reads as a complaint or a follow-up (Freshdesk does this by
rule today; here the sentinel proposes, the bishop or genie approves; a `reopened` event either
way).

### 7.4 The lifecycle, walked through

The founder's example: a food order.

1. **The message.** Rahul writes in his group: "Can you get the usual from Bukhara to the farmhouse
   by 8, we are 6 tonight, and no mushrooms this time."
2. **Intake (under 10 seconds).** The intake consumer reads the new message with the last session as
   context. Routing tier. Output: kind `request`, category `dining`, confidence 0.94,
   brief `{ pax: 6, when: today 20:00, place_hint: "farmhouse", vendor_hint: "Bukhara", avoid: ["mushrooms"] }`,
   tone neutral. It writes a `sia.tickets` row in `proposed`, a `ticket_message_links` row of kind
   `origin`, and a `member_facts` candidate `dislike: mushrooms (0.9)`.
3. **Enrichment (same pass).** The snapshot supplies the farmhouse address (facet `address`, key
   `farmhouse_alibaug`), the note that Bukhara is a go-to, the family size, health 81. The ranker is
   asked for dining delivery in that city with terms from the brief; Bukhara's engagement history
   comes back first with 9 past jobs. The picker proposes a genie: on shift, load 4 of 8, handled
   Rahul's last three dining tickets. The dining checklist is attached.
4. **The bishop (under a minute).** Gets a push and a WhatsApp line from Elaya: "New request from
   Rahul V: Bukhara to the farmhouse, 6 pax, 8pm, no mushrooms. Suggested Priya. Reply yes to
   create, or open Serene to edit." In Serene the proposal card shows the pre-filled ticket, the
   address chosen with the alternatives one tap away, the vendor shortlist, the genie suggestion, and
   a drafted acknowledgement. One tap: `open` and assigned. The drafted acknowledgement is copied to
   the bishop's phone to send (phase 1).
5. **The genie.** Opens the ticket: the member card on the left, the linked messages in the middle,
   the brief, the checklist, the vendor shortlist, and the tasks on the right. Calls Bukhara, moves
   to `awaiting_vendor`, notes "confirmed, 7:45 dispatch, 6 portions, no mushroom, Rs 18,400".
6. **The sentinel.** Woke on every event above. It read the note, moved the summary, filled
   `money.quote_inr` as a proposal, ticked "vendor confirmed" on the checklist, set
   `next_update_due_at`, and when the genie moved to `in_delivery` it drafted the member update
   "Your Bukhara order is on its way, arriving 8pm at the farmhouse, no mushrooms." At 20:20 with
   no `resolved`, it nudges the genie: "delivery was due 8pm, any confirmation?" A member message at
   20:31 "Got it, thank you!" links as `member_reply`, tone praise, health +3, and the sentinel
   proposes `resolved`.
7. **Close.** The genie confirms. The close pass writes: the `vendor_engagements` row (Bukhara,
   dining, Alibaug, member Rahul, outcome delivered), a review prompt to the genie, the facts
   (`dislike: mushrooms` confirmed to 1.0 because the genie kept it in the brief, `address.farmhouse`
   reconfirmed with the timestamp), a health event `resolved_on_time`, and a summary chunk to the
   embedder. 48 quiet hours later the sentinel closes the ticket and sleeps.
8. **Next time.** "Dinner at the farmhouse Friday" pre-fills Bukhara, 6 pax, no mushrooms, the
   address, and the genie who knows them.

### 7.5 Assignment: the scored picker

`pick_genie_for_ticket(ticket_id)` is a SQL function with the `pick_next_agent_for_domain` advisory
lock so two bishops cannot double-assign. It scores every genie in the member's queendom:

| Signal | Weight | Source |
| --- | --- | --- |
| On shift now, not on leave | hard filter | `genie_roster` |
| Load: weighted open tickets against capacity (urgent counts 3, high 2) | high | `sia.tickets` |
| Speciality: declared weight for the category plus the learned rate (resolved on time in this category over 90 days, from the mirror first and then from Sia tickets) | medium | `genie_roster` + `freshdesk.tickets` + `sia.tickets` |
| Relationship: handled this member in the last 90 days, and the member did not complain | medium | both ticket tables + `member_health_events` |
| Language match | low | roster + member facts |

It returns the top three with reasons. Phase 1: the bishop confirms. Later: auto-assign when the top
score leads by a clear margin and the category is on the autonomy list. **DECIDE 9**. A shift-end
sweep proposes rebalancing for tickets whose genie is going off shift.

### 7.6 The sentinel: one small agent per ticket

The founder's idea: a mini agent is born with the ticket, stays with it, watches everything around
it, reminds people, and tells the mother (Elaya) when something big happens. The question is how to
build that so it is fast, cheap and safe at 150 tickets a day and 300 live at any moment.

**What it is not.** Not a running process per ticket, and not a model loop that polls. Three hundred
always-on loops would burn tokens doing nothing and give no benefit, since nothing changes on most
tickets for hours.

**What it is.** An actor: identity + state + a mailbox + an alarm clock, executed by a shared pool.
This is the pattern behind Temporal workflows and Cloudflare Durable Objects, done with the tools
we already have.

| Part | Where | Detail |
| --- | --- | --- |
| Identity | the ticket row | one sentinel per ticket, born at `proposed`, retired at `closed` |
| State | `sia.tickets.sentinel_state` jsonb | what it has seen (last event id, last linked message), what it has already nudged about, the checklist it inferred, its current summary, its cost so far |
| Mailbox | `ticket_events` + `ticket_message_links` | a trigger on both tables sets `next_wake_at = now()` and `wake_reason` on the ticket |
| Alarm clock | `sia.tickets.next_wake_at` | the sentinel sets its own next check when it goes back to sleep: the next SLA deadline, the delivery time, the 48-hour close window |
| The pool | the Python worker (section 8) | `SELECT … FROM sia.tickets WHERE next_wake_at <= now() AND status NOT IN ('closed','dropped') ORDER BY next_wake_at FOR UPDATE SKIP LOCKED LIMIT 20`, in a loop, several workers safe. Postgres is the queue; no new infrastructure |

**What a wake does, in order.**

1. **The rule pass, no model.** Pure code over the ticket, its policy row and the clock: first
   response due, update cadence due, vendor silent too long, member silent too long, delivery time
   passed with no resolution, payment due ageing, resolution target near or past, close window
   reached, a checklist item still open past its usual point. Each rule fires at most once per state
   (the state jsonb remembers). Fires become `ticket_events` (`sla_warning`, `sla_breached`,
   `reminder_sent`) and notifications through the catalog. This pass costs nothing and handles most
   wakes.
2. **The reading pass, routing tier, only when there is new text.** New linked member messages or
   new notes since the last wake. The model answers a small structured question: does this message
   belong to this ticket, what changed (a date, a count, a cancellation), what is the member's tone,
   does the member ask for a status, does anything in the brief need updating, which checklist items
   does this note complete. Output writes `brief_updated` proposals, `checklist_ticked`,
   `member_message_linked` confirmations, health events, and a refreshed `summary`.
3. **The judgement pass, reasoning tier, only when asked by rule or reading.** Draft a member
   update (through the vault, unmasked on return), decide that a delivery message means resolved,
   decide that a complaint means reopen, write the close pass (facts, vendor engagement, review
   prompt). Every judgement that changes state is a proposal unless that action type has earned
   autonomy (law 8).
4. **Sleep.** Compute the next alarm from the policy, write state, `next_wake_at`, done.

**What it does alone and what it reports up.**

| Alone | Reports to Elaya (a proposal card to the bishop, or a line on the WhatsApp staff channel) |
| --- | --- |
| Reminders to the assignee | A breach, with who is on the ladder |
| Refreshing the summary | A member who sounds unhappy on any ticket |
| Linking messages with high confidence | A request that changed materially (new date, doubled pax) |
| Ticking checklist items a note clearly completes | A proposed status change (resolved, reopened, dropped) |
| Setting SLA timestamps | A draft member update ready to send |
| Writing observations | A close pass that found a new fact worth confirming |
| Health events | |

**Cost, order of magnitude.** 150 tickets a day, about 10 wakes each over its life, of which maybe
4 carry new text: 600 routing-tier reads a day at about 3,000 tokens is under 2 million tokens a
day, a few dollars. Reasoning calls, about 2 per ticket, another few dollars. The rule pass is free.
The whole sentinel fleet costs less than one genie's lunch.

**Failure modes, planned for.** A crashed worker leaves `next_wake_at` in the past, and the next
worker picks it up. A model outage degrades to rules only; nothing is lost because the mailbox is
the ledger. A runaway prompt is bounded by a per-ticket token budget in the state (a ticket that has
spent its budget only runs rules and pages the bishop). Duplicate fires are impossible by design: a
rule's fire is recorded in the state before the notification is sent, inside the same transaction.

**Learned, not guessed.** The rules above start from Freshdesk's own configuration (its reminders
and its three-level escalation ladder) and are tuned from the mirror: which nudges preceded a
resolution, which escalations were noise. The mirror's `ticket_changes` are the sentinel's training
diary before the sentinel exists.

### 7.7 Elaya, the mother

Elaya does not watch tickets herself; the sentinels do, and they write to the same ledger she reads.
Her roles in this system:

- **The face.** Both channels. A genie asks about a member or a ticket and gets an answer from the
  snapshot, the ledger, the mirror and the archive. Tools, all in the Python registry, all gated by
  `canAccessMember` and the queendom: `get_member_profile`, `search_member_history`,
  `list_member_tickets` (Sia and mirrored Freshdesk together), `get_ticket`, `list_my_tickets`,
  `get_ticket_board` (bishop and up), `find_vendors` (exists, now takes member context).
- **The hands, through the bridge.** Write tools, inline or propose-only like the lead tools:
  `add_ticket_note` (inline), `link_message_to_ticket` (inline), `create_ticket` (propose),
  `update_ticket_status` (propose), `assign_ticket` (propose), `draft_member_update` (inline draft,
  the send is human), `add_member_fact` (inline, source `agent_note`, the caller's name on it).
- **The inbox.** Intake proposals and sentinel escalations are `elaya_actions` rows with a target
  user (the bishop). They surface as the two-action Approve or Dismiss card in Serene (the "later
  phase" from `docs/modules/elaya.md`, built now) and as a yes or no line on the WhatsApp staff
  channel through the existing confirmation resolver. One live proposal per ticket per kind.
- **The briefing.** A daily digest per queendom (heavy tier, 07:30 IST with Lead Revival's cron
  pattern): what came in, what breached, who is unhappy, what closes today. The founder's version
  across queendoms. During the transition the digest reads the mirror, so it is useful from T2.

### 7.8 Intake, phase 1 (built first): the genie selects the messages

Before the automatic reader, the flow the founder described, built in T1 and used by the team
from day one:

1. In the Sia chat viewer, a genie or bishop selects the messages in the member's group that
   make up a request (one tap per message, or a range), and presses **Create ticket**.
2. The selected messages, the member's snapshot (addresses, preferences, dislikes, open
   tickets) and the vendor vocabulary go to the **ticket creator**, a dedicated prompt on the
   reasoning tier, masked through the vault. It returns the category, a title, the typed brief
   for that category, a suggested priority with its reason, the vendor shortlist request, and
   the acknowledgement text the genie may send.
3. The **new ticket page** opens pre-filled. Everything is editable. The same page creates a
   ticket by hand with nothing selected. Saving writes the ticket, the `ticket_message_links`
   rows for the selected messages, and the `proposed_by_run_id`.
4. The bishop approves the priority (or the ticket, when policy says so), the SLA clocks start,
   and the sentinel is born.
5. On the live ticket page, the **help window** on the left shows what the sentinel and the
   twin know that matters to this ticket: the member's relevant facts and dislikes, the
   addresses to choose from, past tickets like this one and how they went, the vendor shortlist
   with reasons, the checklist, and any open anticipation. It refreshes as the ticket moves.

The selected-messages-to-ticket pairs are also the training set: every one is a labelled
example of "these messages became this ticket", which is what the automatic reader below learns
from and is graded against.

### 7.8b Intake, phase 2: reading the groups so the bishop does not have to

A cursor consumer named `intake` on `sia.wag_messages`, restricted to mapped member groups and
messages whose sender role is `member` (or a family member facet with permission to request). It
runs per message with the session window as context and the member's open tickets (Sia and
mirrored) as candidates.

Output, routing tier, structured:

```jsonc
{ "kind": "request | update | member_reply | question | feedback | complaint | praise | chatter",
  "ticket_id": "… when update/reply, from the candidates …",
  "confidence": 0.0-1.0,
  "category": "…", "sub_category": "…", "priority_hint": "…",
  "brief": { … the category's fields, only what the message says … },
  "tone": "neutral | happy | frustrated | angry",
  "wants_ack": true }
```

Rules: `request` at or above 0.85 becomes a `proposed` ticket with the enrichment of section 7.4.
Below it, a bishop queue item ("is this a request?") with the same card. `update` and
`member_reply` above 0.8 write the message link and wake that ticket's sentinel; below, a link
proposal. `complaint`, `praise`, `frustrated`, `angry` write health events regardless of kind.
`chatter` writes nothing. Every output is a run.

**Shadow mode is free now.** While bishops still create tickets in Freshdesk, every intake
proposal is compared with the mirror: did a Freshdesk ticket appear for the same member within an
hour, with the same category? The agreement rate is the intake exam, measured daily on live
traffic with no labelling effort. The golden set of T3 is cut from the same join.

**The one-minute acknowledgement, decided 2026-09-15: fully human.** Law 9 says the watcher never
speaks, and the founder went further: no model posts in a member group, now or as the default
later. The one-minute reply is handled by the agents today; Serene's job is to make it faster and
safer, not to replace it. So Serene shows the agent, within seconds, what the message is and a
suggested reply in the member's usual register; the agent types it in WhatsApp themselves. The
three options below stay on record; only A is planned.

| Option | How | When |
| --- | --- | --- |
| A. Human sends, Elaya drafts | Within seconds the bishop's phone gets the classification and a drafted acknowledgement in the member's usual register; the bishop pastes or edits and sends from their own number, as today | Phase 1, from tranche T3 |
| B. A speaking identity | A second WhatsApp account per queendom ("Indulge Desk") is a member of every member group; it sends acknowledgements and approved updates, never free text, always from templates or bishop-approved drafts. Separate session, separate rules, separate kill switch from the watcher | After intake precision holds at 0.9 for four weeks |
| C. Autonomy per category | The speaking identity acknowledges and later confirms low-risk categories on its own | Earned per category, revocable per row |

A is the decision. B and C are not planned; they would need a new founder decision, and never the
watcher number.

### 7.9 SLA and the smart alerts

The sentinel is the SLA engine; there is no separate timer table for tickets. The policy rows of
section 7.2 are the only input; they start as Freshdesk's numbers and its escalation ladder.
Priority is real here (decided 2026-09-15): Freshdesk had it and the agents ignored it, so in
Serene the ticket creator suggests a priority with a reason, the bishop approves or changes it,
and only then do the SLA clocks for that priority start. A ticket without an approved priority
shows on the bishop's board until it has one. Policies differ by priority, by category and by tier,
and they are edited in the Sia settings page, not in code. The
alerts, in the order a ticket meets them:

| Moment | Who hears | Channel |
| --- | --- | --- |
| A proposal waits more than 5 minutes | bishop | push + WhatsApp |
| First response due in 5 minutes, not yet done | genie | push |
| First response breached | genie, then bishop at +15 | push + WhatsApp |
| Update cadence missed | genie | push |
| Vendor silent past policy | genie ("nudge or switch, the shortlist has two more") | in-app |
| Member silent in `awaiting_member` past policy | genie, with a drafted gentle follow-up | in-app |
| Delivery time passed, not resolved | genie, then bishop at +30 | push |
| Resolution target near (80%) | genie | in-app |
| Resolution breached | genie, bishop, queen per the ladder (Freshdesk's three levels, kept) | push + WhatsApp |
| Member sounds unhappy on any ticket | bishop | push + WhatsApp |
| Health drops 15 points in 7 days | bishop, queen | WhatsApp |
| Daily digest 07:30 IST | queen per queendom, founder across | WhatsApp + in-app |

All through the notification catalog and the per-user preferences; breach and unhappy alerts to
managers are not muteable.

### 7.10 Money on the ticket

The team logs cost and selling price in notes and in `cf_invoice_amount`, and Zoho holds the
ledger. The ticket gets a `money` jsonb (quote, cost, price, currency, tax mode, payment status,
Zoho reference, invoice number) and the `payment_due` state. The sentinel reads a note like "Cost
Price 8250, Selling Price 8250, paid via card 1768" and proposes the fields. Finance keeps Zoho;
Serene shows the numbers on the ticket and sums them on the member card (`counters.spend_90d_inr`).
Nothing in Serene mints an invoice. A later tranche can wire Zoho references both ways.

### 7.11 The Freshdesk transition

| Step | What | Depends on |
| --- | --- | --- |
| 0. The mirror (done 2026-09-15) | Every ticket, thread, contact, agent, group, field and SLA policy mirrored, with the movement history from today. `/freshdesk` shows it | The migration push, the env vars, the backfill run |
| 1. Learn | The queries of section 2.3, as saved SQL and a small report on `/freshdesk` (stage durations per category and queendom, agent load, message-to-ticket delays) | The backfill complete |
| 2. Shadow | Intake proposes tickets in Serene while bishops still create in Freshdesk. Agreement with the mirror is measured daily and automatically | T3 |
| 3. Pilot one queendom | That queendom's bishops and genies work in Serene. Freshdesk stays open read only for them; the mirror keeps flowing for the other two. Two weeks | T1 to T4 |
| 4. Cutover | All three queendoms on Serene. History imported from the mirror into `sia.tickets` with `origin = 'freshdesk_import'` and the notes as events (an in-database copy, no API needed). Freshdesk read only, then archived; the mirror stops. The member app (a separate product) keeps reading Freshdesk until its own later integration; it is not part of this cutover (founder, 2026-09-15) | T6 |

The `freshdesk_id` column stays forever; history keeps its old number next to the new one.

---

## 8. How it runs

| Runtime | What runs there | Notes |
| --- | --- | --- |
| Next.js on Vercel | The ticket board, the ticket page, the member card, the bishop inbox, the Sia panel additions, `/freshdesk`; every server action (Zod, `requireProfile`, the mutation cores, `{ data, error }`); the write bridge; the Freshdesk and app-signals webhooks | RLS reads through the session client; writes through the cores. No worker logic here |
| Trigger.dev | The Freshdesk minute sync (exists), the lead crons (exist), the queendom daily digest | Scheduled Node work with a budget, no per-ticket state |
| Python on Fargate (`api` service, and a second `worker` service when load asks) | The brain (exists), the intake consumer, the sentinel pool, the profiler, the embedder | One container image, several entry points. The worker loop is `asyncio` tasks: each polls its queue (a cursor or `next_wake_at`) with `SKIP LOCKED`. Scaling is a second task in the same ECS service |
| Postgres (Supabase) | Everything. Three module schemas (`public` for the spine and profile layers, `sia` for the archive and the ticketing, `freshdesk` for the mirror). The queue too (`SKIP LOCKED` + triggers that set `next_wake_at`). Realtime on `ticket_events` for the live board | Tickets do not need partitioning at this volume (55k a year); `ticket_events` gets monthly partitions from day one anyway |
| Redis (Upstash) | Snapshot cache, notification latches, the intake dedup latch | The `withRedisCache` envelope |
| Jina API | Embeddings and reranking, masked text only | Behind `llm/embeddings.py` |
| Anthropic via the registry | Routing, reasoning, heavy | Behind the vault |
| Freshdesk API | Read only, 50 calls a minute shared with the member app, every call budgeted | Behind `freshdesk-api.ts` until cutover |

Scale check. 150 tickets a day and 2,000 group messages a day is a quiet Postgres. Ten times that is
still one database. The escape hatches are the same as the archive's: a dedicated Postgres for the
`sia` schema, a dedicated vector store for `member_chunks`, a second worker service. Each is a lift,
not a redesign, because every schema is its own clean unit.

Latency targets, written down so the exams can check them: snapshot read p95 under 50 ms cached and
300 ms cold; intake classification under 10 seconds from message receipt; a sentinel wake under 60
seconds from its trigger; a Realtime board update under 2 seconds; an Elaya member answer under 4
seconds end to end on WhatsApp; a Freshdesk change visible in the mirror within 60 seconds (seconds
with the webhook).

---

## 9. Security and privacy, the checklist

| Concern | Answer |
| --- | --- |
| Who can read a member | Their queendom's staff, admin, founder. RLS on every member and ticket table, one SQL helper `get_user_queendom()` reading `profiles`, Rule 09 |
| Who can write | Nobody directly. Server actions through the cores; the workers through the service role; Elaya through the bridge. `sia.tickets` has no user write policy, the deals posture |
| Who can read the mirror | Admin and founder today (0193); per queendom with the Sia UI, keyed on the Freshdesk group |
| What leaves for a model | Masked text only, through the vault; the round-trip test is in every exam; `masked_text` is stored so it can be audited |
| What leaves for Jina | Masked text only; self-host is the fallback if policy demands it |
| What goes to Freshdesk | Nothing. Reads only, one key, one member, one budget |
| Logs | No member text, no phone, no name. Ticket numbers and ids only |
| Files | A private bucket, paths stored, signed URLs, the vendor-invoices posture. Freshdesk attachment urls expire and are never shown as links |
| Audit | `member_access_log` for every card open; `ticket_events` for every ticket change; `elaya_actions` for every proposal; `sia.extraction_runs` for every model call; `freshdesk.sync_runs` for every pull |
| Append-only tables | `member_facts`, `member_health_events`, `member_access_log`, `ticket_events`, `ticket_message_links`, `freshdesk.ticket_changes`, `freshdesk.webhook_events`: no UPDATE, no DELETE, enforced in the migration |
| Secrets | The Freshdesk key and webhook secret, the Jina key, the app webhook secret: the four-places ledger (`backend/.env`, `.env.local`, Vercel, SSM) plus the Trigger.dev worker |
| The webhooks | `readJsonBody`, `safeSecretCompare`, `createRateLimiter`, idempotent on the sender's event id; the Freshdesk payload is a notification, never data |
| Autonomy | Per action type, per category, in an `elaya_autonomy` table (rows, not code), revocable in one UPDATE, logged |
| Member-facing sends | Never from the watcher; a separate identity with templates and approvals (DECIDE 2) |

---

## 10. The build order, with exams

Two lanes share a foundation. Lane B (tickets) goes first after T0 because it removes the Freshdesk
dependency and produces the profile's richest source. Lane A (profile) starts as soon as T1 is in
shadow. One engineer can run them in sequence in about four months to cutover; two engineers run the
lanes in parallel in about ten weeks. The mirror shortens T0 and gives T3 its exam for free.

| Tranche | What ships | Exam (done when) | Size |
| --- | --- | --- | --- |
| **T0. The org and the spine** | The mirror live (migration pushed, backfill run, webhooks registered); `sia.queendoms` seeded from the three Freshdesk groups; `profiles.queendom_id` + `concierge_role` from the roster the founder supplies (the Freshdesk agents are not imported); `members.queendom_id`, `tier`, `app_member_id` seeded from the mirror; the mapping coverage push from the Sia plan's S0; the ticket and facet vocabularies read from `freshdesk.ticket_fields` and `contact` fields; the section 2.3 queries as saved SQL | Every member with a Freshdesk ticket has a queendom. At least 85% of archive messages sit in mapped groups. At least 90% of mirrored tickets carry a `member_id`. Every genie and bishop on the founder's roster has a profile with a queendom. No model runs yet | 1 week |
| **T1. Tickets, the core** | The `sia` ticketing tables, the schema exposed to `authenticated` with RLS, the state machine, the mutation cores and RPC, the board (Realtime), the ticket page with the linked-messages view, manual create with per-category briefs and checklists, notes, the picker (bishop confirms), SLA policy rows seeded from Freshdesk's, `task_ticket_meta`, the notification categories, the member card v0 (spine + open tickets + mirrored history) inside the Sia panel | One bishop runs a full day for one queendom on Serene in shadow (creating in both) without missing anything Freshdesk has. Type check, lint, RLS tests for the queendom boundary | 2 to 3 weeks |
| **T2. The sentinel, rules first** | The worker pool, the wake triggers, the rule pass, reminders and breaches through the catalog, the summary refresh, the daily digest (reading the mirror first); then the reading pass and the judgement pass behind proposals | Every SLA state change fires within 60 seconds of its moment, never twice. A killed worker mid-wake loses nothing. Model cost per ticket under the target set at T2 start | 1 to 2 weeks |
| **T3. Intake** | The `intake` cursor consumer, proposals, the Approve or Dismiss card in Serene, the WhatsApp yes or no through the resolver, the drafted acknowledgement (option A), message linking by hand in the Sia viewer, the automatic shadow comparison against the mirror | A golden set of 200 real member messages cut from the mirror join, masked and labelled: precision at least 0.90 on `request`, at least 0.85 on `update` with the right ticket, recall at least 0.85 on both. Shadow agreement with the mirror at least 90% for a week. Bishop edit rate on proposals under 20% | 2 weeks |
| **T4. The profile layer** | The vault keyed on member, `member_facts`, `member_health_events` + policy, `member_snapshot` + the profiler with the dirty queue, the seed pass over the mirror's contacts and tickets, the close pass in the sentinel, genie notes as facts, the app-signals webhook, the member card v1 with evidence links and the health score, `member_access_log` | The Sia plan's S1 and S2 exams: lossless round trip on 100 windows; facts precision at least 0.85 on the golden set; three member cards judged right by a manager. Snapshot p95 under 50 ms cached | 2 to 3 weeks |
| **T5. Memory and Elaya** | `member_chunks`, the Jina provider, the embedder, hybrid search + rerank, the member and ticket tools on both channels, context assembly with the budget | A 50-question retrieval set: recall at 5 of at least 0.8. The brain's eval suite at or above its current score with the new cases. An automated check that no model input or embedding input contains an unmasked name, phone or email | 1 to 2 weeks |
| **T6. Vendors, the app, cutover** | Ticket to engagement ledger, the ranker with member context inside the ticket, the review prompt at close, `get_member_tickets` for the app, the pilot queendom, then all three, the in-database history import, Freshdesk read only, the mirror stopped | Two weeks of one queendom fully on Serene with no return to Freshdesk. The member app shows Serene tickets with the same four stages. Every archived ticket still opens by its old number | 2 weeks |
| **T7. The compounding** | Anticipation (occasions, patterns like "Friday departures, 4 pax"), Joker suggestions attached to tickets, staff response metrics per queendom on the performance page, autonomy grants per category, the speaking identity (option B) if decided | Each item has its own small exam; none blocks cutover | ongoing |

Every tranche ends with a changelog entry, a migration index entry, and a spec update in
`docs/modules/sia.md` (this plan is the draft; the module doc is the record of what shipped).

---

## 11. Decisions for the founder

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Tickets native in Serene, superseding the 2026-09-04 decision, in the `sia` schema | Yes. This plan. The `sia` schema is the module; no rename (law 11) |
| 2 | The one-minute acknowledgement | **Decided:** fully human. Serene suggests, the agent types. No model posts in a member group |
| 3 | The concierge staff as Serene users | **Decided:** from `sia-agents-roster.md` (30 people, matched to Freshdesk ids and emails; numbers and jokers still to fill), not from the stale agent list |
| 4 | Jina via API on masked text, or self-hosted | **Decided in principle:** the whole vault and every egress must pass DPDP and a security review. Section 5.8 gains the DPDP posture; self-host stays the fallback |
| 5 | The member app and Zoho | **Decided (evening):** build the feeds now, so the member card is functional and informative from day one: app signals into the timeline, Zoho wallet, invoices and payments per customer id. The member app's own ticket reads stay on Freshdesk until its later integration |
| 6 | Access: a member belongs to one queendom; the whole queendom (queen, bishop, genies, joker) sees the member and the score; admin and founder see all | **Decided.** Ticket creation from selected messages: every Sia member plus admin and founder |
| 7 | SLA numbers by priority and category | **Decided:** editable in a Sia settings page (policies, statuses, tags). Seeded with Freshdesk's numbers, tuned after the mirror measures a month |
| 8 | Who sees the health score | Every staff member who can see the member. Never the member. The reasons always shown with the number |
| 9 | Auto-assign threshold and the first autonomy grants | Bishop confirms everything for the first month; then auto-assign when the top score leads by 20%; then autonomy for `resolved` on dining and retail when the sentinel's proposals were approved at 95% for four weeks |
| 10 | The app-signals webhook is built on the app side | **Decided:** now (T1), a small change in `indulge-api` at the points that already emit socket events; Zoho read through a Serene-side `zoho-service.ts` on the same API the app server uses |
| 11 | Backlog spend for the profile extraction | Same as the Sia plan: 20 groups first, the founder checks, then the run |
| 14 | Expired members | **Decided:** kept as member records with `membership_status = expired`, visible to their queendom (they may return); never deleted |
| 15 | Zoho Books | **Decided:** the same organisation and setup the member app server uses; a Serene-side `zoho-service.ts` reads wallet, invoices and payments per customer id on the same API |
| 13 | The word: kingdom or queendom | **Decided:** queendom. Three today: Anishqa, Ananyshree, Sanika. Sia roles: queen, bishop, genie, joker (one joker per queendom) |
| 12 | The Freshdesk API key was pasted in chat | Rotate it in Freshdesk profile settings once the env vars are set everywhere, and update the four places. It is a personal agent key; a dedicated "Serene" agent account would keep audit trails clean |

## 12. What changes in the earlier plans

- `plan-sia-intelligence.md` section 9, decision 1 (Freshdesk stays) and decision 5 (aging alerts
  parked) are replaced by this plan. Its `sia.requests` table is not built; `sia.tickets` is the
  request thread, designed. Its decision 7 (Freshdesk once a key exists) is done: the mirror is
  built and Freshdesk joins as a fact source at T4. Its S0, S1, S2 and S4 stand and are folded into
  T0, T4 and T5 here.
- `plan-whatsapp.md` section 9 (the vault) and section 10.5 (embeddings decided) stand. The
  embedding model is now chosen: Jina, section 5.8.
- `docs/modules/vendors.md`: the reserved `source = 'ticket'` becomes live in T6.
- `docs/modules/elaya.md` "later phases": the in-app proposal card is built in T3.
- The Notion Concierge vision: the Chrome extension is out of phase 1 (the member card inside the
  ticket does its job in Serene); the instant chatbot reply is DECIDE 2; everything else in that
  document is here, in the order it can be earned.
- Version 1 of this plan (same day) said Freshdesk was not connected, counted two queendoms and
  124 tickets a day, and put the ticket tables in `public`. All three are corrected above.

## 13. Risks, named

| Risk | Defense |
| --- | --- |
| Coverage: intake over unmapped groups is intelligence over 12% of the traffic | T0 is not optional. The mapping push and the roster (now the 78 agents) come first |
| The 50-call limit: the mirror and the member app starve each other | Every pull is budgeted with a reserve; the backfill pace is capped; `sync_runs` records the remaining allowance so a squeeze is visible before it hurts |
| Intake false positives flood the bishop | The confidence bar, the queue below it, the edit-rate exam, and shadow agreement measured against the mirror every day |
| A wrong fact reaches Elaya's mouth | Evidence on every fact, confidence in the prompt, human facts outrank model facts, and the card shows why |
| The sentinel nags | Every rule fires once per state, the cadence comes from policy rows tuned on the mirror, and the assignee can snooze a rule for a ticket (an event, not a silence) |
| Two systems of record during the transition | Mirror, then shadow, then pilot, then cutover, with agreement measured daily; `freshdesk_id` on every imported row |
| The worker and the brain compete for the same Fargate task | The worker is a second ECS service the day chat latency moves |
| Jina outage | Search degrades to keyword only; the snapshot path never depends on embeddings |
| HNI data on more screens than before | The queendom boundary in RLS, the access log, no member text in logs, and signed URLs for everything |
