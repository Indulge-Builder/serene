# Members: Page Spec

> **Purpose:** spec for `/members` (the member list), `/members/[id]` (the member page, every card) and `/members/[id]/finance` (the member's money), plus the New / Edit member form.
> **Audience:** engineers and designers working on the concierge side.
> **Source-of-truth scope:** the three routes under `src/app/(dashboard)/members/`, `src/components/members/`, `src/lib/actions/members.ts`, the reads in `members-service.ts`. What the data means (the stores, the profiler, health, the judgement, the vault, access) lives in [../modules/members.md](../modules/members.md); Zoho in [../integrations/zoho-books.md](../integrations/zoho-books.md).
> **Last verified:** 2026-09-26 against the three pages and their `loading.tsx`, every component in `src/components/members/`, `src/lib/actions/members.ts`, `src/lib/actions/books.ts`, `src/lib/services/members-service.ts`, `src/lib/elaya/access.ts`, `src/lib/constants/route-permissions.ts`, `src/lib/constants/sia-roles.ts`, `src/lib/constants/member-assessment.ts`.

## 1. Purpose

The concierge team's record of each member. The list answers "who are we serving, and who needs
attention", ordered by who is most active. The member page answers "everything we know about
this member": identity and team, health and Serene's judgement, what they like, who is around
them, what they asked for, their WhatsApp group, their cards and documents, and what is coming
up. The finance page shows their membership money and their live Zoho ledger.

Facts come in through one Observation box and from machines (the chat profiler, imports).
Nobody fills a form of preferences.

`/clients` and `/clients/*` redirect here permanently (renamed 2026-09-17).

## 2. Who sees it

| Viewer | List and member page | Finance page | Vault |
| --- | --- | --- | --- |
| admin, founder | every member; Queendom filter; can pick or change a member's queendom; can link and unlink the WhatsApp group | yes | list, add, open, remove |
| the Joker head (one company-wide concierge seat, 0244) | every member who belongs to a queendom; Queendom filter; must pick a queendom for a new member; can move a member between queendoms | no. Redirected to the member page; the page shows no amount, no Money card, no "See finance" | list only |
| a seated queen, bishop, genie or joker | the members of their own queendom | yes | list, add, open |
| an unseated concierge account | nothing (the list is empty, a member page is a 404) | n/a | n/a |
| the tech workbench (non-admin) | reaches the page; RLS shows no rows | n/a | n/a |
| guest | a guest holds no seat (seats map to manager or agent), so sees no members even where the domain reaches the page | no | n/a |

- **Route reach:** `/members` is in the concierge domain's route map (`route-permissions.ts`);
  admin and founder bypass the map. Each page calls `canAccessRoute(profile, '/members')`.
- **Rows:** the pages read on the session client, so RLS (`member_visible` →
  `can_access_member_queendom`) decides which members exist for the viewer. A member outside the
  viewer's reach reads as missing (`notFound()`).
- **Writes:** every action re-checks with `canAccessMember` (the TS twin of the SQL gate).
- **Money:** `canSeeMemberFinance` (false for guests and the Joker head). The member page strips
  money on the server with `withoutMemberMoney()` before rendering for a viewer it refuses.
- **Vault:** `canUseMemberVault` (false for the Joker head) for add and open; remove is admin and
  founder only.
- The full access model: [../modules/members.md § Access](../modules/members.md#access).

## 3. Data sources

| Layer | Items |
| --- | --- |
| Reads (session client) | `listMembers(filters)` over the `member.members_list` view (0241); `getMemberDetail(id)` (the dossier: spine, queendom, team, people, current facts collapsed across sources, health, mirrored Freshdesk tickets, the Sia group, 100 timeline events, 100 relations, the snapshot, open coming-up items); `getQueendoms()`; `searchMembersForPicker()` |
| Reads (admin client, after RLS let the member through) | `listVaultItems(memberId)` (never the secret) |
| Live reads | `getMemberFinance(zohoCustomerId)` on the finance page (Zoho, 1-minute Redis copy) |
| Actions (`actions/members.ts`) | `createMemberAction`, `updateMemberAction`, `addMemberFactAction` (the in-place correction), `addMemberObservationAction`, `addMemberPersonAction` / `updateMemberPersonAction` / `deleteMemberPersonAction`, `linkMemberGroupAction` / `unlinkMemberGroupAction`, `adjustMemberHealthAction`, `addMemberVaultItemAction` / `revealMemberVaultItemAction` / `deleteMemberVaultItemAction`, `assessMemberNowAction`, `searchMembersAction` |
| Other actions | `getSiaGroupsAction` (the group picker, `actions/sia.ts`), `refreshMemberFinanceAction` (`actions/books.ts`) |
| Access log | `logMemberAccess(id, viewer, surface)` on every open, surface `members_page` or `finance_page` |
| Constants | `CLIENTS_PATH` (= `/members`), `CLIENTS_LIST_PAGE_SIZE` (50), `memberFinancePath()`, `siaGroupHref()` in `sia-roles.ts`; `MEMBER_SORTS` in `member-assessment.ts`; facets and tiers in `member-facets.ts` |

Every action: Zod (`parseActionInput`) → `requireProfile()` → `canAccessMember` for this member
→ the core in `member-mutations.ts` / `member-vault.ts` → `revalidatePath` → `{ data, error }`.
No Redis cache on these pages; the session reads are live.

## 4. Components

All in `src/components/members/`.

| Component | Where | What it is |
| --- | --- | --- |
| `AddMemberButton` | list header | the primary CTA ("New member"), opens `MemberFormModal` |
| `MembersFilters` | list filter strip | `FilterBar` + `useUrlFilters` |
| `MembersTable`, `MembersTableSkeleton` | list | the dense table (desktop) and card stack (below `md`) |
| `HealthPill` | list, Health card | THE health score pill |
| `MemberFormModal` | list and member page | THE New / Edit member form |
| `MemberIdentityCard` | member page | who, membership, queendom and team, the four system links, Edit |
| `MemberHealthCard` | member page | the health score, its reasons, "Adjust by hand" |
| `MemberWhatsAppCard` | member page | the linked group, link / unlink |
| `MemberAssessmentCard` | member page | "Why the health score is what it is": Serene's judgement and the pulse |
| `MemberObservationCard` | member page | the one box, and past observations |
| `MemberFactsCard` | member page, twice | Essentials and Preferences |
| `MemberRequestsCard` | member page | the mirrored Freshdesk tickets |
| `MemberActivityCard` | member page | the timeline |
| `MemberPeopleCard` | member page | the people under the membership |
| `MemberVaultCard` | member page | "Cards & documents" |
| `MemberSidebarCards` | member page | `MemberAppCard`, `MemberMoneyCard`, `MemberRelationsCard`, `MemberAnticipationsCard` ("Coming up"), `MemberNarrativeCard` ("In a few words") |
| `MemberFinanceView` | finance page | the membership tiles and money movements |
| `MemberZohoCards`, `MemberZohoSkeleton`, `RefreshMemberFinanceButton` | finance page | the live Zoho part ([../integrations/zoho-books.md](../integrations/zoho-books.md)) |

Shared primitives used: `CardHeader`, `InfoRow`, `RevealId` (ids from other systems), `EditableValueText`
and friends from `ui/InlineEdit` (the fact correction), `DictationButton`, `ConfirmDialog`,
`EmptyState`, `StatTile`, `Pagination`, `DatePicker`, `FormSelect`, `Modal`.

## 5. States

- **Loading:** `members/loading.tsx` (header, filter strip, table skeleton); the list's own
  Suspense boundary is keyed on the filters, so each filter change shows the table skeleton.
  `members/[id]/loading.tsx` is shaped like the dossier (so opening a member never paints the list
  skeleton). `members/[id]/finance/loading.tsx` holds the tiles and first cards; `MemberZohoSkeleton`
  holds the Zoho part while it streams.
- **Empty list:** a framed `EmptyState` with the Members icon: "No members yet." or, with filters,
  "Nobody matches these filters."
- **Missing member or out of reach:** `notFound()`.
- **Card empties:** every card has an inline empty state that says what will fill it ("No signals
  yet.", "Not judged yet.", "No group linked.", "Nothing observed yet.", "No requests on record.",
  "The timeline is empty.", and so on).
- **Errors:** actions return `{ error }` and the cards show it in a toast; the Observation box keeps
  the draft and shows the error under the field. The finance page's Zoho part says "Zoho did not
  answer." with a Refresh, or "Zoho Books is not connected."

## 6. Invariants

See Deep dive § 8.6.

## 7. Open items

- **Identity facts have no card.** Birthday, anniversary, company, city, email and the rest of the
  `identity` facet are stored (2,683 seeded, plus the New member form's email and city) and Elaya
  reads them, but neither Essentials nor Preferences shows that facet.
- **The Health filter only filters the current page.** Health is computed per page after the
  database returns 50 rows, so "Needs care" on page 1 shows the matches among those 50 and the
  pager still counts every member.
- **The "Health" sort** orders by Serene's last judgement score (`assessment_score`), not by the live
  health number the pill shows. They differ by the signals since the judgement.
- **Requests shows Freshdesk only.** Serene's own tickets are not on the member page yet (the card's
  comment still says "Sia tickets join here in T1").
- **Stale copy:** the Money card says "Wallet, invoices and payments read live from Zoho arrive in
  M2" and the finance page's header comment says the same, but the live Zoho ledger has been on the
  finance page since 2026-09-15.
- **WhatsApp link rights differ by door.** The member page shows Link / Unlink to admin and founder
  only, but `linkMemberGroupAction` accepts anyone who can see the member, and it does not check
  the group. The card's empty text says "A bishop or admin links the group from Sia", while the Sia
  panel's mapping action is admin and founder only.
- **"Adjust by hand"** on the Health card is open to anyone who can see the member (the component
  comment says "a bishop or queen").
- The App card waits for the member app feed; "In a few words" waits for a narrative writer;
  "Coming up" items cannot be marked done. See [../modules/members.md § Not built](../modules/members.md#not-built).

---

## 8. Deep dive

### 8.1 `/members`, the list

Standard list layout: title row (`Members.` with the blinking dot, `AddMemberButton` on the right),
the paper filter strip, then the table in Suspense.

**Filters** (`MembersFilters`, all in the URL, immediate commit, `page` reset on change):

| Filter | Param | Values |
| --- | --- | --- |
| Search | `search` | name or phone, `ilike` |
| Queendom | `queendom` | shown only when the viewer is offered more than one queendom (admin, founder, the Joker head) |
| Tier | `tier` | premium, celebrity, genie, standard, monthly_trial |
| Status | `status` | Active, Expired, Trial |
| Health | `health` | low "Needs care (under 50)", mid "Steady (50 to 74)", high "Happy (75 and up)" |
| Not linked | `unlinked` | whatsapp "No WhatsApp group" (reads the `wa_group_jid` mirror, never the invite link), freshdesk, zoho, app, queendom "No queendom" (such a member is seen by admin and founder only, so nobody serves them) |
| Sort | `sort` | `active` "Most active" (default, left out of the URL), `score` "Health", `name` "Name" |

**Order.** Most active = Active members first, then `activity_score` (the pulse, highest first),
then name. Health = the judgement score, then Active first, then name. Name = alphabetical.

**Columns** (desktop): Member (avatar, name, phone), Queendom, Tier, Status (Expired rows are
dimmed), Health (the pill; when judged, a tooltip with the risk and the verdict), Open (open
requests across Freshdesk and Serene tickets, from the pulse), Last contact (message or ticket,
from the pulse), Renews (membership end), Linked (four icons for WhatsApp group, Freshdesk contact,
Zoho customer, app account, each with a tooltip). Below `md` each member is a card: avatar, name,
queendom and tier, status, health, open count, last contact.

A row or card opens the member with `?from=<this view>`, so Back returns to the same filters and
page. Rows prefetch on hover. 50 per page, `Pagination` below the table.

### 8.2 `/members/[id]`, the member page

Order on the page:

1. Back button ("Back to Members", to `?from=` when it starts with `/members`) and the member's
   name as the title.
2. A dossier grid row: **Member** (identity) on one side, **Health** and **WhatsApp** stacked on the
   other.
3. **Why the health score is what it is** (Serene's judgement), full width.
4. **Observation**, full width.
5. **Essentials** and **Preferences**, side by side.
6. **Requests**, then **Activity**.
7. A grid of smaller cards: **People**, **Cards & documents**, **App**, **Money** (hidden when the
   viewer cannot see money), **Relationships**, **Coming up**, **In a few words**.

Every open writes `member_access_log` (`members_page`).

**Member (identity) card.** Avatar, name, status pill, tier, "identity verified" when the group
mapping confirmed the phone. Rows: WhatsApp number (copyable), other numbers, Queendom, Team (the
queen, every bishop by name ("Bishops A and B"), the joker, and the count of genies, from the
active profiles seated in that queendom), membership dates, Amount (money viewers only). Then the
links: WhatsApp group (opens the chat in Sia via `siaGroupHref`; "Invite link saved, group not
matched" when only the old invite URL exists), Freshdesk ("See tickets" → `/freshdesk?member=<id>`),
Zoho customer ("See finance", money viewers only), App member ("Linked"). Each foreign id sits
behind `RevealId`. Edit opens `MemberFormModal` for anyone who can see the member.

**Health card.** The score pill, the change over 30 days, "Serene's judgement, N on <date>: <verdict>"
when there is one, and the top three reasons (the signals since the judgement, else the strongest).
"Adjust by hand": a delta from -20 to +20 and a required note, written as a `manual_adjust` event.
How the number is computed: [../modules/members.md § Health](../modules/members.md#health).

**WhatsApp card.** The linked group (subject linking into Sia), message count, last message, member
count. Admin and founder see Link a group (a search over the Sia groups they can see, member and
unmapped kinds only, never internal or vendor groups) or Unlink. Linking moves the group to this
member; the `wa_group_jid` mirror updates by trigger.

**Why the health score is what it is.** The judgement from 0241: the risk chip (Settled, Watch, At
risk), when it was judged and on how much record (conversations, requests, facts) with a confidence,
the one-line verdict, Engagement / Satisfaction / Value to us out of 100, and three lists: Going
well, Concerns, Do next. Under it the pulse line: activity score, last contact, messages from them
and from us in 30 days, requests in 90 days (open, escalated), when it was counted. "Assess now" /
"Assess again" queues a fresh judgement (about a minute); the button then becomes Refresh.

**Observation card.** One text box ("Write your observation on the member in free form"), dictation
through `DictationButton`, Save (or ⌘↵), 3 to 2,000 characters. After saving it shows "Understood and
filed" with the facts as chips (or "Saved as a note"), and a hint to double-click a wrong value on
its card. Below, the last 20 observations with who wrote them and when. The draft is never cleared
on error.

**Essentials and Preferences.** One `MemberFactsCard` component, two mounts. Essentials shows the
address, family, dietary and contact-rule facets; Preferences shows preference, interest, travel,
occasion and budget signal. One section per facet, a label → value list, the source and date beside
each value and the full provenance (every source that agrees) in its tooltip; "avoids" is a small
danger pill. **Double-click a value to correct it** in place (Enter or leaving the field saves, Esc
cancels, the draft stays on error): the correction is a new fact that supersedes the old one and its
duplicates. There is no Add button; new facts come through Observation.

**Requests.** The member's mirrored Freshdesk tickets: open first, then the 12 most recent, each with
its number, category, agent, date, resolution and escalation, and a status pill; the header counts
open and all-time. Each opens the Freshdesk ticket page.

**Activity.** The timeline, newest first (up to 100): the profiler's one line per conversation with
its tone, Serene's judgements, and any other event kinds as they gain writers.

**People.** The humans under the membership (primary, spouse, partner, child, parent, sibling,
staff, other) with phone and note; add inline, remove with the ×. People the profiler found are
added with `can_request = false`.

**Cards & documents** (the vault). Each item shows its kind, label, "ending 1234", expiry month and
"from Freshdesk" when imported. Open asks "why" (at least 3 characters, kept on record) and shows the
secret for 60 seconds with a copy button; Add takes a kind, label, the secret and a card's expiry
month; Remove (admin and founder) asks for a reason behind a `ConfirmDialog`. The Joker head sees
the list only.

**App.** The member app's events when the account is linked; today it says "Linked, nothing received
yet" because the feed is not built.

**Money.** Membership amount and type, the term, "See finance" behind the Zoho id, and money events
if any.

**Relationships.** Up to 20 relations: relation, entity kind, label, strength as a percentage.

**Coming up.** Open anticipations (occasions, trips, follow-ups the profiler found), with the due date
and suggested action.

**In a few words.** The snapshot's narrative. Nothing writes it yet, so it reads "Not written yet."

### 8.3 `/members/[id]/finance`

Reached from "See finance" on the identity card or the Money card. Redirects to the member page when
`canSeeMemberFinance` refuses; 404 when RLS hides the member. Every open writes `member_access_log`
(`finance_page`).

- **What Serene holds** (`MemberFinanceView`): tiles for Membership amount and type, Status ("renewal
  due" when Expired), Started, Ends (days left or ago, warning ink under 30 days), Movements (count of
  money events). A "Zoho: Not linked" card when there is no customer id, pointing back to the member
  page's Edit. "Money movements": the payment, invoice and renewal events (empty today).
- **What Zoho holds** (`MemberZohoCards`, streamed in when there is a customer id): Outstanding,
  Invoiced, Paid, Unused credits; the Zoho customer record; invoices, payments and credit notes; a
  Refresh that drops the one-minute cache. Details: [../integrations/zoho-books.md § The member finance page's Zoho cards](../integrations/zoho-books.md#the-member-finance-pages-zoho-cards).

### 8.4 The New / Edit member form (`MemberFormModal`)

One component, two modes. Create from the list's "New member"; edit from the identity card's Edit.

| Field | Create | Edit | Notes |
| --- | --- | --- | --- |
| Name | required | yes | up to 120 characters |
| WhatsApp number | yes | yes | normalised to E.164; refused if it belongs to another member |
| Queendom | shown to admin, founder and the Joker head | same | a seated teammate's new member lands in their own queendom; the Joker head must choose one ("Choose the queendom this member belongs to.") |
| Tier, Status | yes | yes | tier also sets `membership_type` |
| Membership start, end | yes | yes | `DatePicker` |
| Amount (INR) | money viewers only | money viewers only | left out of the save for the Joker head, so an edit never blanks it |
| Email, City | create only | no | saved as identity facts, not spine columns |
| Freshdesk contact id, Zoho customer id, App member id, WhatsApp invite link | no | yes | the join keys |

A create writes `sources = ['manual']`. The form's whole-form error renders through the modal's
`error` slot; fields are never cleared on error.

### 8.5 Related surfaces

- The Sia group panel links a group to a member from the other side: [sia.md](sia.md).
- A ticket's help window opens the member dossier and logs `ticket_help`: [tickets.md](tickets.md).
- `/freshdesk?member=<id>` scopes the Freshdesk list to one member: [../integrations/freshdesk.md](../integrations/freshdesk.md).
- Elaya answers member questions from the same dossier: [../modules/elaya.md](../modules/elaya.md).

### 8.6 Invariants

- Rows are scoped by RLS on the session client; any admin-client read happens only after the member
  passed that gate (the vault list) or after `canAccessMember` (every action).
- No money figure reaches the browser for a viewer `canSeeMemberFinance` refuses.
- A fact is never edited: a correction is a new row that supersedes the old ones.
- The vault's secret leaves the server only through `revealMemberVaultItemAction`, after a reason
  is recorded, and is never part of the dossier.
- `wa_group_jid` is never written by the page or its actions; it follows `sia.wag_groups.member_id`.
- Every member page and finance page open is logged.
