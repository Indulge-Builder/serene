# The Sia Intelligence Plan

> **Progress, 2026-09-18** (the live tracker is the status block in `member-ticket-plan.md` 5.9):
> S0 coverage: 420 groups linked, 45 open, staff roster screen built but nobody seated yet.
> S1: the codename vault, the conversation builder and the run ledger are DONE; the scored exam is NOT built.
> S2: fact extraction is DONE and SWITCHED ON (whole history, Active members, founder approved the
> 20-group pilot, decision 4). Requests became native tickets instead (`member-ticket-plan.md` 7).
> S3 digests and alerts: NOT built (the ticket sentinel covers deadlines and silence on tickets).
> S4: Elaya's member tools are DONE on both channels; embeddings are NOT built.
> S5: agent notes as facts DONE (the Observation box), Freshdesk connected DONE, vendors from
> Freshdesk DONE; vendor groups on WhatsApp and voice notes NOT built.
>
> **Status:** planning draft, 2026-09-04. Written after the Step 3 Python brain shipped on both
> channels and the client identity spine (migration 0181) landed with 207 groups mapped.
> This is the detailed spec that `plan-whatsapp.md` Phase W5 and `plan-elaya.md` Phase 3c both
> promised "before building". Decisions marked **DECIDE** are open for the founder.
> Everything else is grounded in the live data as of today.

---

## 1. What we are building, in one paragraph

A Python pipeline that reads the WhatsApp group archive through its cursor and turns it into
things people and Elaya can act on: a living profile per client (what they want, what they like,
what they have asked for and what is still open), request threads the team can pick up without
scrolling a thousand messages, daily digests per group, alerts when a client is left hanging,
and Elaya tools that answer "what has this family been asking for this month" on both channels.
Built the way the brain was built: in tranches, each one shipped only when its exam says so.

---

## 2. The ground truth (measured 2026-09-04)

| Fact | Number | What it means for the plan |
| --- | --- | --- |
| Messages in `sia.wag_messages` | 108,879 | 85k text, 16k images, 2k documents, 1k video, 358 voice, 1.5k system |
| Source | 90k history sync, 19k live | The watcher joined in July; the archive is July to September 2026 |
| Groups | 477, all active | 207 mapped to a client today, 272 unmapped |
| Messages inside the 207 mapped groups | 13,210 (12%) | The mapped groups are the quiet ones (median 16 messages) |
| Unmapped concierge-style groups | 253 | These hold the busy clients: "Naina V's Concierge" 2,401 messages, "Aarav Gupta's" 2,261, "Jeet's" 2,120 |
| Unmapped that resolve by name to exactly one client | 183 | One-click confirms in the existing `/sia` mapping tool |
| Internal and vendor groups | 19 | "Jokers" 6,227 messages, "Office Indulge Backend" (77 members), "Queen's Council", the Revenue groups |
| Raw `lid-mapping.update` events | 19,535 | Already normalized live by the connector (6,333 pairs, replay added 4 rows); the still-hidden members never had a pairing event |
| Hidden members in unmapped concierge groups | 1,967 of 2,106 | 8 to 17 per group: these are mostly concierge STAFF who are not Serene users, so `profiles` cannot identify them. A staff roster (queendom, role, WhatsApp number) is required |
| Unmapped concierge groups where subject, a member's display name and exactly one spine client all agree | 134 | The by-name batch (`mapping-review-by-name.csv`), same three-signal bar with the display name standing in for the hidden phone |
| Voice notes | 358 | Transcription is not wired yet, and by volume it is not urgent |
| Media rows with a transcript column | none | `wag_media` has no transcript field today |

Two consequences drive the order of work:

1. **Coverage first.** Intelligence over 12% of the messages is not intelligence. The LID
   backfill plus the assisted confirms lift the mapped share to roughly 85% before any model runs.
2. **Client groups are thin, internal groups are thick.** The client's own group holds the asks
   and the replies. The coordination (who is doing what, what got dropped) happens in the internal
   groups. Client profiling reads the client groups; staff and request tracking must read both.

---

## 3. What already exists and is reused wholesale

