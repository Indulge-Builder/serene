# Sia: page spec

> **Purpose:** spec for `/sia`, the read-only viewer over every watched WhatsApp group, and its admin console (watcher health, pairing, group mapping).
> **Audience:** engineers.
> **Source-of-truth scope:** the page, its components, its actions and who sees what on it. The watcher that fills the tables is in `../integrations/sia-connector.md`; the organisation model (queendoms, seats) in `../modules/sia.md`; the ticket form the page hands off to in `./tickets.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/sia/`, `src/components/sia/`, `src/lib/actions/sia.ts`, `src/lib/services/sia-service.ts`, `src/lib/services/sia-access.ts`, `src/lib/constants/sia-roles.ts`.

## 1. Purpose

`/sia` shows every WhatsApp group the Sia watcher sits in, the way WhatsApp Web does: a rail
of groups on the left, the open chat on the right. It is a reader, never a sender: there is no
compose box, because Serene never writes into these groups. The floor uses it to read a
member's group, search it, look at who is in it, and select messages to turn into a ticket.
Admin and founder also get a console for the watcher's health, the WhatsApp session, and group
mapping.

## 2. Who sees it

Access is one answer from one place: `getSiaViewerScope(profile)` in
`src/lib/services/sia-access.ts`. The page redirects on `null`, and every read action applies
the same scope again per group, on the server.

| Viewer | Scope | Sees on `/sia` |
| --- | --- | --- |
| Admin, founder | `all` | Every group (member, vendor, internal, unmapped); the console gear; mapping controls; the "No member" filter |
| Tech workbench (domain `tech`) | `all` | Same rail and chats; the gear and mapping controls render, but their actions refuse (admin/founder only). See Open items |
| Seated concierge teammate (queen, bishop, genie, joker) | `queendom` | Only the groups linked to a member of their queendom, read only. No gear, no health poll, no mapping. The info panel shows the linked member as a link |
| Joker head | `queendom` with every active queendom | The member groups of every queendom. Never internal or unlinked groups, never the console |
| Anyone else (including an unseated concierge account) | `null` | Redirected to `/dashboard` |

`/sia` is in the concierge route map (`DOMAIN_ROUTE_MAP.concierge`) for reachability only;
admin and founder bypass the map. The page gate is the trust boundary because every read uses
the admin client: the `wag_*` tables are service-role only (no user RLS policy). The group to
queendom answer is always read from the database (`wag_groups.member_id` to
`members.queendom_id`), never taken from the browser. An unlinked group belongs to no
queendom, so only `all` viewers see it.

## 3. Data sources

| Layer | Items |
| --- | --- |
| Page | `src/app/(dashboard)/sia/page.tsx`: `getCurrentProfile` → `getSiaViewerScope` → `getSiaGroups()` filtered by `getQueendomGroupJids` for a queendom viewer. Reads `?group=` and `?message=` for deep links |
| Service | `src/lib/services/sia-service.ts` (admin client over the `sia` schema): `getSiaGroups` (one table read + the `sia.wag_group_activity()` RPC, 0173/0222), `getSiaMessages` (keyset pages of 60, `before` / `after` / `around`), `searchSiaMessages` (Postgres full-text, `simple` config, 50 hits), `getSiaGroupInfo`, `getSiaMediaPayload`, `getSiaHealth`, `getSiaWatcherStatus`, `requestSiaWatcherRestart`, `requestSiaSessionRepair`, `updateSiaGroupMapping` |
| Access | `src/lib/services/sia-access.ts`: `getSiaViewerScope`, `getQueendomGroupJids`, `canViewSiaGroup`, `canViewMember` |
| Read actions (scoped) | `src/lib/actions/sia.ts`: `getSiaGroupsAction`, `getSiaGroupInfoAction`, `getSiaMessagesAction`, `getSiaMediaAction`, `searchSiaMessagesAction`. Each takes the viewer scope; each that names a group checks it with `canViewSiaGroup`; a cross-group search is cut to the viewer's groups before it leaves the server |
| Admin actions (`requireProfile(['admin','founder'])`) | `getSiaHealthAction`, `getSiaPairingStatusAction`, `requestSiaRestartAction`, `requestSiaRepairAction`, `updateSiaGroupMappingAction` |
| Other | `searchMembersAction` (the member picker in the info panel); `siaGroupHref` / `siaMessageHref` in `src/lib/constants/sia-roles.ts` |

