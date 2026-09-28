# Serene, in Plain English

> **Purpose:** explain what Serene is to someone who does not write software: a board member, an investor, a new hire on the business side.
> **Audience:** non-technical. A fifteen-minute read. No jargon; every term is explained where it first appears.
> **Source-of-truth scope:** a plain summary only. Each claim here is backed by a module doc listed in `README.md`.
> **Last verified:** 26 September 2026.

---

## What Serene is

Serene is the software Indulge built for itself: the company's own operating system. Every
member of the team starts the day by logging into one place, and everything they need lives
inside it: the sales pipeline, the member relationships after the sale, conversations, tasks,
suppliers, performance numbers, and an AI assistant who knows the business.

Think of how a great hotel runs its front office: one desk, one ledger, one view of every
guest, instead of a drawer of disconnected notebooks. Before Serene, that drawer was real:
spreadsheets, chat threads, a separate helpdesk tool, and people's memory. Serene replaces it
piece by piece.

It is built like a building with named floors:

- **Serene** is the building itself: the login, the look and feel, the navigation.
- **Gia** is the sales floor. It manages every prospective member from first contact to closed
  deal. *Live and used daily.*
- **Sia** is the concierge floor, where members live after they join: their WhatsApp groups
  with the team, their records, their requests, and the suppliers who fulfil them. *Live, and
  running alongside the older helpdesk tool while the team moves over.*
- **Elaya** is the assistant who walks every floor. She answers questions about the business,
  takes routine actions on a person's behalf, and briefs the founders twice a day. *Live, in
  the app and over WhatsApp.*

Adding a new floor never requires rebuilding the building. That is the central architectural
promise, and it has held through two big additions since the summer.

## The journey of one lead (the sales floor)

Follow one person, call her Priya, from advertisement to deal:

1. **Priya taps an Indulge ad** on Instagram and submits her details, or enquires about a
   product in the Indulge app.
2. **Seconds later she exists in Serene.** Her details arrive automatically, are checked and
   cleaned, and a permanent record is created. If she has enquired before, the system knows:
   one phone number never becomes two records.
3. **She is assigned to a salesperson automatically.** It works like a fair taxi rank: the agent
   who has waited longest gets the next lead. Nobody cherry-picks; nobody is overloaded. Agents
   on holiday are skipped with one switch.
4. **The agent's phone buzzes on WhatsApp**: "New lead: Priya, here's her number." The same
   alert can arrive as a notification on their phone or computer. (The founders used to get a
   copy of every one; at their request that is paused for now.)
5. **The agent calls Priya, then logs the call in Serene**: what happened, what was promised,
   what's next. Every call, note and status change is recorded permanently, so anyone who picks
   up the relationship later sees the full story.
6. **Serene watches the clock.** If a new lead is not called within 15 minutes, the agent is
   nudged; if it slips further, the manager is alerted. This is the "no lead falls through the
   cracks" promise, enforced by software rather than by hope.
7. **Priya says yes.** The agent records the deal, what she bought and for how much, and she
   moves into the deals ledger.
8. **Everyone sees what they should, live.** Agents see their own pipeline, managers their
   team's, founders everything, across every line of business: Onboarding, the House, the
   Shop and Legacy, each kept separate.

## The journey of one member request (the concierge floor)

Now follow a member, call him Arjun, after he has joined:

1. **Arjun writes in his WhatsApp group with the concierge team**: "Can you get us a table for
   four at a good place in Goa on Saturday?"
2. **Serene keeps a copy of every message** in its own archive. It listens only; it never
   speaks in the group.
3. **Within a minute, Serene reads the conversation** and, if it is a real request and not just
   "thanks", proposes a ticket for Arjun's team, already filled in. A person decides whether to
   create it. Nothing is created without a human.
4. **The ticket has a deadline.** A small watcher keeps an eye on it, nudges the team when it
   slips, and suggests the next step for a person to approve.
5. **If a supplier is needed, Serene suggests the best ones**, ranked from thousands of past
   jobs, with the reasons. The job is recorded against that supplier, and when the ticket
   closes the team rates how it went, so the ranking keeps learning.
6. **Arjun's record fills itself in.** Serene files what it learns from his chats (preferences,
   the names of his family, occasions coming up) into his member record, keeps an eye on his
   mood, and once a week gives its own judgement of how the relationship is going.
7. **The founders get a short brief twice a day**: which members are waiting on a reply, what
   went wrong, what went well, team by team.

To be honest about where this stands: the concierge team still does most of its ticket work in
Freshdesk, the helpdesk tool it used before Serene. Serene keeps a live read-only copy of
Freshdesk, and runs its own tickets alongside it, so the move can happen without losing
anything.