| Piece | Where | Reused for |
| --- | --- | --- |
| The archive, raw first, append only, cursor table | `sia.wag_*` (migration 0169 onward) | The only input; consumers read through `wag_pipeline_cursors` |
| The client identity spine | `public.clients` (0181), `wag_groups.client_id` | Every fact hangs off a client id |
| The `/sia` section | `src/app/(dashboard)/sia`, `sia-service.ts`, `SiaGroupInfoPanel` | The client card, request list and digest render inside the panel that exists |
| The mapping tool | `updateSiaGroupMapping` + the mapper script | Assisted confirms; the script re-runs after the LID backfill |
| The Python brain | `backend/app` on Fargate | The pipeline is a second entry point in the same service, same DB access, same LLM registry |
| Model tiers | `llm_providers` rows routing / reasoning / heavy | Classification on routing, extraction on reasoning, weekly digests on heavy; switching is an UPDATE |
| The PII gateway | `backend/app/brain/pii.py` | The regex floor; the consistent-codename vault is built on top (section 5) |
| Notifications | `createNotification` + the category catalog (0133) | Alerts ride the existing in-app + push + WhatsApp fan-out |
| The exam | `evals/` harness | A second golden set for extraction; same discipline, same runner |
| Elaya read tools | `backend/app/tools/registry.py` | New Sia tools are declared the same way, same role gates, same masking |

Nothing in this plan creates a second pipeline, a second brain client, or a second UI stack.

---

## 4. The data model (the profiling layer, designed properly)

The founder's questions from 2026-09-04: many addresses per client, dietary preferences,
likings, continuous updates from chat, tickets and agent notes, fast for the model, fast for the
UI, secure, scalable. The answer is three layers with different rules each.

### 4.1 Facts, append only (the truth)

`public.client_facts`, one row per observed fact, never updated, never deleted.

| Column | Meaning |
| --- | --- |
| `client_id` | the spine |
| `facet` | a small controlled vocabulary: `address`, `dietary`, `preference`, `occasion`, `family`, `travel`, `budget_signal`, `contact`, `dislike`, `note` |
| `key` | optional sub key, for example `address.home`, `address.farmhouse`, `preference.hotel_brand` |
| `value` | text, plus `value_json` for structured pieces (a parsed address, a date) |
| `evidence` | `chat_jid`, `wa_message_id`, `sender_jid`, `wa_timestamp` (soft references, the archive law) |
| `source` | `whatsapp_group`, `agent_note`, `freshdesk_ticket`, `import` |
| `confidence` | 0 to 1 from the extractor, 1.0 for a human-entered note |
| `extracted_by` | model id plus prompt version, so a bad prompt version can be re-run and superseded |
| `observed_at` | the moment in the chat the fact was true |
| `superseded_by` | set when a newer fact for the same facet and key wins; the old row stays |

Two homes co-exist because facts conflict: "prefers sea view" from March and "hates sea view,
too humid" from July are both stored; the later one supersedes, the earlier one remains readable
with its evidence. A wrong extraction is corrected by a new row, never by editing.

### 4.2 Request threads (the work)

`sia.requests`, one row per thing a client asked for.

| Column | Meaning |
| --- | --- |
| `client_id`, `group_jid` | who and where |
| `title` | "villa in Goa for the 14th" |
| `status` | `open`, `in_progress`, `done`, `dropped`, `unclear` |
| `opened_at`, `last_activity_at`, `closed_at` | from message timestamps, not our clock |
| `owner_staff_profile_id` | the staff member who picked it up, when detectable |
| `evidence_from`, `evidence_to` | the message span |
| `summary` | model written, refreshed as the thread moves |
| `confidence` | the extractor's certainty that this is a real request |

Status moves by evidence: a later message that reads as delivery closes it; silence past a
threshold flags it `open` and aging. A human can override status in the UI; the override is a
row in an audit table, not a silent update.

**DECIDE 1:** these are Serene native request threads, not Freshdesk tickets. Freshdesk stays an
external system and becomes a second fact SOURCE later (section 7, tranche S5). Recommended:
yes, native. A request thread is derived from evidence and can be wrong; a ticket is a promise.

### 4.3 Snapshots and digests (the fast reads)

- `public.client_snapshot`: one jsonb per client, rebuilt from facts by a job. This is what the
  UI card and the Elaya tools read in one query. Rebuildable, so it may be overwritten.
- `sia.group_digests`: one row per group per day (and per week on the heavy tier): what happened,
  open items, tone, who replied how fast. Rebuildable, versioned by prompt.