No Redis, no `unstable_cache`. Freshness comes from polling (section 8.3). Client-side Supabase
Realtime is not used because the `wag_*` tables have no user policy, so a browser subscription
would receive nothing.

## 4. Components

All under `src/components/sia/` unless noted.

| Component | Role |
| --- | --- |
| `SiaWorkspace` | The page body: header (title, the console gear with a live status dot for `all` viewers), the rail, the chat pane, mobile single-pane behaviour. Composes `ui/SplitWorkspace` and `ui/ConversationRailRow` |
| `SiaChat` | The chat pane: header (group title, kind pill, member count; buttons for "Create a ticket from messages" and "Search this conversation"), the stream, seamless history, the live tail, reply jump, deep-link jump, the selection bar |
| `SiaMessageBubble` + `SiaDaySeparator` | One message in WhatsApp-Web anatomy on Serene surfaces: sender clusters, quote strip, media, text through `ui/WaText` (`*bold*`, `_italic_`, links), time and markers (edited, forwarded, deleted), reaction chips, system rows as quiet pills |
| `SiaMedia` (`SiaMediaAttachment`) | Images and stickers inline (loaded when scrolled into view, click for full size), a voice-note player, tap-to-load video, tap-to-download documents; honest chips for "Downloading…", "Expired on WhatsApp", "Media unavailable" |
| `SiaGroupInfoPanel` | The group profile panel that slides over the chat: avatar and subject, linked member (picker for admin/founder, a link for others), kind pills and rail visibility toggle (admin/founder), description, facts (messages, watching since, created by), the member roster with the **Indulge** badge on staff |
| `SiaControlModal` | The console (admin/founder): health banner and tiles, the media pipeline, the Session panel (pairing QR, Restart, Re-pair), and the group mapping list |
| `SiaMessagesPeek` | The mini WhatsApp view used by the New ticket form: the real bubbles around a request, ringed, with "Earlier", "Later" and "Open in Sia". Lives here, mounted in `components/tickets/NewTicketForm.tsx` |
| `sia-shared.tsx` | Labels (`KIND_LABEL`, `TYPE_PREVIEW`), `groupTitle`, `senderLabel`, `formatSystemText`, `KindPillRow`, `SiaKindPill` |

## 5. States

- **Loading:** `sia/loading.tsx` composes the same `SplitWorkspace` pieces plus
  `PageHeaderSkeleton`, `RailRowsSkeleton` and `EmptyStateSkeleton`, so the skeleton cannot
  drift from the page.
- **Empty:** no groups at all → `EmptyState` "No groups yet" in the pane. Rail filter with no
  match → inline "No groups match". No chat open on desktop → "Pick a conversation". Search with
  no hits and an empty chat use inline empty states.