## What the team sees on screen

**On the sales floor:**

- **Dashboard**: the morning view: today's tasks, fresh leads, how the pipeline is moving.
- **Leads**: every prospect, searchable, with a full history behind every name.
- **Deals**: the ledger of closed business.
- **WhatsApp**: a shared inbox for the company WhatsApp number.
- **Campaigns** and **Budget**: which adverts produce leads and wins, and what they cost.
- **Performance**: scoreboards for each agent, each team, and each line of business.

**On the concierge floor:**

- **Members**: every member, with a record of what the team knows about them, who they are
  close to, what is coming up, their recent requests, and (for the right people) their account
  with Indulge.
- **Sia**: a read-only window onto every member WhatsApp group.
- **Tickets**: member requests, with deadlines, a board view, and Serene's suggestions.
- **Freshdesk**: the live copy of the older helpdesk.
- **Vendors**: the supplier book, and a "find a vendor" search that reads a request in plain
  words.

**For everyone:** Tasks, personal Notes, and Elaya. **For managers and founders:** Oversight (a
live view of what every team is working on), Books (the company's accounts, read live from
Zoho), Subscriptions (the company's recurring tools and bills), and the Team page for creating
accounts and seats.

## How the concierge floor is organised

The concierge team is split into **queendoms**: small teams, each looking after its own group of
members. Each queendom has a **queen** who leads it, **bishops** who oversee and approve,
**genies** who handle the members' requests, and a **joker** whose job is finding ways to
delight the members. One **Joker head** works across every queendom. Serene
knows each person's seat, so a concierge sees the members, groups and tickets of their own
queendom and nobody else's.

## Elaya, the assistant

- The team can ask her anything about their work in plain language, in the app or over
  WhatsApp, in English or Hinglish, by typing or speaking.
- She can act: log a note, create or update a task, set a reminder that repeats. For bigger
  steps (changing a lead's status, reassigning, recording a deal) she proposes, and a person
  confirms in one reply before anything happens. Every action is recorded.
- She remembers how each person likes to work, and the team can flag when she gets something
  wrong so it gets fixed.
- The founders can ask her questions no single screen answers ("which members have been
  unhappy this month, and why?"). She can read thousands of conversations in the background to
  answer, and says what it cost.
- People can connect their own Claude or ChatGPT to Serene. Those apps see exactly what that
  person could see in Serene, and no more.
- For now she is switched on for the sales teams, the concierge floor, the founders and the tech
  team. Finance, marketing and the business team come later, once she has the right tools and
  data for them.

## Trust and safety, in plain words

- **People see only what their role allows.** An agent sees their own leads, a manager their
  team's, a concierge their own queendom's members, founders everything. This is enforced in
  the database itself, not just hidden in the screens.
- **Nobody can promote themselves.** Roles and seats are set by administrators, and a person
  cannot change their own seat or team.
- **History cannot be quietly rewritten.** Calls, notes, ticket events and supplier jobs are
  append-only: new entries can be added, but the record of what happened cannot be edited away.
- **Private details are handled with care.** Before chat text goes to an AI model, names and
  phone numbers are swapped for code names. The one deliberate exception, approved by the
  founders, is supplier bills, which the AI reads as images to keep the supplier book current.
  Member card and ID details are stored encrypted; opening one asks why and records who looked.
- **The look matches the brand.** Serene was designed like a luxury product, calm and
  uncluttered, in eight colour themes with a dark mode, because the team lives in it eight to
  twelve hours a day.

## What's live, what's next

**Live and in daily use:** the sales floor end to end; the concierge floor's WhatsApp archive,
member records, supplier book and read-only Freshdesk copy; Serene's own tickets running
alongside; Elaya in the app, on WhatsApp and in outside AI apps; the founders' twice-daily
brief; the company accounts from Zoho; subscriptions and bills; a phone view for founders and
managers; push notifications; voice dictation.

**Being built now:**

- Moving the concierge floor's ticket work from Freshdesk into Serene.
- Giving Elaya "hands": her own WhatsApp number and the ability to work with outside services
  on the team's behalf.

**Planned next:** linking a closed deal on the sales floor straight to the new member's record
on the concierge floor, so the relationship continues in one place from the first advert to the
hundredth request.

The honest summary for an outsider: the company's sales operation and, increasingly, its
concierge operation run on software the company owns outright, built to luxury-brand standards,
with a discipline about privacy and record-keeping most internal tools never have. An AI
assistant that can answer, act and brief the founders is live on top of it.