- `sia.wag_embeddings`: pgvector, masked text, chunked per message and per digest. Deferred
  until the embedding model is chosen (**DECIDE 6**).

Rule: facts and requests are truth and are append only; snapshots, digests and embeddings are
derived and may be regenerated at any time from truth. If a derived table is ever wrong, the fix
is a rebuild, never a manual edit.

---

## 5. The border: masking before any text leaves

`plan-whatsapp.md` section 9 is the law: identity is swapped for consistent code names at the
moment text leaves for a model, and swapped back before storing. Today `pii.py` masks phones
and emails by regex. It does not give consistent code names, and it does not touch names.

The vault, built as tranche S1:

- Per group, a table `sia.codenames` maps each participant (`sender_jid`) to a stable code:
  the client is `CLIENT_1` (and `CLIENT_2` for a spouse), staff are `STAFF_<role>_<n>`,
  vendors `VENDOR_<n>`. The same human keeps the same code across every window forever.
- Names in message text are replaced using the group's member push names plus the client's
  spine names; phones and emails use the existing regex floor; addresses are NOT masked
  (they are the signal, section 9: mask identity, never intent).
- The extractor sees only codes. When facts come back they reference codes; the pipeline swaps
  back to real ids before writing `client_facts`. The model never learns who.
- The masked window and its code map are both kept (`sia.extraction_runs`) so any extraction
  is auditable and replayable.

**DECIDE 2:** build the vault before the first extraction runs (recommended), or ship the first
backlog run on the regex floor only. The recommendation is the vault first: the backlog is
109k messages of the most sensitive data we hold, and the vault is small work (a mapping table,
a replace pass, a reverse pass, a round trip test).

---

## 6. The pipeline (how it runs)

```text
wag_messages  --cursor-->  window builder  -->  masker  -->  extractor  -->  writer  -->  derive
  (append only)            per group,          (vault)      (LLM, tier     (facts,          (snapshot,
                           per session                       by job)        requests)        digests,
                                                                                            embeddings)
                                                                                                |
                                                                            surfaces  <---------+
                                                                    (Sia UI card, Elaya tools, alerts)
```

- **Consumers** are rows in `wag_pipeline_cursors`: `profiler`, `digester`, `embedder`. Each
  reads forward from its own position; none disturbs another. A replay is a cursor reset.
- **Windows** are per group, split on time gaps (a new session after 6 quiet hours) and capped
  by token size. A window carries the group's last digest as context so extraction sees the
  thread, not just the slice.
- **Unlinked groups** never reach the extractor (`group_kind = 'unmapped'`). Member roles do
  not gate — see rule 4; the old "any unknown member blocks" reading was dropped on 2026-09-17
  because memberships cover family, so a member's household is a normal, expected presence.
- **Tiers:** message classification (is this a request, a delivery, a complaint) on `routing`;
  window extraction on `reasoning`; the weekly client digest and conflict resolution on `heavy`.
  All three are `llm_providers` rows; a model change is an UPDATE.
- **Runs** are recorded in `sia.extraction_runs` (window span, model, prompt version, token
  counts, duration, cost estimate). Every fact points at its run.
- **Where it runs:** the same Fargate `api` service as the brain, as a background worker loop
  triggered by a schedule, so no new deployable. A separate worker container is the escape hatch
  if extraction load ever competes with chat latency.

**Backlog cost, order of magnitude:** the mapped client groups after S0 hold roughly 90k
messages. Windowed, that is around 20 million input tokens through the reasoning tier once,
plus digests. That is a one-time spend in the low hundreds of dollars, then a trickle of one to
two thousand messages a day. **DECIDE 4:** approve the backlog run once S2's exam passes on the
sample.

---

## 7. The tranches (each shippable, each with an exam)

### S0. Coverage: get the busy groups mapped. (days, no model, starts now)

1. **LID backfill:** replay `lid-mapping.update`, `group-participants.update`, `groups.upsert`
   and `contacts.upsert` from `wag_raw_events` into `wag_contacts.phone` and `.lid`. Offline,
   never a live session query.
2. **Re-run the mapper.** The three-signal AUTO rule now sees phones it could not see. Expect a
   large share of the 183 name-resolvable groups to map automatically.