- **Error:** a failed media read shows a chip with the reason ("too large to preview", "hasn't
  finished downloading", "isn't available"). After three failed live-tail polls in a row (a
  deploy invalidates an open tab's action ids) the chat shows "Serene was updated, tap to
  refresh" instead of pretending the group went quiet. A mapping save failure reverts and
  toasts.

## 6. Invariants

- Never a compose box, never a send. The page is a reader (Deep dive 8.1).
- Every read that names a group checks it on the server (`canViewSiaGroup`); a queendom viewer
  can never read another queendom's group by typing its jid.
- Every change to Sia (console, restart, re-pair, mapping) is admin/founder only.
- The pairing QR leaves the server only while the watcher is in `pairing` and its beat is
  fresh; it grants the WhatsApp session, so it never leaves the admin/founder gate.
- Deep links are validated against the loaded list; a stale or hand-typed jid lands on the list.
- Media bytes are never public: S3 objects are presigned for 15 minutes per view.

## 7. Open items

- **The tech workbench sees admin controls it cannot use.** `canManage` is
  `scope.kind === 'all'`, which includes the tech workbench, but the console and mapping actions
  are admin/founder only, so its clicks fail. Either narrow `canManage` or open the actions.
- **Live tail is a poll.** Reactions, edits and deletes on a message already on screen show only
  after reopening the chat (also in `../operations/maintenance.md`).
- **Two staff-identity paths.** The info panel's Indulge badge matches member phones straight
  against `profiles.phone`; everything else reads `wag_contacts.staff_profile_id` from the
  15-minute link job. They agree when phones are set, but they are two code paths.
- **Stale comments in code:** `SiaWorkspace.tsx` still says "admin/founder only", and the
  `SiaChat.tsx` header still says push transport will come "when the connector moves to
  Fargate" (it moved on 2026-08-27; the poll stayed).

---

## 8. Deep dive

### 8.1 The rail

- Rows come from `getSiaGroups()`: one select on `wag_groups` plus `sia.wag_group_activity()`,
  which returns per group the message count and the last message (text, type, sender, from me,
  revoked). 0222 made it index-only, about 0.1 s. If the RPC fails the rail still renders, with
  zero counts and no previews.
- Sorted by last message, newest first. Hidden groups (`is_active = false`) never show in the
  rail; they live in the console only.
- **Filters:** a title search (client-side, debounced) and kind chips with counts: All, Member,
  Vendor, Internal, Unmapped, and for `all` viewers "No member" (a member-type group with no
  member linked: the to-do list of the linking work).
- The rail refreshes every 60 seconds; the open chat also feeds its own row live (preview,
  count, position).
- Each row is a `ConversationRailRow` (avatar, title and time, one preview line). A selected row
  shows only the avatar ring, never a wash over the row.

### 8.2 The chat

- **First page:** the newest 60 messages, each enriched in four bounded batches (sender names,
  media rows, reaction counts, quoted-message previews), never per row.
- **History:** no "load older" button. An IntersectionObserver near the top fetches the next
  page before the reader reaches the seam and keeps the scroll position; a small "Loading
  earlier messages" chip shows only mid-fetch.
- **Reply jump:** the quote strip is a button. It scrolls to the original and flashes it; if the
  original is not loaded, it pulls up to 3 older pages looking for it.
- **Search this conversation:** full-text over the group's messages (`simple` config, which
  handles Hinglish), 50 hits, newest first. There is no cross-group search box on the page;
  cross-group search is Elaya's (`search_sia_messages`, `search_member_history`).
- **System rows:** WhatsApp's protocol stubs render as human copy (`formatSystemText`: member
  added, group renamed, missed call). A message that failed to decrypt shows "Waiting for this
  message" until the re-send lands.

### 8.3 Live updates

- While a chat is open and the tab is visible, `SiaChat` polls `getSiaMessagesAction(jid, { after })`
  every 4 seconds and appends anything newer (a same-second sibling is kept by id dedup).
- If the reader has scrolled up, new messages raise a floating "N new messages" pill instead of
  yanking the scroll.
- The console gear's status dot polls health every 60 seconds (20 seconds while the console is
  open); the console's Session panel polls every 5 seconds while open.

### 8.4 Group info panel

Clicking the chat header slides the panel in over the pane (spring, no scrim, Escape closes).

