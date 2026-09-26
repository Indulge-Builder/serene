# Hands plan: Elaya gets hands, Instinct is the first pair

Written 2026-09-26, revised the same day after reading the founder's nine days of Instinct chat (Sep 17 to 26; section 3a). Status: **PLAN, nothing built.** Decisions the founder must make are marked
**Decide**. Everything else is my recommendation and I will build it exactly as written unless told
otherwise.

Read `docs/modules/vendors.md` and `docs/modules/sia.md` first if you do not know the vendor book
or the WhatsApp watcher. This plan stands on both.

---

## 1. The idea in one paragraph

Today Elaya reads, remembers and proposes. She has no hands: when a member asks for a table, a
genie opens a browser or calls a vendor. Instinct is a personal AI agent that lives on WhatsApp
and does exactly that legwork (books, rebooks, buys, cancels) by driving a browser and a phone. We
give Elaya a separate WhatsApp number, a separate Indulge identity behind it (name, email, a card
with a limit, a bank account), and let her hand jobs to Instinct the way a genie hands a job to
any vendor. Instinct is a vendor in our book: it gets jobs, it gets scored, it can be dropped.
The member never hears the word Instinct. The genie stays the human who says yes. And the same
shape takes the next agent that appears (Meta's Muse or whoever), because "an agent we message on
WhatsApp" is one vendor kind, not one integration.

A real-world picture: Riya's group says "book the corner table at Ottimo for Saturday, four of
us". Intake proposes a card, the genie makes the ticket, the ticket suggests Instinct first for
dining. Elaya writes the job message from the brief: date, time, four people, the Indulge name, a
budget line. She shows the genie exactly what will be sent and what was held back (Riya's name,
her number). The genie taps Approve. Instinct replies with a confirmation in six minutes. Elaya
files the reply on the ticket, proposes "move to resolved, ₹0, confirmation 4471", the genie
approves, the genie tells Riya. The ledger gets a completed job on Instinct with a six-minute
time. Next month the ranking tells us, in numbers, whether Instinct beats our human dining
vendors.

---

## 2. Three facts that decide the architecture

1. **The Sia watcher stays untouched.** It is a Baileys connector, read-only by law, one number,
   never sends. Hands is a SECOND number and a SECOND process. It shares code with the watcher
   (the raw-first queue, the normaliser, the media worker) through one extracted package, but
   the watcher's own source keeps zero send calls, as its README demands.
2. **Our Gupshup business number cannot talk to Instinct.** Meta blocks messaging between two
   WhatsApp Business API accounts, and Instinct's WhatsApp is one. So the hands number is a
   personal WhatsApp on a dedicated phone (SIM, charged, on Wi-Fi, online every 14 days), linked
   through Baileys like the watcher. This also means Instinct sees an ordinary person messaging
   it, which is what its product expects.
3. **Everything after the message already exists.** The ticket brief (`TICKET_BRIEF_FIELDS`), the
   vendor book and its ledger (`vendor_engagements`), the one ranking, the ticket → vendor link
   (`setTicketVendorCore`, `closeTicketEngagement`), the proposal card with two actions, Elaya's
   write tools with propose-then-confirm, the spend-cap posture from the deep read, the vault
   crypto. Hands is a thin layer that connects them to one more channel.

---

## 3. What Instinct is, and what it is not, for us

| It is | It is not |
| --- | --- |
| A fast executor for jobs that need no member identity: restaurants, groceries, event tickets, cabs, small purchases, cancellations, a call to a shop. | A place for a member's card, passport, address or name. Those never leave Serene. |
| A vendor with a WhatsApp number. Ranked, scored, preferred or avoided like any vendor. | A brain. Elaya decides what to send and when; Instinct decides how to click. |
| A cheap test of "does a booking that comes back in ten minutes change how members feel". | A dependency. It has no API, no contract on reply format, and terms we may be breaking. It can vanish. |

**Decide 1.** Which ticket sub-categories Instinct may take on day one. My proposal: dining
(restaurant), retail (a product delivered to an Indulge address or a member address the member
gave for this order), events (tickets), travel/car_transfer (cabs). Not flights, not hotels, not
anything in the member's name.

---

## 3a. What nine days of the founder's Instinct chat taught us

Advita used Instinct from Sep 17 to 26 (the export is at the repo root, git-ignored). It is the
best spec we have, because it shows what Instinct does, refuses, and gets wrong. In order of how
much it changes this plan:

1. **Instinct cannot call and cannot WhatsApp anyone.** Said three times in the chat: "no voice
   line out", "I can't message your WhatsApp contacts from your account". When a restaurant needed a
   call it handed back a `wa.me` link for the human to tap. So Instinct reaches the world through
   a browser (Zomato pages, airline sites, Swiggy, Snackible, forms, site chat) and through EMAIL
   from a connected Gmail, in the user's voice with the user's footer. The hands identity therefore
   needs a Google Workspace mailbox connected to Instinct, or half its reach is gone. And a vendor
   that only answers the phone stays a genie's job.
2. **Instinct never touches money in India.** Every purchase (chips, the IndiGo flight) ended the
   same way: it staged the checkout, screenshotted the UPI QR, sent it on WhatsApp, the human
   scanned and paid, then it confirmed with the order number. "Money goes straight from you to
   IndiGo, I never touch it." The QR lives about nine minutes. So the "Indulge card inside
   Instinct's account" idea from section 4 is replaced: the hands flow has a PAY step where the QR
   lands on the ticket thread, the hands page shows it large with payee and amount, and a person
   holding the Indulge UPI phone scans it. The card ceiling becomes the UPI account's balance and
   the caps in settings. (Instinct's "Link wallet, single-use card" is a preview and likely US
   only; we do not plan on it.)
3. **It asks before it acts, in rounds, and holds.** Emails come as drafts with "shoot?"; forms
   are "filled, not submitted"; a table hold lapses if the yes is slow ("still holding the 1:30
   slot, need a yes/no on the ₹2,000 cover before it lapses"). Two consequences: Elaya must answer
   brief-answerable questions fast (the L2 level exists for exactly this), and every unanswerable
   question must reach a genie with the clock showing.
4. **It also acts a beat early.** Once it sent an email seconds before the founder's "wait". That is
   the argument for L0 as the default on anything with money or a third party, and for a spend
   limit that lives outside the conversation.
5. **It takes standing rules and keeps them.** "Got it, going forward", "locked", "standing rule".
   Its memory is real across days. So the hands account gets a one-time rulebook (section 7,
   Layer D) that shapes its replies into a fixed frame, which makes Elaya's parsing far more
   reliable than reading free prose. Parsing still fails closed.
6. **It is honest and self-correcting, and it also guesses.** It posted three corrections to one
   morning drop unprompted, said "no evidence" when a claim did not hold, and warned about clone
   stores and scam WhatsApp numbers. It also pattern-guessed an email address and put an unverified
   line in an application. Treat every fact it gives as a claim until a screenshot or a reference
   number backs it.
7. **It reads whatever it is given.** In nine days the founder handed it a passport, an ID number,
   income, a home address and a UPI id, because that is how the product works for a person. Our
   disclosure filter (section 5) is not caution for its own sake; it is the only thing standing
   between a member's data and this behaviour.
8. **Speed:** most replies within a minute; a booking attempt five to twenty minutes; long jobs
   (a capsule, a report) thirty minutes to hours; one twenty-minute outage. The page must show
   waiting time and never assume silence means done.
9. **Two doors we did not know about.** Instinct-to-Instinct ("Trusted Network"): one Instinct
   coordinates with another person's Instinct within permissions. A member who uses Instinct could
   one day connect to Indulge's, which is a channel to design for later, not now. And Meta opened a
   Muse connector platform: businesses list as services Muse calls on (OpenTable, Duffel, Expedia,
   Instacart at launch; no luxury concierge yet). That is the reverse of this plan: not Elaya
   using Muse, but members' agents calling Indulge for what they cannot book online. Section 8.
10. **Where its work already overlaps ours.** Vendor shortlists with numbers and honest caveats,
    ticket and flight price checks with fees corrected, daily research drops, file pages. For the
    ticket flow we want only the DOING verbs it names itself: buy, book, fill, send, watch.

Categories this confirms for day one (Decide 1, revised): dining through booking pages, groceries
and small purchases delivered to an Indulge address, event tickets, domestic flights in the
Indulge name only when the passenger is staff, vendor enquiries by email. Not anything that needs
a phone call, and nothing in a member's name.

---

## 4. The new identity: "Indulge Concierge Desk"

One separate, person-shaped identity that Instinct knows, because Instinct serves one person on
one number:

- The hands phone number (personal WhatsApp, already onboarded on Instinct). Its WhatsApp profile
  is the identity Instinct sees: display name (**Decide 2**: for example "Indulge Concierge"), the
  mark as the photo, an about line.
- A Google Workspace mailbox on our domain, connected to Instinct once through its connect link.
  This is how Instinct emails vendors as the desk, in the desk's voice, with the desk's footer, and
  how it watches for replies. Nothing else on that account: no member mail, no founder mail.
- An Indulge UPI account on a phone the paying genie or finance holds, with a balance ceiling
  (**Decide 3**: I propose ₹50,000 a month, ₹10,000 a job). Instinct never gets its details; it only
  ever shows a QR that this phone scans. A bank account is not needed for Instinct at all.

What Serene stores about this identity: the number, the display name, the mailbox address, the
UPI ceiling and the two caps. No secret in the database.

---

## 5. Minimal disclosure: the one new rule

Every message that leaves the hands number is built by a filter, never typed free by a model.
The filter reads the ticket brief and the member twin and applies one table:

| Field | Sent | Note |
| --- | --- | --- |
| date, time, date_to, pax, duration | yes | the job itself |
| to_location, from_location, airport | yes | places, not people |
| budget_inr, budget_note | yes, as a ceiling line | "keep it under ₹X" |
| product_details, quantity, gift_specifications, event_name | yes | |
| delivery_address | only with the genie's tick on that job | the member's home is a member fact |
| delivery_contact | never the member's number; the hands number or the genie's | |
| preferred_vendor, notes | yes after a leak check | notes are free text; see below |
| member name, phone, email, company, health, facts, chat | never | Instinct books in the Indulge name |
| UPI details, any card | never in a message | payment is a QR that a human scans, section 7 Layer C |

Free text (notes, the genie's own words) passes the profiler's leak check: any member name, any
phone, any email in the outgoing text stops the send and shows the genie the line that leaked.
This is `openVault()` from `member-profiler.ts`, reused, not a new masker.

The genie always sees two panes before Approve: **what we will send** and **what we held back**.

**Decide 4.** May Instinct ever be given a member's first name for a table booking ("under
Riya")? I propose no; the booking is under Indulge and the genie tells the member which name to
give at the door.

---

## 6. The trust ladder (autonomy is a setting, not a prompt)

Four levels, set per ticket category in `/settings/hands`, kill switch `hands_enabled`:

| Level | Elaya may | A human must |
| --- | --- | --- |
| L0 Draft | write the opening message and every reply | approve each send |
| L1 Open | send the opening message on her own when the job is under the per-job cap | approve every reply after that |
| L2 Answer | answer Instinct's clarifying questions from the brief (date, time, pax) | approve anything about money, a change of plan, or a question the brief does not answer |
| L3 Confirm | say yes to a price within the ticket's budget and close the job | be told, and can stop it within a grace window (**Decide 5**: 2 minutes) |

Everything starts at L0. A category moves up only when the ledger shows a clean run (**Decide 6**:
I propose 20 completed jobs, zero failed, over 30 days). Every level is one row in settings, read
per turn like every other switch. Two more caps: `hands_daily_spend_cap_inr` and
`hands_monthly_spend_cap_inr`; above either, every send goes back to L0 until a founder resets.

---

## 7. The build, layer by layer

### Layer A: the hands connector (a second Baileys number)

- `connector/` is split into `connector-core/` (queue, raw insert, normaliser, media worker,
  session) and two thin apps: `connector-watcher/` (today's code, read-only, unchanged
  behaviour) and `connector-hands/` (the new one). The watcher's own source keeps no send call.
- `connector-hands/` links the hands phone, writes every inbound into a new schema `hands`
  (`hands.threads`, `hands.messages`, raw first, idempotent, the same contracts as `wag_`), and
  exposes one job: send a text to a jid that is on the allowlist (`hands.allowed_contacts`,
  seeded with Instinct's number; a jid not on the list is refused and logged). Sends are pulled
  from a queue table (`hands.outbox`, append-only: requested, sent, failed, with who asked), never
  pushed over an HTTP door into the connector. The connector is the only process that holds the
  session; Serene only writes rows.
- Runs on Fargate next to the watcher, its own task, its own auth volume. Kill = stop the task.

### Layer B: Instinct as a vendor

- One new column on `vendors`: `kind` (`human` | `agent`). One new vocabulary entry in
  `constants/vendors.ts` (`VENDOR_KINDS`) and a CHECK. The ranker gains one line: an `agent`
  vendor is ranked like any other, plus a company-level boost `HANDS_AGENT_BOOST` when the
  category is on Instinct's list and the trust level for it is above L0. No per-teammate sticky
  note needed; the founder's preference is company policy.
- Instinct's row: name, kind agent, contact = the hands-facing number, capabilities = Decide 1,
  source manual, status active. The extractor never touches it.
- Every job is a `vendor_engagements` row through `setTicketVendorCore` (provenance
  `ticket:<no>`), closed through `closeTicketEngagement` with the outcome the ticket ends in, then
  the existing review form. Nothing new on the ledger.

### Layer C: the thread on the ticket

- A ticket whose vendor is an `agent` vendor owns one `hands.threads` row (ticket_id, vendor_id,
  jid, opened_by, status open | closed).
- Each inbound message on that thread becomes a ticket event `hands_message` (new event kind in
  `constants/tickets.ts`, through `apply_ticket_change`, so the timeline shows it in order with
  notes and moves). Each outbound is a `hands_sent` event with the exact text and the disclosure
  summary ("held back: name, phone").
- **The PAY step.** When Instinct sends a QR image (its way of taking a payment), the thread
  marks the message `payment_request` with payee and amount read from Instinct's own line ("scan
  with gpay, ₹6,813"). The hands page shows the QR large with payee, amount, the ticket's budget and
  a countdown (Instinct's QRs live about nine minutes). The person holding the Indulge UPI phone
  scans it and taps "Paid ₹X", which writes a `hands_payment` event (amount, payee, who paid, the
  QR message id) and queues "paid" to Instinct. An amount above the per-job cap, or a payee that
  does not match the job, shows red and cannot be marked paid by a genie; a bishop or founder must.
  Every rupee that ever leaves through hands is one of these rows.
- The sentinel already reads new text on a ticket; a reply from Instinct is new text, so the
  existing wake reads it. No second reader.

### Layer D: Elaya's hands tools

| Tool | Tier | Roles | What it does |
| --- | --- | --- | --- |
| `draft_hands_message` | read | all staff | builds the message from the brief through the disclosure filter; returns text + held-back list; sends nothing |
| `send_hands_message` | propose (L0/L1) or inline (L2/L3, within the rules) | all staff with vendor access | queues one outbox row for the ticket's thread; the resolver executes on Approve |
| `get_hands_thread` | read | all staff | the thread as labelled rows, newest last |
| `list_hands_jobs` | read | all staff | open threads in the seat's queendom, with age and last line |

**The rulebook, taught once.** On day one a human sends Instinct its standing rules from the hands
phone, and Instinct keeps them (section 3a, point 5). Draft:

> You work for the Indulge Concierge Desk. Bookings, orders and enquiries are always in the name
> Indulge Concierge, never another person. Never spend without a yes from me on the exact amount.
> Always give the full total before asking. Prefer pay-at-venue over prepaid when both exist.
> Reply in short pointers. Start every reply with one word: DONE (with the reference number and a
> screenshot), NEED (one question at a time, with the deadline if something is on hold), OPTIONS
> (numbered), FAILED (why, and the best alternative), or WAITING (what you are waiting for and
> when you will check). Never contact a phone number I did not give you. Never ask me for an
> identity document.

Elaya's reader keys on the first word and fails closed to NEED-a-human on anything else. The
rulebook lives in `constants/hands.ts` so the Talk tab can re-send it after a memory drift.

Every tool re-reads the ticket's queendom through `canAccessMember`, as the ticket tools do. A
queen sees only her queendom's jobs; the boundary from the concierge audit holds.

### Layer E: the page, `/hands`

One page, working name **Hands** (**Decide 7**: the name the team sees; "Desk" and "Concierge
line" are the other candidates). Concierge domain plus admin/founder, in the nav after Vendors.

- `SplitWorkspace`: the rail lists live jobs (`ConversationRailRow`: member's code, category,
  vendor, age, last line, unread dot); the pane shows the thread as real bubbles (the
  `SiaMessageBubble` rows, ours on the right), the ticket brief card on the side, the disclosure
  card ("what we told them", "what we held back"), the money card, and Elaya's proposal card
  (Approve / Dismiss) when she has a next line ready.
- A composer at the bottom: the genie can type to Instinct directly; the same leak check runs on
  what they type. A "Let Elaya answer" button asks her for the next line without sending it.
- A second tab, **Talk**: a free thread with Instinct not tied to a ticket (asking what it can do,
  testing a category). Same allowlist, same log, no member data available to the drafter here.
- A **Report** strip: jobs this month, completed %, median minutes to confirmation, ₹ spent
  against the caps, human interventions per job. The same numbers feed the vendor score.

### Layer F: settings and the brief

- `/settings/hands`: the trust level per category, the two spend caps, the kill switch, the
  allowlist, the identity's display name and card last-four. Admin/founder.
- The morning brief gains one line under Going well or Needs you today when hands did anything:
  "Hands: 6 jobs, 5 done, 1 waiting on you (Ottimo, 40 min)".

---

## 8. Muse, the next agent, and the reverse door

Nothing in layers A to F says Instinct except one vendor row and one allowlist entry. Meta's Muse
(or any agent that answers on WhatsApp) is a second `agent` vendor with its own number, its own
categories, its own trust levels. The ranker puts them side by side and the ledger decides which
wins a category. If an agent ships a real API, Layer A gets a second transport for that vendor and
nothing above it changes.

Two doors the founder's chat surfaced, both for later:

- **Indulge as a connector FOR Muse.** Meta's connector platform lets a business list as a service
  Muse calls on. Members' children will have Muse; Muse books what is online; the slot for "what is
  not bookable online" is empty. That is inbound demand into the ticket machine (a Muse request
  becomes an intake card), the mirror image of this plan. Worth a separate plan once hands is live,
  and worth deciding whether a consumer Meta surface is on brand at all.
- **Instinct's Trusted Network.** A member's own Instinct could talk to Indulge's. Same idea, same
  caution, and Instinct's rules say nothing crosses without both sides' permission.

The step after that is our own hands: a browser agent on our infrastructure, driven by Elaya, for
the jobs no outside agent should see. It plugs into the same thread, ledger and page as one more
`agent` vendor. That is the future-proof part: the page, the ladder and the ledger are about
"Elaya sends work out and gets it back", not about Instinct.

---

## 9. Order of work and what each step proves

| Step | Days | Proves |
| --- | --- | --- |
| 0. Manual pilot: DONE by the founder (nine days, section 3a). Remaining: the hands number is set up with Instinct, the mailbox is connected, the rulebook is sent, one genie runs three real jobs by hand through it | 0 build, 2 calendar | the rulebook holds, the reply frame is followed, the QR pay flow works from the Indulge UPI phone |
| 1. Layer A + C: hands connector, `hands` schema, thread on the ticket, timeline events | 3 | replies land on the right ticket, nothing lost, kill switch works |
| 2. Layer B + E (read + manual send): Instinct in the vendor book, `/hands` with the thread and a composer behind the leak check | 3 | a genie runs a whole job from Serene; the ledger closes it |
| 3. Layer D + disclosure: Elaya drafts, the two-pane preview, Approve sends | 3 | the drafter never leaks; genies approve more than they edit |
| 4. Layer F + ladder: settings, caps, L1 to L3 per category, the report strip, the brief line | 2 | autonomy is a switch we can turn both ways |
| 5. Second agent (Muse or the next) | 1 | the shape holds with no code change beyond a vendor row |

Step 0 costs nothing and answers the two questions no plan can: does Instinct accept our number,
and is it good. If the answer to either is no, we still have layers A, C, E as the foundation for
our own hands.

---

## 10. Risks, said plainly

- **Terms and bans.** Instinct may forbid automated use; WhatsApp may flag a number that sends
  structured messages. The hands number is the only thing at risk; the watcher is a different
  number on a different process. We start slow (a handful a day) and send only human-looking
  text.
- **No reply contract.** Instinct replies in prose. Every parse fails closed to "a human reads
  this"; Elaya proposes, she never assumes a booking happened until the text says so and the genie
  agrees.
- **Money.** The UPI phone's balance and the two caps are the real limit, not the prompt; a QR is
  only ever scanned by a person. A refund is a human job on the merchant's side.
- **Data at Instinct.** Whatever we send, they keep. That is why the disclosure table is short
  and why member identity never crosses.
- **The 14-day rule.** A personal WhatsApp unlinks if the phone is offline two weeks. Same
  runbook as the watcher.
- **Reputation.** If a job goes wrong the member hears it from the genie, in Indulge's voice,
  with a fix. Never "the AI made a mistake".

---

## 11. Decisions in one list

1. Categories on day one.
2. The identity's name and email.
3. The Indulge UPI account's monthly ceiling, the per-job cap, and who holds the paying phone.
4. Whether a member's first name may ever be given for a booking (I say no).
5. The L3 grace window.
6. The clean-run rule for moving a category up a level.
7. The page's name.
8. Who may approve above the per-job cap: the genie, or the bishop and queen only.