3. **Assisted confirms** for the rest in the `/sia` mapping tool: the tool shows the single name
   candidate; a human clicks. Ambiguous and no-candidate groups stay unmapped, as agreed.
4. **The staff roster.** Only 14 staff have a phone in `profiles`; the concierge floor (genies,
   bishops, queens) mostly are not Serene users, so their group memberships are `unknown`. The
   founder supplies a roster (queendom, name, role, WhatsApp number); it lands in a
   `sia.staff_roster` table (or as inactive `profiles` rows, decided at build time) and syncs
   `wag_contacts.participant_role` + the queendom link. Without this the "unknown member blocks
   profiling" rule blocks nearly every group, so the roster is the real gate of S0.
5. **Display-name corroboration** for groups whose client phone is hidden: subject name + a
   member's WhatsApp display name + exactly one spine client, all agreeing, is accepted at the
   same bar as the phone rule (134 groups). Subject-only matches (49) stay SUGGEST for a human
   click; several candidates or no match (70) stay manual.

**Done when:** at least 85% of all messages sit inside mapped client groups, and no mapped group
has an `unknown` member who has sent more than a handful of messages.

### S1. The border and the exam. (about a week)

1. The codename vault (section 5) with a lossless round-trip test on 100 sampled windows.
2. The window builder and the `profiler` cursor consumer, running end to end with a stub
   extractor (no model), writing `extraction_runs` only.
3. The extraction exam: a golden set of 40 to 60 real windows, masked, hand labelled with the
   facts and requests they contain. The scorer reports precision and recall per facet and for
   request detection. Lives beside `evals/`, same runner discipline.

**Done when:** a masked window round-trips losslessly, the cursor advances and resumes
correctly across restarts, and the golden set exists with a scorer that runs in one command.

### S2. Extraction v1: facts and requests. (two weeks)

1. The extractor prompts for facts and requests, on the reasoning tier, versioned.
2. Tables `client_facts`, `sia.requests`, `public.client_snapshot`; the rebuild job.
3. The client card inside `SiaGroupInfoPanel`: identity from the spine, current facts by facet
   with their evidence links (click a fact, land on the message), open requests with age.
4. The backlog run over the mapped groups, behind DECIDE 4.

**Done when:** the golden set scores at or above the agreed bar (proposal: 0.85 precision on
facts, 0.80 recall on requests), and a manager opens three client cards and says each one is
right. Score down on a prompt change means the change does not ship.

### S3. Digests, aging and alerts. (one to two weeks)

1. Daily group digests, weekly client digests on the heavy tier.
2. Request aging: an `open` request with no staff reply past the threshold becomes an alert.
   New notification category `sia_request_aging` in the catalog (0133), recipients the group's
   genie plus the domain bishop; the founder gets a daily digest. **DECIDE 5:** thresholds and
   recipients.
3. Staff response metrics per group (first reply time to a client message, by role), read from
   both client and internal groups, surfaced on the health panel first, the performance page
   later.

**Done when:** a request left unanswered past the threshold pages the right person through the
existing channels, and the daily founder digest reads like a briefing a chief of staff would write.

### S4. Elaya tools and memory. (one to two weeks)

1. Embeddings: `sia.wag_embeddings` on pgvector, masked text, a cursor consumer `embedder`.
   **DECIDE 6:** the embedding model.
2. Read tools in the Python registry: `get_client_profile`, `get_client_requests`,
   `search_client_history`, `get_group_digest`. Same role gates as every tool; access follows
   the group: staff who are members of the group, the domain manager, admin and founder.
   **DECIDE 3b:** confirm this access rule.
3. Eval cases added to the brain's exam ("what has the Mehta family asked for this month").

**Done when:** those questions answer correctly on both channels, the brain's exam is at or above
its current score, and a tool result never carries an unmasked phone or email.

### S5. Second sources and vendors. (after S4)

1. Agent notes as a fact source (a note on a client card writes a `client_facts` row with
   confidence 1.0 and source `agent_note`).
2. Freshdesk tickets as a source (the spine already carries `freshdesk_contact_id`); needs API
   access. **DECIDE 7:** when.
3. Vendor profiling (plan section 10.6): the same pipeline over vendor groups, linked to the
   vendor spine from `docs/modules/vendors.md`.
4. Voice notes: transcription at ingest through the existing service, once volume justifies it.

---