- **Linked member:** admin/founder pick a member with the member search and link or unlink the
  group (`updateSiaGroupMappingAction` with `member_id`, admin/founder on the server). A link
  sets `group_kind = 'member'`; an unlink sets `unmapped`, so an unlinked group can never be
  read by the profiler. The member's `wa_group_jid` mirror is kept by a trigger (0217), never by
  app code. The member page's WhatsApp card is the other way to link (see
  `./members.md`); its action is gated more loosely, see `../modules/sia.md` Open items.
- **Mapping:** kind pills (member, vendor, internal, unmapped) and the rail-visibility toggle,
  admin/founder only. The console offers the same controls for every group.
- **Roster:** members with search (over 12 members), WhatsApp admin badges, and a collapsed
  list of former members. Each member's identity resolves lid → `wag_contacts` → phone →
  `public.profiles` phone; a match wears the **Indulge** badge (name and role on hover). Others
  take their side from the group's kind (a member group labels them Member, a vendor group
  Vendor, an internal group External; an unmapped group shows no label). A lid the watcher has
  not paired with a phone yet shows as "Not synced yet".

### 8.5 Making a ticket from messages

1. In a chat, press the clipboard button ("Create a ticket from messages") to enter selection
   mode; tap messages to select them.
2. "Create ticket" requires the group to be linked to a member (otherwise a toast asks to link it
   first in Group info).
3. The selection (member, group, each message's id, sender, time, text) goes into
   `sessionStorage` under `TICKET_SELECTION_KEY`, and the page navigates to
   `/tickets/new?member=<id>&from=sia`. The New ticket form reads it and drafts the ticket.

This works for every viewer, including seated teammates. The form and its drafting are
documented in `./tickets.md` and `../modules/tickets.md`.

### 8.6 Deep links

- `siaGroupHref(jid)` builds `/sia?group=<jid>`: the page opens that chat on arrival and scrolls
  its rail row into view. Used by the member page (identity card and WhatsApp card) and by
  Elaya's alert notifications (`elaya-alerts.ts`).
- `siaMessageHref(jid, waMessageId)` adds `&message=<id>`: the chat opens and jumps to that
  message, looking up to 12 pages back, then flashes it. Used by `SiaMessagesPeek` ("Open in
  Sia", new tab).
- Both are honoured only when the jid is in the viewer's loaded list; `message` only with a
  valid group and at most 120 characters.
- Never link to bare `/sia` when the group is known. (The Freshdesk ticket page still does; see
  `../integrations/freshdesk.md`.)

### 8.7 Mobile

Below `md` the page is single-pane: rail or chat. Opening a chat pushes `?group=<jid>` into
history, so the hardware Back button closes the chat instead of leaving the page, and focus
returns to the row that opened it (mobile audit, 2026-09-26). A deep-link arrival with nothing
to pop just drops the param.

### 8.8 The console (admin and founder)

Opened from the gear in the page header. Four blocks in one modal:

- **Health banner:** the watcher's state from its heartbeat (`sia.wag_watcher_status`): live,
  waiting to be paired, connecting, session lost, or offline (no beat for 3 minutes). Liveness
  is never judged by group traffic.
- **Tiles:** events and messages in the last hour, total messages, groups watched, unmapped
  (with a "need classifying" note), hidden. **Media pipeline:** downloaded, pending ("backfill
  draining"), retrying, expired, lost (dead-letter). All head counts, never a table fetch.
- **Session (0177):** while the watcher is in `pairing`, the QR renders here on a white tile;
  scan it with the watcher phone to pair without a terminal. **Restart watcher** stamps
  `restart_requested_at`; the watcher reads it on its next beat and exits cleanly, and the same
  session resumes. **Re-pair session** (behind a `ConfirmDialog`) deletes `sia.wag_auth_state`
  and requests a restart, so the next boot shows a fresh QR here. Re-pair ends the session but
  never touches the saved messages. Operating rule and procedure:
  `../integrations/sia-connector.md`.
- **Group mapping:** every group (hidden ones included) with a search, the kind pills and the
  rail-visibility toggle.
