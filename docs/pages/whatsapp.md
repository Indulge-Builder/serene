# WhatsApp (lead inbox): Page Spec

> **Purpose:** spec for `/whatsapp` (the shared inbox of lead conversations) and the dossier `LeadWhatsAppCard`: the in-app surfaces of Gia's WhatsApp channel on the Gupshup business number.
> **Audience:** engineers. · **Source-of-truth scope:** the UI surfaces, `whatsapp-service.ts`, `whatsapp-media.ts`, `actions/whatsapp.ts`, Realtime wiring, and the WhatsApp tables' shape and RLS. The webhook contract, inbound pipeline, templates and notification log mechanics live in `../integrations/whatsapp-gupshup.md`; the customer-facing Elaya in `../modules/customer-welcome-blast.md`; the staff Elaya channel in `../modules/elaya.md`. Not this page: the concierge WhatsApp **groups** (the Sia archive, `./sia.md`) and the second Baileys number for Elaya's hands (`../architecture/hands-plan.md`).
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/whatsapp/{page,loading}.tsx`, `src/components/whatsapp/*`, `src/components/ui/{SplitWorkspace,ConversationRailRow}.tsx`, `src/components/leads/LeadWhatsAppCard{,Async}.tsx`, `src/lib/services/{whatsapp-service,whatsapp-api,whatsapp-ingestion,whatsapp-media,elaya-whatsapp,lead-assignment-notify,profiles-service}.ts`, `src/lib/actions/whatsapp.ts`, `src/lib/constants/{whatsapp,route-permissions}.ts`, `src/app/api/webhooks/whatsapp/route.ts`, and migrations 0032 to 0038, 0041, 0085, 0141, 0148, 0151, 0153, 0177, 0210, 0212.

## 1. Purpose

A shared WhatsApp inbox inside Serene for the sales (Gia) teams: every lead's phone number maps to
one conversation thread, messages arrive live, and agents reply (text, image, video, PDF, audio,
or a dictated draft) without leaving the app. Conversations hang off `leads` and follow the lead's
assignment and domain rules.

Two ways a conversation starts: **inbound** (the webhook's service-role pipeline creates it) and
**agent-initiated** from the lead dossier (`initiateWhatsAppConversationAction` sends the
`lead_initiation` template, which opens the 24-hour session window).

The thread can also carry **customer-Elaya** replies (0151): she welcomes a brand-new lead and
answers later messages while `bot_active` is on. Her rows are `sender_type: 'bot'`, `is_bot: true`
and show an "Elaya" label. An agent's manual reply takes the thread over (`bot_active` off).

The same business number is Elaya's **staff** channel: a message from a known staff phone is
routed to her before the lead pipeline ever sees it (§8.7).

## 2. Who sees it

| Layer | Rule |
| ----- | ---- |
| Route map | `/whatsapp` is in the `DOMAIN_ROUTE_MAP` of the four Gia domains only (onboarding, house, shop, legacy). It left the concierge map on 2026-09-18 (the floor works in Sia and Freshdesk instead) and was never in finance, marketing or business. The tech workbench reaches it; admin and founder bypass the map |
| Page | `page.tsx` redirects a missing profile to `/login` and a guest to `/dashboard`. The domain gate is the layout's `canAccessRoute` |
| Sidebar | "WhatsApp" in the main nav through `isNavVisible`. Not in the founder's curated list (`FOUNDER_NAV_PREFIXES`), so founders reach it by a link from a lead or by URL |
| Rows (RLS) | an agent sees conversations on leads assigned to them; a manager, their domain's leads; admin and founder, all (`can_access_wa_conversation`) |

Every conversation someone can see, they can reply to: there is no resolved or locked state
(Resolve/Reopen was removed on 2026-06-20). Full matrix: Deep dive §8.10.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service (session client, RLS) | `whatsapp-service.ts`: `getConversations` (cursor on `last_message_at`; rows carry a per-caller `unread_count` 0 or 1), `getConversation`, `getConversationByLeadId` (null when none), `getMessages` (ascending; signs media paths on read), `getUnreadCount` (`get_wa_unread_count`), `markConversationRead`, `searchConversations` (max 20). One admin-client read: `getLeadWhatsAppThreadForElaya(leadId, limit = 40)` for Elaya's `get_lead_whatsapp_chat` tool |
| Media | `whatsapp-media.ts` (server-only, admin client): `storeInboundMedia`, `storeOutboundMedia`, `signMediaPath` |
| Actions | `whatsapp.ts`: `sendWhatsAppMessage`, `sendWhatsAppMediaMessage`, `signWhatsAppMediaAction`, `markConversationAsRead`, `getConversationsAction`, `getMessagesAction`, `searchConversationsAction`, `initiateWhatsAppConversationAction`. (`getConversationByLeadIdAction` was deleted; the dossier reads the service directly. `resolveConversation` / `reopenConversation` were deleted 2026-06-20; do not recreate.) |
| Tables | schema **`gia`** since 0210: `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_conversation_reads`, `whatsapp_notification_logs`. Every query goes through `giaDb()`; a lint rule refuses an unscoped `.from()` on them |
| Pipeline | the webhook, inbound processing and every outbound send: `../integrations/whatsapp-gupshup.md` |

## 4. Components

| Component | Role |
| --------- | ---- |
| `WhatsAppShell` | The page body: title row, `SplitWorkspace` with the rail and the pane, conversation state, pagination, the `?c=` deep link, Realtime on conversations |
| `ConversationList` | The rail: search, the period filter, the rows (`ui/ConversationRailRow`), load-more |
| `WhatsAppConversationPeriodFilter` | The URL-driven period filter in the rail header |
| `ConversationPanel` | The open conversation: header, message well, composer, Realtime on messages |
| `MessageBubble` | One message, with media previews and delivery ticks |
| `EmptyConversationState` | The pane when nothing is open (a thin wrapper over `EmptyState` with the `MessageCircle` icon) |
| `ui/SplitWorkspace` (`SplitWorkspace`, `SplitRail`, `SplitRailHeader`, `SplitRailList`, `SplitPane`) | THE two-card conversation layout, shared with `/sia` (2026-09-25) |
| `ui/ConversationRailRow` | THE rail row, shared with `/sia`. The old `ConversationRow.tsx` is deleted |
| `LeadWhatsAppCard` + `LeadWhatsAppCardAsync` | The thread on the lead dossier (§8.6) |
| `ui/DictationButton` | The mic in the composer's leading slot |

## 5. States

- **Loading:** `whatsapp/loading.tsx` composes the same shared pieces as the page:
  `PageHeaderSkeleton`, the `SplitWorkspace` cards, `RailRowsSkeleton` and `EmptyStateSkeleton`
  (the same scaffold `/sia` uses). Opening a conversation shows a `LogoSpinner` in the pane.
- **Empty:** nothing open → `EmptyConversationState` (hero, "Select a conversation."). An empty
  thread → inline "No messages yet.". An empty rail → inline "No conversations yet.", "Nothing
  matches this period." or "No results found.".
- **Error:** a failed send removes the optimistic bubble and shows a toast. A failed initiation
  shows inline on the dossier card (the one send that throws).

## 6. Invariants

Deep dive §8.11. The short list: the webhook always answers 200 for accepted or ignored events;
`wa_message_id` dedup through a partial unique index; the delivery-receipt update is the only
UPDATE on `whatsapp_messages`; `can_access_wa_conversation` must follow the leads RLS; `media_url`
holds a storage path, never a URL; the customer bot never talks over a human; the tables are read
through `giaDb()`.

## 7. Open items

- **Founder new-lead WhatsApp alerts are paused** by a code switch (`FOUNDER_LEAD_ALERTS_PAUSED =
  true` in `constants/whatsapp.ts`, 2026-09-21) and by per-founder off rows (2026-09-23). The
  agent's assignment ping, the in-app notification and the SLA timers still fire.
- **A staff member with a blank `profiles.phone` becomes a lead** when they message the number:
  the staff gate cannot match them, so the lead pipeline takes the message (§8.7). Fill the
  company phone on the Team page.
- **Customer welcome template:** the first-touch welcome stays skipped until
  `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set (`CUSTOMER_WELCOME_TEMPLATE_CONFIGURED`). TODO:
  verify whether it is set in production.
- **Gupshup delivery receipts are acknowledged but not stored:** the `message-event` branch of the
  webhook returns 200 without calling `processStatusUpdate`, so ticks beyond "sent" appear only on
  the dormant Meta path.
- **Unfiltered pagination** uses a single-column cursor on nullable `last_message_at`; a conversation
  that never had a message may not paginate correctly (§8.3a).
- `whatsapp_conversations.status` and its CHECK are kept but dead (every row is `open`).
- Founders do not see WhatsApp in their sidebar.

---

## 8. Deep dive

### 8.1 Data model

All four tables moved from `public` to `gia` on 2026-09-17 (0210). The sender embed
(`sender:profiles (full_name)`) keeps working through the `gia.profiles` view (0212, narrowed to
`id, full_name` by 0213), because PostgREST cannot embed across schemas.

#### 8.1a `gia.whatsapp_conversations`

One row per lead (one thread per phone).

| Column | Type | Null | Default | Notes |
| ------ | ---- | ---- | ------- | ----- |
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `lead_id` | uuid | no | | FK → `leads(id)` ON DELETE CASCADE; UNIQUE |
| `wa_id` | text | no | | sender id, E.164 without `+`; UNIQUE |
| `phone` | text | no | | E.164 with `+` |
| `status` | text | no | `'open'` | CHECK `open` / `resolved`. Dead but kept: every row stays `open` |
| `last_message_at` | timestamptz | yes | | bumped on every message; drives sort and the period filter |
| `bot_active` | boolean | no | `true` | the customer-Elaya reply gate (0151); an agent send sets it false |
| `bot_paused_by` / `bot_paused_at` | uuid / timestamptz | yes | | who took the thread over, and when |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

Indexes: `idx_wa_conversations_lead_id`; `idx_wa_conversations_last_message` on `last_message_at
DESC WHERE status = 'open'` (all rows, in practice). RLS (0032, recreated in 0041, hoisted in
0088): SELECT for an agent or manager when `can_access_wa_conversation(lead_id)`, all rows for
admin/founder; UPDATE on the same terms. No INSERT policy: only the service role creates rows
(ingestion, or `initiateWhatsAppConversationAction` through the admin client). Realtime: in the
publication as `gia.whatsapp_conversations` (re-added by 0210).

#### 8.1b `gia.whatsapp_messages`

Append-only log of both directions.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid | PK |
| `conversation_id` / `lead_id` | uuid | FKs (`lead_id` denormalised for RLS) |
| `direction` | text | `inbound` / `outbound` |
| `sender_type` | text | `lead` / `agent` / `bot` |
| `sender_id` | uuid | FK → profiles; NULL for lead and bot |
| `wa_message_id` | text | provider id; NULL allowed for an optimistic outbound row |
| `message_type` | text | `text`, `image`, `video`, `document`, `audio`, `template` |
| `content` | text | sanitised text or caption |
| `media_url` | text | a storage **path** in the private `whatsapp-media` bucket (0141), signed on read. Old or fallback rows may hold a raw CDN URL, passed through |
| `media_mime_type` | text | |
| `status` / `status_at` | text / timestamptz | outbound: `sent`, `delivered`, `read`, `failed`; inbound NULL |
| `is_bot` | boolean | true on every customer-Elaya row (0151) |
| `created_at` | timestamptz | |

- **Append-only (A-11):** no DELETE policy; no UPDATE policy for app roles. The one exception:
  `processStatusUpdate()` (ingestion) updates only `status` and `status_at`, by `wa_message_id`,
  with the admin client.
- **Dedup:** `CREATE UNIQUE INDEX idx_wa_messages_wa_message_id ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL`: a partial index, so several optimistic NULLs never clash.
- **RLS:** SELECT as for conversations. INSERT `wa_messages_outbound_insert` (0037): outbound,
  `sender_type = 'agent'`, `sender_id = auth.uid()`, the conversation is accessible, role agent /
  manager / admin / founder. The inbox composer inserts with the session client under this
  policy; inbound rows and the initiation template row use the admin client.
- **Realtime:** in the publication as `gia.whatsapp_messages`.

#### 8.1c `gia.whatsapp_conversation_reads`

Per-person read cursor: `conversation_id`, `agent_id`, `last_read_at`, UNIQUE `(conversation_id,
agent_id)`. RLS: your own rows only. `markConversationRead()` upserts on that pair. A conversation
is unread when `last_read_at` is missing or older than `last_message_at`.

#### 8.1d `gia.whatsapp_notification_logs`

The audit log of system sends (templates, the staff and customer Elaya replies), never of messages
an agent types in the inbox. One row per attempt, written in the send's `finally` block and
awaited. Phones are stored as the last four digits; `gupshup_body` is cut at 2,000 characters;
`delivered` reads the body too, because Gupshup answers HTTP 200 on application errors.
SELECT for admin/founder.

`type` is a **14-value CHECK** (latest: 0177):

| Value | Written by | Since |
| ----- | ---------- | ----- |
| `agent_assignment` | `sendLeadAssignmentNotification` | 0038 |
| `founder_alert` | `sendFounderLeadNotification` | 0038 |
| `sla_breach` | `sendSlaAgentNotification`, `sendSlaManagerNotification` | 0067 |
| `lead_initiation` | `sendLeadInitiationMessage` | 0067 |
| `task_due_reminder`, `task_overdue_manager` | the lead-task reminders | 0113 |
| `elaya_reply` | `sendElayaWhatsAppReply` (staff channel) | 0117 |
| `task_due_soon`, `task_overdue_agent`, `task_overdue_manager_generic` | the reminders for every task | 0142 |
| `customer_welcome`, `customer_reply` | the customer-Elaya sends | 0151 |
| `task_assigned` | `sendTaskAssignedNotification` (also every repeat nudge) | 0153 |
| `sia_alert` | `sendSiaAlertNotification` (watcher and tech alerts) and `sendElayaTemplatePing` (a founder's brief or alert when their 24-hour window is closed) | 0177 |

Extend the CHECK in a migration before logging a new type. Mechanics:
`../integrations/whatsapp-gupshup.md`.

### 8.2 Database functions

Both stay in `public`; 0210 widened their `search_path` to `public, gia`.

**`can_access_wa_conversation(p_lead_id)`** (0032, recreated in 0041): `STABLE SECURITY DEFINER`,
used inside the RLS policies, not called from the app.

```sql
EXISTS (
  SELECT 1 FROM leads l
  WHERE l.id = p_lead_id
    AND l.archived_at IS NULL
    AND (
      (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
      OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
      OR get_user_role() IN ('admin', 'founder')
    )
)
```

It repeats the lead visibility rules, so **change it together with the leads RLS**.

**`get_wa_unread_count()`** (0036, fixed 0085): counts accessible, open conversations with no read
row or a read older than the last message. The 0085 fix passed `wc.lead_id` (not the conversation
id) to the access function; before it the badge was always 0. Returns an integer; the service turns
an error into 0.

### 8.3 The service files

| File | Client | Throws? | From a `'use client'` file? |
| ---- | ------ | ------- | --------------------------- |
| `whatsapp-service.ts` | session (RLS decides), plus one admin read for Elaya | returns empty or null on error | never; use the actions |
| `whatsapp-api.ts` | none (HTTP) + admin for the log | templates never; `sendTextMessage`, `sendGupshupMediaMessage`, `sendLeadInitiationMessage` can | never |
| `whatsapp-ingestion.ts` | admin throughout | logs; a duplicate exits quietly | never |
| `whatsapp-media.ts` | admin (storage) | never; returns null | never |
| `lead-assignment-notify.ts` | orchestrator | | never |
| `elaya-whatsapp.ts` | the staff gate | returns a boolean | never |
| `elaya-customer.ts` | the customer channel (dynamic import from ingestion) | non-fatal | never |

#### 8.3a `whatsapp-service.ts`

| Export | Notes |
| ------ | ----- |
| `getConversations({ limit?, cursor?, period?, customFrom?, customTo? })` | joins the lead for name and phone; `last_message_at DESC` (nulls last); cursor `.lt('last_message_at', cursor)`; period on `last_message_at`; adds `unread_count` through one batched reads query |
| `getConversation(id)`, `getConversationByLeadId(leadId)` | one row with the lead; the second returns null when there is no conversation yet (not an error) |
| `getMessages(id, { limit?, before? })` | ascending `created_at`; sender name through the `gia.profiles` view; every `media_url` passed through `signMediaPath` |
| `getUnreadCount()` | the RPC; 0 on error |
| `markConversationRead(id)` | upsert on `(conversation_id, agent_id)` |
| `searchConversations(query, period?)` | sanitised; ILIKE on the lead's first and last name and the phone; max 20 |
| `getLeadWhatsAppThreadForElaya(leadId, limit = 40)` | admin client; the caller (Elaya's tool) gates the lead first |

**Cursor caveat:** a single-column cursor on a nullable column drops rows where it is NULL. The
period-filtered list excludes NULL `last_message_at` first, so it is safe; the unfiltered list may
skip conversations that never had a message. If that matters, move to the composite cursor pattern
of `getPersonalTasks`. `getMessages` pages on `created_at`, which is never NULL.

#### 8.3b `whatsapp-api.ts` (server-only)

The config check is deferred: `assertGupshupConfigured()` throws on the first send if a Gupshup
variable is missing, so the Trigger.dev build can import the module without secrets. Every template
send runs through one internal `sendGupshupTemplate()`, which owns the fetch, the
`isGupshupDelivered` reading and the awaited `logNotification` in `finally`.

| Export | Purpose |
| ------ | ------- |
| `sendTextMessage(to, text)` | the inbox text send; can throw (the action catches) |
| `sendGupshupMediaMessage(to, type, url, caption?, filename?)` | the inbox media send by URL; can throw |
| `sendElayaWhatsAppReply(...)` | the staff-channel reply (log `elaya_reply`) |
| `sendCustomerWelcomeTemplate(...)`, `sendCustomerWhatsAppReply(...)` | the customer channel (0151); the welcome is skipped unless its template is configured |
| `sendLeadInitiationMessage(to, leadName, agentName)` | the `lead_initiation` template; rethrows so the dossier shows the error |
| `sendLeadAssignmentNotification`, `sendFounderLeadNotification` | assignment pings (pref-gated `lead_assigned`, `new_lead_founder_alert`) |
| `sendSlaAgentNotification`, `sendSlaManagerNotification` | SLA pings (log `sla_breach`) |
| `sendTaskDueReminderNotification`, `sendTaskOverdueManagerNotification`, `sendTaskDueSoonAgentNotification`, `sendTaskOverdueAgentNotification`, `sendTaskOverdueManagerGenericNotification`, `sendTaskAssignedNotification` | the task pings (`./tasks.md`) |
| `sendElayaTemplatePing(to, recipientId, firstName, title, body)` | one founder, one template message when their 24-hour window is closed (the brief and the alert sweep); rides the Sia alert template; no-op unless it is configured |
| `sendSiaAlertNotification(title, body, audience)` | the tech / tier-1 alert fan-out (watcher health, silent turns); not gated by notification preferences |
| `getMediaDownloadUrl(mediaId)` | Meta media id → temporary URL; only the dormant Meta branch reaches it |
| `verifyMetaSignature(rawBody, header)` | HMAC-SHA256, timing-safe |
| `WEBHOOK_VERIFY_TOKEN` | re-export for the GET challenge |

#### 8.3c `whatsapp-ingestion.ts`

`processInboundMessage(waId, phone, message, senderName?)`, which runs inside the route's
`after()`:

1. Normalise the phone.
2. Dedup on `wa_message_id`; a repeat returns.
3. Find the lead by phone; if none, `createLeadFromWhatsApp` (`lead-ingestion.ts`). When it reports
   `alreadyExisted` (a race lost on the 0137 phone index), skip the second round of alerts.
   Otherwise invalidate the lead caches and `await notifyLeadAssigned(...)` (a plain `await`:
   this already runs inside `after()`).
4. Get or create the conversation (select → insert → re-select, race-safe) **in parallel** with the
   media step.
5. Media: the source URL is Gupshup's direct CDN URL (or, on the Meta branch, from
   `getMediaDownloadUrl`), then `storeInboundMedia` copies the bytes into the private bucket and
   `media_url` becomes the path; on failure the raw URL is kept so the file loads until it expires.
6. Insert the message (sanitised; inbound `status` NULL).
7. Bump `last_message_at`.
8. **Customer Elaya (0151):** a lead never welcomed → `maybeSendCustomerWelcome` (once, guarded by
   the `leads.welcomed_at` stamp); otherwise `handleCustomerReply` when `bot_active`. Non-fatal.
9. Realtime delivers the new rows to open screens.

`processStatusUpdate(waMessageId, status)` updates only `status` and `status_at` and warns when
nothing matched.

#### 8.3d `whatsapp-media.ts` (0141)

Gupshup hands over media as a time-limited CDN URL, so the file is copied into the private
`whatsapp-media` bucket and the row stores the path.

| Export | Purpose |
| ------ | ------- |
| `storeInboundMedia(cdnUrl, mime, leadId, messageId)` | download (32 MB cap, empty-file guard) → `whatsapp-media/{leadId}/{messageId}.{ext}` → the path, or null |
| `storeOutboundMedia(bytes, mime, leadId, key)` | upload an attached file → `…/out-{key}.{ext}` → the path |
| `signMediaPath(pathOrUrl)` | a 1-hour signed URL; an `http(s)` value passes through; null on failure |
| `mediaExtFromMime`, `WHATSAPP_MEDIA_BUCKET`, `WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS` | helpers and constants |

#### 8.3e `lead-assignment-notify.ts`

`notifyLeadAssigned(input)` is the one entry point for everything that happens when a lead is
assigned (the lead webhook, WhatsApp inbound, `assignLead`, `createManualLead`):

1. The agent's WhatsApp (`sendLeadAssignmentNotification`), when assigned. Awaited.
2. The founders' WhatsApp (`sendFounderLeadNotification`), on a new, non-duplicate lead, **only
   while `FOUNDER_LEAD_ALERTS_PAUSED` is false** (it is true since 2026-09-21). Awaited, in parallel
   with 1 (`Promise.allSettled`).
3. The in-app `lead_assigned` notification, unless the assignee is the actor.
4. The SLA timers, when asked for and assigned.

Callers run it inside `after()` so the response returns at once and the lambda lives until the
sends settle; a bare `void` would lose them on Vercel (the 2026-06-08 lesson).

### 8.4 Server actions: `whatsapp.ts`

Every action runs Zod first, then `requireProfile()` (A-18), and queries through `giaDb()`.

| Action | Validation | Does | Returns |
| ------ | ---------- | ---- | ------- |
| `sendWhatsAppMessage` | `SendMessageSchema` (uuid + 1 to 4,096 chars, sanitised) | load the conversation (RLS) → `sendTextMessage` → insert the outbound row with the session client → bump `last_message_at` → **take over** (`bot_active = false`, `bot_paused_by`, `bot_paused_at`) | `ActionResult<WhatsAppMessage>` |
| `sendWhatsAppMediaMessage(formData)` | `SendMediaMessageSchema` (uuid, caption ≤ 1,024, a non-empty file ≤ 16 MB on the outbound MIME allowlist) | `storeOutboundMedia` → `signMediaPath` → `sendGupshupMediaMessage` by the signed URL → insert with `media_url` = the path → bump → take over; returns the row with a signed URL for the optimistic bubble | `ActionResult<WhatsAppMessage>` |
| `signWhatsAppMediaAction(path)` | non-empty string | `signMediaPath` for a media row that arrived by Realtime | `{ url }` |
| `markConversationAsRead` | uuid | `markConversationRead` | `ActionResult<null>` |
| `getConversationsAction`, `getMessagesAction`, `searchConversationsAction` | filter schemas / uuid | the reads | lists |
| `initiateWhatsAppConversationAction(leadId)` | uuid | below | `ActionResult<{ conversation, message }>` |

**`initiateWhatsAppConversationAction`:** load the lead with the session client (RLS is the access
check; no phone → error) → if a conversation exists, return it with a placeholder message →
otherwise insert it with the admin client (a UNIQUE race re-reads) → send the `lead_initiation`
template (throws → a user-facing error; the conversation row already exists) → insert the outbound
`template` row ("Hello {lead}, this is {agent} from Indulge Global.") and bump
`last_message_at`. The agent name is the lead's assignee, else the caller.

### 8.5 The `/whatsapp` page

**`page.tsx`** (metadata title "WhatsApp"): the profile checks (§2), the period from the URL
(`parseWhatsAppPeriodFromSearchParams`), then `Promise.all([getConversations({ limit: 20, period
}), getUnreadCount()])` → `WhatsAppShell` with the conversations, the unread count and the caller.
`<main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">`. No Suspense in the page; the
route's `loading.tsx` covers it.

**Layout (the Sia anatomy, 2026-09-25).** The page is a normal padded page, not full-bleed:

1. **Title row:** "WhatsApp" with the page-title dot, an accent "N unread" pill (capped at "99+")
   when there are unread conversations, and the `PageControls` bell.
2. **`SplitWorkspace`:** a **340px rail card** (from md up) and a flexible **pane card**, both
   paper with a hairline, `--shadow-1` and `--radius-lg`. The old full-bleed split (a 320px paper
   rail and a grey right panel) and its `.serene-wa-*` mobile carve-outs are gone.

**`WhatsAppShell`** owns the list, the open conversation and its messages, pagination, the period
refetch, the unread pill, and Realtime on conversations (`wa-conversations-${userId}-${mountId}`,
`schema: 'gia'`: INSERT prepends, UPDATE merges and re-sorts by `last_message_at`). Opening a
conversation clears its row's unread state at once and loads its messages; a stale response is
dropped by a sequence guard.

**On a phone** (below md) the rail and the pane take turns, and the URL decides which: opening a
conversation pushes `?c=<id>`; Back pops it (or replaces the URL when the page was opened on a deep
link); Back and Forward move the pane; a deep link `?c=<id>` opens that conversation on arrival
when it is in the list. When the pane closes, focus returns to the row that was open.

**`ConversationList`** (inside `SplitRail`): the header strip holds the search (`SearchBar`, 300ms
debounce → `searchConversationsAction`) and the uppercase "Conversations" label with the period
filter; below it the rows. Load-more runs on an `IntersectionObserver` sentinel (never a scroll
listener), disabled while searching; "That's everything." at the end of a long list.

**The row (`ui/ConversationRailRow`, shared with `/sia`):** avatar with an unread dot, the lead's
name and the last message time (the dot and an unread time in `--neu-accent-deep`), the phone as
the second line (left out when the name is the phone). A selected row shows **only the accent ring
on the avatar** and a semibold name: never a row fill, never a left-edge strip. Rows are
full-bleed with a hairline between them.

**`ConversationPanel`:**

1. **Header:** a compact paper strip: avatar (small), the name, the phone, and a back button on a
   phone.
2. **Message well** on `--theme-paper-subtle`, with date separators as soft raised pills. It
   scrolls to the bottom only when the reader is within 140px of it or just sent a message;
   otherwise an "N new messages" pill jumps to the latest.
3. **Composer:** `MessageBar` with a paperclip (a hidden file input whose `accept` mirrors the
   outbound allowlist) and the `DictationButton` in its leading slot. Enter on touch is a newline;
   the send knob sends. A character counter appears past 3,000 characters (hard cap 4,096).

Realtime: `wa-messages-${conversationId}-${mountId}` filtered by `conversation_id`, `schema:
'gia'`. An INSERT is deduplicated (`seenIds`); a media row arrives with the storage path, so the
panel calls `signWhatsAppMediaAction` before showing it; an outbound echo replaces the oldest
optimistic bubble from the same sender. An UPDATE merges `status` / `status_at` (the ticks). The
panel marks the conversation read when it opens and on every inbound message while it is on screen.

Sending: text goes in as an optimistic bubble (`optimistic-*` id), replaced by the server row or
removed with a toast. Media is checked in the browser first (type and size; the action checks
again), shown from a local object URL, then swapped for the confirmed row; the object URL is
revoked afterwards. Dictation appends the transcript to the draft and focuses it; it never sends
on its own.

**`MessageBubble`:**

| | Inbound | Outbound |
| - | ------- | -------- |
| Side | left | right |
| Surface | `--neu-surface-high` | `--neu-chat-user-bg` (the theme's chat wash) |
| Extra | avatar and name | "Elaya" label (in `--neu-accent-deep`) when `is_bot` |

No border; `--neu-shadow-chip`; at most 72% wide; a clock time (`h:mm a`) in the footer. Text is
rendered through the shared `ui/WaText` (WhatsApp's own asterisk-bold and underscore-italic
formatting). Ticks on
outbound: sent = one grey check, delivered = two grey checks, read = two checks in
`--neu-info-deep`, failed = an X in the danger ink. Images and videos preview inline (`maxWidth:
100%` of the bubble, at most 240px tall; an image opens full size); documents, audio and any media
row without a URL show a labelled chip with a View link. A non-media message with an empty body
shows "Unsupported message" (the webhook already stores labels such as `[Sticker]` for most of
these). The Sia bubble (`sia/SiaMessageBubble`) is a separate component on the same tokens.

### 8.6 The dossier card: `LeadWhatsAppCard`

On `/leads/[id]`, after the notes input, inside a Suspense around `LeadWhatsAppCardAsync` (a server
component that reads `getConversationByLeadId` and then the last 30 messages, off the page's
critical path).

- **No phone:** "No phone number on file." and no composer.
- **No conversation:** a "Start Conversation" button → `initiateWhatsAppConversationAction`.
- **A conversation:** the live thread and composer (no locked state).

Realtime on `wa-messages-${conversationId}-${mountId}` (`schema: 'gia'`), keyed on the
conversation in state, so it subscribes right after an initiation. The card imports only
`lib/actions/whatsapp.ts`, never the service.

### 8.7 The Elaya staff channel on the same number

The webhook calls `tryHandleElayaWhatsAppMessage(phone, message)` (`elaya-whatsapp.ts`) **before**
`processInboundMessage`; only when it returns false does the lead pipeline run.

1. `getActiveProfileByPhone` matches the sender to an active profile: exact E.164 first, then the
   canonical digits across every active profile with a phone. **No match → false → the lead
   pipeline.** A teammate whose `profiles.phone` is blank can never match, so their message makes
   them a lead.
2. A match that fails `hasElayaAccess(profile)` (Elaya is on for admin, founder, the tech
   workbench, concierge and the Gia domains since 2026-09-26) gets one plain "not enabled" line
   back and the gate returns true: the message is swallowed and never becomes a lead.
3. Otherwise: dedup on the Gupshup message id (`hasProcessedWaMessage`, backed by the 0148 partial
   unique index on `elaya_messages`), voice notes transcribed in memory (Deepgram; an empty
   transcript is a quiet no-op), then the turn.
4. **Which brain:** the `brain_whatsapp` row in `elaya_settings` (0179), read per message, picks
   the in-process Node brain or the Python brain (`lib/elaya/python-brain.ts`). If it says Python
   but the Python brain is not configured, Node answers and a warning is logged. There is no
   automatic fallback when a turn fails.
5. One reply through `sendElayaWhatsAppReply` (an `elaya_reply` log row). Any failure after a match
   still returns true, with an "unavailable" line sent.

The staff channel never writes lead-pipeline tables. Everything about the brains, the tools and the
cap: `../modules/elaya.md`.

### 8.8 The customer channel inside the lead thread (0151)

The outward twin of §8.7, for a number that is a lead. Wired at the end of `processInboundMessage`
(step 8), additive, never replacing the pipeline. Service: `elaya-customer.ts`. First touch: the
welcome template once per lead (the `welcomed_at` stamp; skipped until the template id is
configured). Replies: `runCustomerTurn` under a hard-capped customer principal whose only tools are
`get_company_material` and `note_customer_interest` (no staff or CRM reads), facts from the
`elaya_training_assets` library, up to four media assets a turn. The take-over gate is `bot_active`.
The transcript is the lead's own `whatsapp_messages` thread. Full contract:
`../modules/customer-welcome-blast.md`.

### 8.9 Realtime channels

| Channel | Table (schema `gia`) | Events | Owner |
| ------- | -------------------- | ------ | ----- |
| `wa-conversations-${userId}-${mountId}` | `whatsapp_conversations` | INSERT prepend; UPDATE merge + re-sort | `WhatsAppShell` |
| `wa-messages-${conversationId}-${mountId}` | `whatsapp_messages` (filter `conversation_id`) | INSERT append or replace an optimistic bubble (media signed first); UPDATE ticks | `ConversationPanel`, `LeadWhatsAppCard` |

The `useId()` mount nonce is required (React StrictMode mounts twice, P-06). Teardown is always
`supabase.removeChannel(channel)`.

### 8.10 Access control summary

| Role | Sees | Can send (text, media) | Can start from the dossier |
| ---- | ---- | ---------------------- | -------------------------- |
| Agent (Gia domain) | conversations on own leads | yes | yes, own leads |
| Manager (Gia domain) | the domain's conversations | yes | yes |
| Admin, founder | all | yes | yes |
| Tech workbench | the page opens; rows as RLS allows for their role | as RLS allows | as RLS allows |
| Concierge, finance, marketing, business | no (not in their route map) | | |
| Guest | redirected | | |

| Capability | Enforced by |
| ---------- | ----------- |
| Seeing conversations and messages | RLS + `can_access_wa_conversation(lead_id)` |
| Sending from the inbox | `wa_messages_outbound_insert` + the conversation read through RLS |
| Starting a conversation | the lead read through RLS, then an admin-client insert |
| Inbound writes | service role only (ingestion) |
| Media storage | admin client (private bucket); the page and action layer are the trust boundary |

Any manual send also takes the thread from the customer bot.

### 8.11 Known invariants

1. `whatsapp_messages` is append-only for every app role. The only UPDATE is `status` + `status_at`
   in `processStatusUpdate`, with the admin client.
2. `wa_message_id` uniqueness is a partial unique index (`WHERE wa_message_id IS NOT NULL`).
3. The webhook returns 200 for accepted or ignored events; 401 / 400 only for auth or parse
   failures. Its work runs in `after()` with `maxDuration = 180`.
4. `logNotification` stores the last four phone digits only, runs in `finally`, and is awaited.
5. Lead-assignment sends go through `notifyLeadAssigned` inside `after()` (ingestion uses a plain
   `await`, already inside `after()`). Never a bare `void` send.
6. `can_access_wa_conversation` follows the leads RLS; change them together.
7. No client component imports `whatsapp-api.ts`, `whatsapp-ingestion.ts` or `whatsapp-media.ts`;
   they use `lib/actions/whatsapp.ts`.
8. Realtime teardown is `supabase.removeChannel(channel)`; channels name `schema: 'gia'`.
9. Inbound inserts use the admin client; inbox sends use the session client under the outbound
   policy; the initiation uses the admin client.
10. The service files stay separate: session reads (`whatsapp-service`), HTTP sends
    (`whatsapp-api`), the admin pipeline (`whatsapp-ingestion`), storage (`whatsapp-media`), the
    orchestrator (`lead-assignment-notify`), the staff gate (`elaya-whatsapp`), the customer channel
    (`elaya-customer`).
11. The customer bot never talks over a human: `handleCustomerReply` is gated on `bot_active`, and
    every agent send turns it off. Bot rows are `sender_type = 'bot'`, `is_bot = true`. The customer
    toolset stays capped.
12. `whatsapp_notification_logs.type` is a 14-value CHECK (0177); extend it before logging a new
    type.
13. `media_url` is a storage path, never a CDN URL; reads sign it; signing never uses the session
    client.
14. Resolve/Reopen stays removed. The dead `status` column, its CHECK, the unread predicate and the
    `WHATSAPP_CONVERSATION_STATUS` constant are kept on purpose.
15. The WhatsApp tables live in `gia` and are queried through `giaDb()`; a sender name comes
    through the `gia.profiles` view, never a cross-schema embed.

### File index

| Area | Path |
| ---- | ---- |
| Page | `src/app/(dashboard)/whatsapp/page.tsx`, `loading.tsx` |
| Inbox UI | `src/components/whatsapp/` (`WhatsAppShell`, `ConversationList`, `ConversationPanel`, `MessageBubble`, `EmptyConversationState`, `WhatsAppConversationPeriodFilter`) |
| Shared UI | `src/components/ui/SplitWorkspace.tsx`, `ConversationRailRow.tsx`, `WaText.tsx`, `DictationButton.tsx` |
| Dossier card | `src/components/leads/LeadWhatsAppCard.tsx`, `LeadWhatsAppCardAsync.tsx` |
| Actions | `src/lib/actions/whatsapp.ts` |
| Services | `whatsapp-service.ts`, `whatsapp-api.ts`, `whatsapp-ingestion.ts`, `whatsapp-media.ts`, `lead-assignment-notify.ts`, `elaya-whatsapp.ts`, `elaya-customer.ts`; the lead bridge `lead-ingestion.ts` → `createLeadFromWhatsApp` |
| Validation | `src/lib/validations/whatsapp-schema.ts` (`SendMessageSchema`, `SendMediaMessageSchema`) |
| Constants | `src/lib/constants/whatsapp.ts` (outbound MIME allowlist, size cap, page size, `FOUNDER_LEAD_ALERTS_PAUSED`, `CUSTOMER_WELCOME_TEMPLATE_CONFIGURED`), `lib/utils/whatsapp-period.ts` |
| Types | `src/lib/types/whatsapp.ts` |
| Webhook | `src/app/api/webhooks/whatsapp/route.ts` |
| Migrations | 0032 to 0038, 0041, 0067, 0085, 0088, 0113, 0117, 0141, 0142, 0148, 0151, 0153, 0177 (log CHECK), 0210 (schema `gia`), 0212 / 0213 (`gia.profiles` view) |