## 8. The rules of this layer

1. **Truth is append only.** `client_facts` and `sia.requests` are never updated in place;
   corrections are new rows; human overrides are audit rows.
2. **Derived is rebuildable.** Snapshots, digests, embeddings can be dropped and regenerated
   from truth at any time. Nobody edits them by hand.
3. **Nothing leaves unmasked.** Every model call and every embedding call goes through the vault.
   Zone 1 keeps full fidelity; Zone 2 sees codes.
4. **Linked or not read (decided 2026-09-17).** A group is processed only when it is linked to
   an entity: a member (`wag_groups.client_id`), a vendor, or an internal team. Unlinked groups
   are never read. Inside a linked group, member roles never block: tagged staff are staff, and
   everyone else is the member's side (the member or their household — a membership covers
   family). Roles decide attribution ("the client asked" / "the genie replied"), not access.
   Guard: a person with "at Indulge" in their WhatsApp name, or present in many client groups,
   counts as staff even without a roster tag, so a non-roster colleague is never read as family.
5. **Every extraction is a run.** Model, prompt version, tokens, span. A fact without a run is
   a bug.
6. **The exam gates every prompt.** Same law as the brain: score up, ship; score down, fix.
7. **One pipeline, one brain, one UI.** New consumers are cursor rows; new tools are registry
   entries; new cards live in the existing Sia panel.
8. **Sia and Gia never mix.** The only meeting point is `public.clients`.

---

## 9. Decisions, taken 2026-09-04

| # | Question | Decision |
| --- | --- | --- |
| 1 | Request threads | **Parked.** Freshdesk is and stays the ticket system. The request-thread architecture (fields, workflow) is not designed yet, so `sia.requests` is NOT built in S2. What the model learns first is the link: "in this group the client sent this, and this Freshdesk ticket was made for it". Tickets become a fact source once Freshdesk API access exists. |
| 2 | Masking | **Vault first**, with a guard: the exam scores the same sample masked and unmasked, and masking must not lower the score. Identity is hidden; intent, places and preferences stay whole. |
| 3a | Roles | The org unit is the **queendom**: a queen leads it, a bishop is its captain (reads every client group, makes sure the Freshdesk ticket exists, is resolved in time, and the client is replied to), genies do the work. Vision: Elaya takes over the bishop's manual reading within about six months; bishops stay for now while Elaya is trained. `profiles.role` map: agent to `genie`, manager to `bishop`, plus explicit `queen` assignments. |
| 3b | Access | A client profile belongs to a queendom. All staff of that queendom see it; admin and founder see everything. The subscription export's "Group" column ("Sanika Queendom", "Anishqa's Queendom") is the client-to-queendom assignment and joins the spine. |
| 4 | Backlog spend | Not needed for S0/S1 (no model). At S2: read 20 groups first (about ten dollars), the founder checks quality, then the full run is approved or not. |
| 5 | Aging alerts | **Parked** with the request threads. |
| 6 | Embedding model | Decide at S4. |
| 8 | The profiling gate | **Linked or not read.** The group must be linked to a member, vendor or internal team; inside it, roles label attribution and never block (family members are part of a membership). Replaces plan-whatsapp §8's "unknown member blocks profiling" reading, decided 2026-09-17. |
| 7 | Freshdesk | No API key or code exists in the repo today. Once a key is provided (`FRESHDESK_API_KEY` + `FRESHDESK_DOMAIN` in the env), Freshdesk ingestion moves up to sit beside S2 as the ticket fact source. |

Consequences for the tranches: S2 ships facts and the client card only (no `sia.requests`); S3
keeps digests and staff response metrics but drops request aging until the request architecture
is designed; Freshdesk joins as soon as the key exists.

## 10. The order, at a glance

```text
NOW       S0  LID backfill, mapper re-run, assisted confirms        (coverage 12% -> 85%)
THEN      S1  Codename vault, window builder, extraction exam         (no model output yet)
THEN      S2  Facts + requests extraction, client card, backlog run    (the first intelligence)
THEN      S3  Digests, request aging, alerts, staff response metrics
THEN      S4  Embeddings + Elaya tools on both channels
LATER     S5  Agent notes, Freshdesk, vendors, voice
```

S0 can start the moment the founder says go. It is offline data work with no model and no
live-session risk, and everything after it depends on it.
