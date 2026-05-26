# The Gia

### Onboarding Module — Lead Ingestion, Routing & Lifecycle

> Gia is the CRM module that loads for the Onboarding domain.
> It is the first place a lead touches Eia — and the last place
> a lead lives before becoming a client.
>
> Every decision in Gia traces back to one principle:
> no lead falls through the cracks, no agent is overwhelmed,
> no UHNI prospect waits longer than they should.

---

## Table of Contents

1. [What Gia Is](#1-what-gia-is)
2. [Data Architecture](#2-data-architecture)
3. [Lead Ingestion — The Webhook](#3-lead-ingestion--the-webhook)
4. [Domain Resolution](#4-domain-resolution)
5. [Agent Assignment — Round Robin](#5-agent-assignment--round-robin)
6. [Lead Lifecycle & Status](#6-lead-lifecycle--status)
7. [The Lead Dossier Page](#7-the-lead-dossier-page)
8. [Call Logging](#8-call-logging)
9. [Notes System](#9-notes-system)
10. [Tasks on a Lead](#10-tasks-on-a-lead)
11. [Lead List & Access Control](#11-lead-list--access-control)
12. [The Full Flow — End to End](#12-the-full-flow--end-to-end)
13. [File Map](#13-file-map)

---

## 1. What Gia Is

Gia handles the complete journey of a lead — from the moment a form is submitted on a Meta ad, Google campaign, or website, through ingestion, validation, assignment, conversation, and resolution.

It is domain-scoped. An agent in `indulge_concierge` sees only concierge leads. A manager in `indulge_concierge` sees all concierge leads. No agent ever sees a lead outside their domain unless a cross-domain grant exists.

Gia does not replace WhatsApp or phone calls. It records them. The agent calls outside the system and comes back to Gia to log what happened.

---

## 2. Data Architecture

### Table: `leads`

```sql
-- Identity
id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid()
first_name          text          NOT NULL
last_name           text
email               text
phone               text          -- stored as E.164 always
domain              text          NOT NULL  -- indulge_concierge | indulge_shop | etc.

-- Assignment
assigned_to         uuid          REFERENCES profiles(id)
assigned_at         timestamptz

-- Status & Intent
status              text          NOT NULL DEFAULT 'new'
                                  -- new | touched | in_discussion | won
                                  -- nurturing | lost | junk
lead_intent         text          -- hot | cold

-- Campaign & UTM
campaign_id         text
ad_name             text
platform            text          -- meta | google | website
utm_source          text
utm_medium          text
utm_campaign        text
utm_content         text

-- Raw form data
form_data           jsonb         -- original form submission, immutable after insert

-- Call tracking
call_count          integer       NOT NULL DEFAULT 0
last_call_outcome   text          -- rnr | switched_off | wrong_number | conversing | other

-- Agent workspace
private_scratchpad  text          -- only visible to assigned agent + admin + founder
-- Timestamps
created_at          timestamptz   NOT NULL DEFAULT now()
updated_at          timestamptz   NOT NULL DEFAULT now()
archived_at         timestamptz   -- soft delete only. Never hard delete.
```

**Indexes:**

```sql
CREATE INDEX idx_leads_domain_status   ON leads(domain, status)  WHERE archived_at IS NULL;
CREATE INDEX idx_leads_assigned_to     ON leads(assigned_to)     WHERE archived_at IS NULL;
CREATE INDEX idx_leads_created_at      ON leads(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_leads_phone           ON leads(phone);
```

**RLS:**

```sql
-- Agents see only their own leads
-- Managers/Admin/Founder see all leads and filter based on domain
-- Cross-domain: only via active domain_access_grants
```

---

### Table: `lead_activities`

Append-only. No UPDATE or DELETE ever. The permanent audit trail.

```sql
id          uuid          PRIMARY KEY DEFAULT gen_random_uuid()
lead_id     uuid          NOT NULL REFERENCES leads(id)
actor_id    uuid          NOT NULL REFERENCES profiles(id)
action_type text          NOT NULL
            -- lead_created | status_changed | note_added
            -- agent_assigned | call_logged
details     jsonb         -- action-specific payload (see below)
created_at  timestamptz   NOT NULL DEFAULT now()
```

**Index:**

```sql
CREATE INDEX idx_lead_activities_lead_id
  ON lead_activities(lead_id, created_at DESC);
```

**`details` payloads by action_type:**

```json
// lead_created
{ "source": "meta", "campaign": "TG_Global_Q1", "domain": "indulge_concierge" }

// status_changed
{ "old_status": "new", "new_status": "touched" }

// note_added
{ "call_outcome": "rnr" }

// agent_assigned
{ "assigned_to": "<uuid>", "method": "round_robin" }

// call_logged
{ "outcome": "conversing", "call_count": 3 }
```

---

### Table: `lead_notes`

Append-only. Notes are never edited or deleted.

```sql
id          uuid          PRIMARY KEY DEFAULT gen_random_uuid()
lead_id     uuid          NOT NULL REFERENCES leads(id)
author_id   uuid          NOT NULL REFERENCES profiles(id)
content     text          NOT NULL    -- passes through sanitizeText() before insert
call_outcome text                     -- rnr | switched_off | wrong_number | conversing | other | null
created_at  timestamptz   NOT NULL DEFAULT now()
```

**Index:**

```sql
CREATE INDEX idx_lead_notes_lead_id
  ON lead_notes(lead_id, created_at DESC);
```

**Access rule:**

- All notes are visible to anyone with domain access to this lead.
- Private working thoughts go in `leads.private_scratchpad` — not here.

---

### Table: `agent_routing_config`

One row per agent. Controls round-robin eligibility.

```sql
id            uuid    PRIMARY KEY DEFAULT gen_random_uuid()
agent_id      uuid    NOT NULL REFERENCES profiles(id) UNIQUE
is_active     boolean NOT NULL DEFAULT true
shift_start   time                -- optional: 09:00
shift_end     time                -- optional: 18:00
updated_at    timestamptz NOT NULL DEFAULT now()
```

**`is_active`** is the holiday switch. Set to `false` and the agent is removed from the assignment pool instantly — no leads are routed to them until it is flipped back.

---

### Table: `tasks`

Core task table. Contains only universal fields shared across all modules. Never add module-specific columns here.

```sql
id              uuid          PRIMARY KEY DEFAULT gen_random_uuid()
assigned_to     uuid          NOT NULL REFERENCES profiles(id)
created_by      uuid          NOT NULL REFERENCES profiles(id)
module          text          NOT NULL    -- 'gia' | 'concierge' | 'finance' | etc.
task_type       text          NOT NULL    -- call | whatsapp_message | email | general_follow_up
status          text          NOT NULL DEFAULT 'pending'
                                          -- pending | done | cancelled
due_at          timestamptz
completed_at    timestamptz
created_at      timestamptz   NOT NULL DEFAULT now()
updated_at      timestamptz   NOT NULL DEFAULT now()
```

**Indexes:**

```sql
CREATE INDEX idx_tasks_assigned_to  ON tasks(assigned_to, due_at) WHERE status = 'pending';
CREATE INDEX idx_tasks_module        ON tasks(module)               WHERE status = 'pending';
```

---

### Table: `task_gia_meta`

Extension table for Gia-specific task fields. One row per task that belongs to the Gia module. Other modules never touch this table.

```sql
task_id         uuid          PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE
lead_id         uuid          NOT NULL REFERENCES leads(id)
call_outcome    text          -- populated if task_type = 'call' and task is completed
```

**Index:**

```sql
CREATE INDEX idx_task_gia_meta_lead_id ON task_gia_meta(lead_id);
```

**Pattern for future modules:** Each new module that needs task context gets its own extension table (`task_concierge_meta`, `task_finance_meta`, etc.). The core `tasks` table never changes. A module's extension table is invisible to all other modules.

---

## 3. Lead Ingestion — The Webhook

**Endpoint:** `POST /api/webhooks/leads`

**Auth:** Bearer token via `PABBLY_WEBHOOK_SECRET` environment variable. Validated before the payload is read. Returns 401 immediately if invalid — rule S-12.

**Source:** Pabbly acts as middleware between Meta Ads, Google Ads, and website forms. Eia never talks directly to Meta or Google.

**Rate limiting:** Applied at the route level — rule S-17.

---

### Validation & Sanitization

Lives in: `lib/services/lead-ingestion.ts`

```typescript
// Zod schema — all transforms applied here before any DB write
const LeadWebhookSchema = z.object({
  first_name: z.string().min(1).transform(sanitizeText),
  last_name: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v) : null)),
  email: z
    .string()
    .email()
    .optional()
    .transform((v) => v || null),
  phone: z.string().transform((v) => normalizeToE164(v, "IN")),
  utm_source: z
    .string()
    .optional()
    .transform((v) => v || null),
  utm_medium: z
    .string()
    .optional()
    .transform((v) => v || null),
  utm_campaign: z
    .string()
    .optional()
    .transform((v) => v || null),
  form_data: z.record(z.unknown()), // raw form, stored as-is
});
```

**Full name handling:** If `first_name` contains a space and `last_name` is absent, the ingestion service splits on the first space — `"Priya Sharma"` → `first_name: "Priya"`, `last_name: "Sharma"`.

**Phone normalisation:** `normalizeToE164()` from `lib/utils/phone.ts`. Default country: India (`IN`). Throws on invalid phone — the lead is rejected with a 422, logged to Sentry, not inserted.

**Text sanitisation:** `sanitizeText()` from `lib/utils/sanitize.ts` on every text field before insert.

**Empty string → null:** All optional fields transform empty strings to `null`. Never store empty strings in the database.

---

## 4. Domain Resolution

The domain of a lead is resolved from the `utm_campaign` field using a prefix mapping. This happens in `lib/services/lead-ingestion.ts` before the DB insert.

```typescript
// lib/constants/campaign-domain-map.ts
export const CAMPAIGN_DOMAIN_MAP: Record<string, string> = {
  TG_Global: "indulge_concierge",
  TG_Shop: "indulge_shop",
  TG_Legacy: "indulge_legacy",
  TG_House: "indulge_house",
  TG_B2B: "indulge_b2b",
};

// Resolution logic — prefix match
export function resolveDomainFromCampaign(campaignName: string | null): string {
  if (!campaignName) return "indulge_concierge"; // safe default
  const entry = Object.entries(CAMPAIGN_DOMAIN_MAP).find(([prefix]) =>
    campaignName.startsWith(prefix),
  );
  return entry ? entry[1] : "indulge_concierge";
}
```

**Fallback:** If no prefix matches, domain defaults to `indulge_concierge`. This is logged to Sentry as a warning so the campaign map can be updated.

---

## 5. Agent Assignment — Round Robin

**Rule:** Every lead is assigned to an agent in the same domain as the lead. An agent in `indulge_shop` never receives a lead from `indulge_concierge`.

**Eligibility pool:** Agents where:

- `profiles.domain = lead.domain`
- `agent_routing_config.is_active = true`
- `profiles.role = 'agent'`

**Algorithm:** Round-robin by `assigned_at` — the agent who was assigned a lead the longest ago goes next.

```sql
-- Find the next eligible agent in the domain
SELECT p.id
FROM profiles p
JOIN agent_routing_config arc ON arc.agent_id = p.id
WHERE p.domain    = $1          -- lead's domain
  AND p.role      = 'agent'
  AND arc.is_active = true
ORDER BY (
  SELECT MAX(assigned_at)
  FROM leads
  WHERE assigned_to = p.id
    AND archived_at IS NULL
) ASC NULLS FIRST               -- agents with no leads go first
LIMIT 1
```

**`is_active` holiday switch:**
When an agent goes on holiday, `agent_routing_config.is_active` is set to `false` by a manager or admin via a server action. From that moment, the agent receives no new leads. Existing leads remain assigned to them. When they return, `is_active` is flipped back to `true` and they re-enter the pool.

**Activity log on assignment:**

```typescript
// Written immediately after INSERT into leads
await logLeadActivity(leadId, systemActorId, "agent_assigned", {
  assigned_to: agentId,
  method: "round_robin",
});
```

---

## 6. Lead Lifecycle & Status

### Journey Statuses

```
new → touched → in_discussion → won
```

These are the forward progression statuses. A lead moves through them in order. Skipping is allowed (new → in_discussion is valid if the first call goes deep).

### Resolution Statuses

```
nurturing | lost | junk
```

These are terminal or holding states. A lead can enter these from any journey status.

### Status Definitions

| Status          | Meaning                              | Auto-action                                  |
| --------------- | ------------------------------------ | -------------------------------------------- |
| `new`           | Lead arrived, not yet called         | —                                            |
| `touched`       | First call attempt made              | Auto-set on first call log                   |
| `in_discussion` | Active conversation in progress      | —                                            |
| `won`           | Converted to client                  | Creates client record + finance notification |
| `nurturing`     | Not ready now, follow up in 3 months | Auto-creates task (due: now + 3 months)      |
| `lost`          | Will not convert                     | Logs reason                                  |
| `junk`          | Invalid lead (wrong number, spam)    | Logs reason                                  |

### Status Transition Rules

Every transition is handled by `lib/actions/leads.ts`:

1. Updates `leads.status`
2. Writes to `lead_activities` (`status_changed`, `old_status`, `new_status`)
3. Fires side effects (see below)

**Side effects:**

`won` →

- Inserts row into `clients` table with `lead_origin_id` FK

`nurturing` →

- Auto-creates task: `task_type: general_follow_up`, `due_date: now() + interval '3 months'`

`lost` / `junk` →

- Requires `reason` field — stored in `lead_activities.details`

---

## 7. The Lead Dossier Page

**Route:** `app/(dashboard)/leads/[id]/page.tsx`

The dossier is the full-detail view of a single lead. It is assembled from multiple async components so fast sections render immediately without waiting for slow ones.

### Component Layout

```
┌──────────────────────────────────────────────────────────┐
│  StatusActionPanel                                        │
│  [ Called ] [ Lost ] [ Junk ] [ Won ] [ Nurture ]        │
├──────────────────────────────────────────────────────────┤
│  LeadInfoCard                    │  AgentScratchpad       │
│  Name, phone, email, intent,     │  Private notes         │
│  tags, domain, campaign          │  (assigned agent only) │
├──────────────────────────────────┤                        │
│  DynamicFormResponses            │                        │
│  Raw form_data rendered          │                        │
├──────────────────────────────────┴────────────────────────┤
│  LeadJourneyTimeline                                      │
│  Visual stage path with dwell times                       │
├───────────────────────────────────────────────────────────┤
│  LeadDossierTasksAsync                                    │
│  Next due task                                            │
├───────────────────────────────────────────────────────────┤
│  LeadNotesSection                                         │
│  Timeline of all call notes (common + private where       │
│  permitted)                                               │
└───────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**`StatusActionPanel`**
Displays action buttons based on current status. Called, Lost, Junk, Won, Nurture. Each button triggers the appropriate server action. Primary action (Called) is always the most prominent — it is what agents do most.

**`LeadInfoCard`**
Read-only display of contact fields, demographics, lead intent (hot/cold), tags, domain, source platform. Inline edit for fields the agent is permitted to change.

**`AgentScratchpad`**
Private textarea. Visible only to the assigned agent, admin, and founder. Auto-saves on 1s debounce. Persisted to `leads.private_scratchpad`. Not in `lead_notes` — this is not a log, it is a working space.

**`LeadNotesSection`**
Chronological timeline of all `lead_notes` rows for this lead. All notes are visible to anyone with domain access. Notes written via `CalledModal` display the call outcome alongside the note content.

**`LeadJourneyTimeline`**
Visual representation of the lead's path through statuses. Shows dwell time at each stage (calculated from `lead_activities` timestamps). Built from `leadJourneyStages.ts`.

**`LeadDossierTasksAsync`**
Shows the next due task on this lead. Async component — does not block the rest of the dossier from rendering.

**`DynamicFormResponses`**
Renders `leads.form_data` (JSONB) as a human-readable list of field → value pairs. The raw form submission, always visible for reference.

---

## 8. Call Logging

When an agent calls a lead, they click the **Called** button in `StatusActionPanel`. This opens `CalledModal.tsx`.

### CalledModal Flow

1. Agent picks a call outcome from the dropdown
2. Agent types a note (optional but encouraged)
3. Agent submits

### Call Outcomes

| Value          | Label              |
| -------------- | ------------------ |
| `rnr`          | Rang, no response  |
| `switched_off` | Phone switched off |
| `wrong_number` | Wrong number       |
| `conversing`   | Had a conversation |
| `other`        | Other              |

### Server Action: `addLeadCallNote`

Lives in: `lib/actions/leads.ts`

```typescript
// Zod schema
const AddCallNoteSchema = z.object({
  leadId: z.string().uuid(),
  content: z.string().min(1).transform(sanitizeText),
  callOutcome: z.enum([
    "rnr",
    "switched_off",
    "wrong_number",
    "conversing",
    "other",
  ]),
});

// What the action does (in order):
// 1. Validate with Zod (first line, always)
// 2. Auth check — confirm caller has access to this lead
// 3. INSERT into lead_notes (append-only)
// 4. UPDATE leads SET call_count = call_count + 1,
//                     last_call_outcome = $outcome,
//                     updated_at = now()
// 5. If lead.status = 'new' → UPDATE leads SET status = 'touched'
//    (auto-advance on first call — only fires when status is new)
// 6. INSERT into lead_activities (call_logged + note_added)
// 7. Return { data, error }
```

**Auto-advance rule:** The first call on a `new` lead automatically sets status to `touched`. This is the only automatic status transition that does not require an explicit agent action. It happens inside `addLeadCallNote` — if `lead.status === 'new'`, the action sets it to `touched` and logs a `status_changed` activity alongside the `call_logged` activity.

---

## 9. Notes System

One type. One principle: notes are never edited or deleted.

### Notes

- Written by any agent or manager with domain access to the lead
- Written via the notes UI on the dossier, or attached to a call via `CalledModal`
- Visible to: anyone with domain access to this lead
- May include a `call_outcome` value when written via `CalledModal`
- Display: shown in `LeadNotesSection` as a chronological timeline

**The scratchpad is not notes.** `leads.private_scratchpad` is a live working space — a textarea the agent uses like a Post-it note. It is not append-only. It is not logged. It saves on debounce. It is for the assigned agent's eyes only (+ admin).

**On reassignment:** `leads.private_scratchpad` is cleared when a lead is reassigned. The incoming agent starts with a blank scratchpad. If the outgoing agent wants to pass context forward, they write a note before the reassignment — that stays on record permanently.

---

## 10. Tasks on a Lead

Tasks on a lead come from three sources.

### Source 1 — Auto-created on Nurturing

When a lead status transitions to `nurturing`, a task is automatically created:

```
task_type: general_follow_up
due_date:  now() + interval '3 months'
lead_id:   this lead
assigned_to: the lead's current assigned agent
```

### Source 2 — Auto-created by retry scheduling

When an agent logs a call with outcome `rnr` or `switched_off`, they can schedule a retry (mandatory). This creates:

```
task_type: call
due_date:  agent-selected date/time
lead_id:   this lead
assigned_to: the lead's current assigned agent
```

### Source 3 — Manually created

An agent can create a task directly from the dossier. Supported types:

| `task_type`         | Description         |
| ------------------- | ------------------- |
| `call`              | Scheduled call      |
| `whatsapp_message`  | WhatsApp follow-up  |
| `email`             | Email follow-up     |
| `general_follow_up` | Any other follow-up |

Tasks are displayed in `LeadDossierTasksAsync` — showing only the next due task inline on the dossier. The full task list is in the Tasks module.

---

## 11. Lead List & Access Control

**Route:** `app/(dashboard)/leads/page.tsx`
**Component:** `LeadsTable.tsx`

### Access Rules

| Role      | Sees                                                     |
| --------- | -------------------------------------------------------- |
| `agent`   | Only leads assigned to them (`assigned_to = auth.uid()`) |
| `manager` | All leads in their domain                                |
| `admin`   | All leads in all domains                                 |
| `founder` | All leads in all domains                                 |

These rules are enforced at two layers:

1. RLS policy on the `leads` table
2. Service function in `lib/services/leads-service.ts` — filters by role before querying

### Filters Available

| Filter         | Options                                                       |
| -------------- | ------------------------------------------------------------- |
| Status         | new / touched / in_discussion / won / nurturing / lost / junk |
| Campaign       | dropdown of distinct `utm_campaign` values                    |
| Source         | meta / google / website                                       |
| Date range     | created_at between X and Y                                    |
| Assigned agent | dropdown of agents in domain                                  |
| Search         | matches on first_name, last_name, phone, email                |

### Table Columns

```
Status pill | Name | Phone | Campaign | Assigned to | Created | Last outcome
```

On mobile: card stack — each lead becomes a card with name, status, phone, and last outcome visible.

---

## 12. The Full Flow — End to End

```
INGESTION
─────────
Webhook arrives (Meta / Google / Website via Pabbly)
→ Validate Bearer token (reject 401 if invalid)
→ Parse + validate with Zod (reject 422 if invalid)
→ sanitizeText() on text fields
→ normalizeToE164() on phone
→ Resolve domain from campaign_name prefix
→ INSERT into leads (status = 'new')
→ LOG lead_created activity
→ Notify agent via WhatsApp (non-blocking)

FIRST CONTACT
─────────────
Agent receives WhatsApp notification
→ Opens lead dossier in Eia
→ Calls the lead (outside Eia)
→ Clicks Called → CalledModal opens
→ Selects outcome + writes note
→ Submits → addLeadCallNote() server action:
     INSERT lead_notes
     UPDATE call_count++, last_call_outcome
     if status = 'new' → UPDATE status = 'touched'
     LOG call_logged + note_added activities
→ Agent may schedule retry task

PROGRESSION
───────────
Agent updates status as lead warms:
→ touched → in_discussion
   Each transition: UPDATE leads.status + LOG status_changed

RESOLUTION
──────────
Won:
→ UPDATE leads.status = 'won'
→ LOG status_changed
→ INSERT into clients (lead_origin_id = lead.id)

Nurturing:
→ UPDATE leads.status = 'nurturing'
→ LOG status_changed
→ Auto-create task (general_follow_up, due: +3 months)

Lost:
→ UPDATE leads.status = 'lost'
→ UPDATE leads.notes = 'reason'
→ LOG status_changed with reason

Junk:
→ UPDATE leads.status = 'junk'
→ UPDATE leads.notes = 'reason'
→ LOG status_changed with reason

AUDIT TRAIL
───────────
Everything above leaves an immutable row in lead_activities.
No UPDATE or DELETE ever runs on lead_activities or lead_notes.
The full history of every lead is always recoverable.
```

---

## 13. File Map

```
src/
├── app/
│   └── (dashboard)/
│       └── leads/
│           ├── page.tsx                      ← lead list
│           └── [id]/
│               └── page.tsx                  ← lead dossier
│
├── components/
│   └── leads/
│       ├── LeadsTable.tsx                    ← lead list table
│       ├── LeadInfoCard.tsx                  ← contact + demo fields
│       ├── StatusActionPanel.tsx             ← Called/Lost/Won/Nurture/Junk
│       ├── CalledModal.tsx                   ← call outcome + note entry
│       ├── LeadNotesSection.tsx              ← notes timeline
│       ├── AgentScratchpad.tsx               ← private working space
│       ├── LeadJourneyTimeline.tsx           ← visual stage path
│       ├── LeadDossierTasksAsync.tsx         ← next due task
│       └── DynamicFormResponses.tsx          ← raw form_data renderer
│
├── lib/
│   ├── actions/
│   │   └── leads.ts                         ← all lead mutations
│   │       addLeadCallNote()
│   │       updateLeadStatus()
│   │       assignLead()
│   │       updateAgentActiveStatus()
│   │
│   ├── services/
│   │   ├── leads-service.ts                 ← all lead queries
│   │   │   getLeadById()
│   │   │   getLeadsForAgent()
│   │   │   getLeadsForDomain()
│   │   │   getNextRoundRobinAgent()
│   │   └── lead-ingestion.ts                ← webhook validation + routing
│   │       validateAndSanitizeWebhookPayload()
│   │       resolveDomainFromCampaign()
│   │       assignLeadRoundRobin()
│   │
│   ├── validations/
│   │   └── lead-schema.ts                   ← Zod schemas for all lead actions
│   │
│   └── constants/
│       ├── lead-statuses.ts                 ← status enums + badge config
│       ├── call-outcomes.ts                 ← outcome enums + labels
│       ├── task-types.ts                    ← task_type enums
│       └── campaign-domain-map.ts           ← prefix → domain mapping
│
└── app/
    └── api/
        └── webhooks/
            └── leads/
                └── route.ts                 ← POST handler, auth + rate limit
```

---

---

## 14. WhatsApp

WhatsApp is the second ingestion channel into Gia — alongside the webhook from Meta/Google/website forms.

Any message that arrives on the company WhatsApp Business number from an unknown contact creates a lead automatically. The agent works that lead the same way as any other — through the dossier, with the same status lifecycle, tasks, and notes. The only difference is the origin.

There are two parts to this system:

1. **Ingestion** — inbound messages from unknown numbers create leads via the Meta WhatsApp Business API
2. **The WhatsApp Page** — a full in-app messaging interface where agents read and reply to all WhatsApp conversations without leaving Eia

A third part is planned but not built yet:

3. **The AI Chatbot** — a Claude-powered assistant that engages the lead automatically while the agent is reaching them by phone (described at the end of this section)

---

### 14.1 How Ingestion Works

The company WhatsApp number is connected to the **Meta WhatsApp Business API**. All inbound messages are delivered to Eia via a webhook.

**Endpoint:** `POST /api/webhooks/whatsapp`

**Auth:** Verified using Meta's webhook signature (`X-Hub-Signature-256` header). Requests without a valid signature are rejected with 401 before the payload is read.

**Flow on inbound message:**

```
Message arrives on company number
→ Verify Meta signature (reject 401 if invalid)
→ Extract sender phone (wa_id) + message content
→ Normalise phone to E.164 (same as lead webhook)
→ Check: does a lead already exist with this phone?

  IF YES → attach message to existing lead conversation
            no new lead created

  IF NO  → INSERT into leads:
              first_name: wa_id (temporary, until agent updates)
              phone:      normalised E.164
              domain:     'indulge_concierge' (default — agent can reassign)
              status:     'new'
              source:     'whatsapp'
            LOG lead_created activity
            Notify assigned agent via internal notification
```

**Duplicate guard:** Phone is the deduplication key. If a lead with that E.164 number already exists in any status (including `won`, `lost`, `junk`), the message is threaded into that lead's conversation — a second lead is never created for the same number.

**Domain assignment:** WhatsApp leads cannot carry UTM data, so domain resolution from campaign prefix is not possible. All WhatsApp leads default to `indulge_concierge`. An agent or manager can manually reassign the domain from the dossier once they understand the intent of the enquiry.

---

### 14.2 Data Architecture — WhatsApp Tables

#### Table: `whatsapp_conversations`

One row per unique phone number / lead. The container for a conversation thread.

```sql
id              uuid          PRIMARY KEY DEFAULT gen_random_uuid()
lead_id         uuid          NOT NULL REFERENCES leads(id) UNIQUE
wa_id           text          NOT NULL UNIQUE   -- sender's WhatsApp ID (E.164 without +)
phone           text          NOT NULL          -- E.164 with +, matches leads.phone
status          text          NOT NULL DEFAULT 'open'
                                                -- open | resolved
last_message_at timestamptz
created_at      timestamptz   NOT NULL DEFAULT now()
updated_at      timestamptz   NOT NULL DEFAULT now()
```

**Indexes:**

```sql
CREATE INDEX idx_wa_conversations_lead_id        ON whatsapp_conversations(lead_id);
CREATE INDEX idx_wa_conversations_last_message   ON whatsapp_conversations(last_message_at DESC)
  WHERE status = 'open';
```

---

#### Table: `whatsapp_messages`

Append-only. Every message in both directions is stored here. Never updated or deleted.

```sql
id              uuid          PRIMARY KEY DEFAULT gen_random_uuid()
conversation_id uuid          NOT NULL REFERENCES whatsapp_conversations(id)
lead_id         uuid          NOT NULL REFERENCES leads(id)
direction       text          NOT NULL    -- inbound | outbound
sender_type     text          NOT NULL    -- lead | agent | bot
sender_id       uuid                      -- profiles(id) if agent/bot, null if lead
wa_message_id   text          UNIQUE      -- Meta's message ID, for dedup + status tracking
message_type    text          NOT NULL    -- text | image | video | document | audio | template
content         text                      -- text body, or caption for media
media_url       text                      -- signed URL for media messages (images, video, docs)
media_mime_type text                      -- e.g. image/jpeg, application/pdf
status          text                      -- sent | delivered | read | failed (outbound only)
status_at       timestamptz               -- when the last status update arrived
is_bot          boolean       NOT NULL DEFAULT false
created_at      timestamptz   NOT NULL DEFAULT now()
```

**Indexes:**

```sql
CREATE INDEX idx_wa_messages_conversation_id
  ON whatsapp_messages(conversation_id, created_at ASC);
CREATE INDEX idx_wa_messages_lead_id
  ON whatsapp_messages(lead_id, created_at DESC);
CREATE INDEX idx_wa_messages_wa_message_id
  ON whatsapp_messages(wa_message_id);   -- for webhook dedup
```

**Append-only rule:** Same as `lead_notes` and `lead_activities`. No UPDATE or DELETE ever runs on `whatsapp_messages`. Message status updates (`delivered`, `read`, `failed`) are written to the `status` and `status_at` columns on the existing row — this is the only mutation allowed.

---

### 14.3 The WhatsApp Page

**Route:** `app/(dashboard)/whatsapp/page.tsx`

The WhatsApp page is a full messaging interface built into Eia. It looks and works like WhatsApp Web. Agents never need to open their phone or switch apps.

#### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  WhatsApp                                          [ Search ]    │
├──────────────────────┬──────────────────────────────────────────┤
│  Conversation List   │  Chat Window                             │
│  ─────────────────   │  ─────────────────────────────────────   │
│  [ Lead Name ]       │  ┌──────────────────────────────────┐   │
│  last message...     │  │  Lead: Hey I saw your ad...       │   │
│  [ Lead Name ]       │  │  Agent: Hi! Thanks for reaching.. │   │
│  last message...     │  │  ...                              │   │
│  [ Lead Name ]       │  │                                   │   │
│  ...                 │  └──────────────────────────────────┘   │
│                      │  [ Type a message...          ] [Send]   │
└──────────────────────┴──────────────────────────────────────────┘
```

#### Conversation List (left panel)

- Shows all `whatsapp_conversations` the agent has access to (same domain-scoping as leads)
- Sorted by `last_message_at DESC` — most recent activity at the top
- Each row shows: lead name (or phone if name not yet set), last message preview, timestamp, unread indicator
- Unread count badge on conversations with inbound messages the agent hasn't opened

#### Chat Window (right panel)

- Full message history for the selected conversation, oldest at top, newest at bottom
- Inbound messages (from lead) appear on the left. Outbound (from agent or bot) on the right
- Bot messages show a bot indicator so agents know what was sent on their behalf
- Media messages render inline — images display directly, documents show a download link, video shows a thumbnail
- Message status indicators on outbound messages: sent → delivered → read (tick marks)

#### Sending a Message

```typescript
// Agent types and hits send → sendWhatsAppMessage() server action
// lib/actions/whatsapp.ts

// What the action does:
// 1. Validate with Zod
// 2. Auth check — agent has access to this lead
// 3. POST to Meta WhatsApp Business API → sends message to lead
// 4. INSERT into whatsapp_messages (direction: outbound, sender_type: agent)
// 5. UPDATE whatsapp_conversations SET last_message_at = now()
// 6. Return { data, error }
```

#### Access Control

| Role      | Sees                                     |
| --------- | ---------------------------------------- |
| `agent`   | Conversations for leads assigned to them |
| `manager` | All conversations in their domain        |
| `admin`   | All conversations across all domains     |
| `founder` | All conversations across all domains     |

RLS mirrors the `leads` table exactly. A conversation is visible under the same conditions as its parent lead.

---

### 14.4 Webhook: Inbound Messages & Delivery Receipts

Meta sends two types of events to the same webhook endpoint:

**Type 1 — New message (inbound)**

```typescript
// Arrives when lead sends a message
// lib/services/whatsapp-ingestion.ts

// Flow:
// 1. Verify signature
// 2. Extract wa_id, message content, message type, wa_message_id
// 3. Check whatsapp_messages for wa_message_id → skip if already exists (dedup)
// 4. Resolve lead by phone
//    → found:  get or create whatsapp_conversations row
//    → not found: INSERT lead + INSERT whatsapp_conversations
// 5. INSERT whatsapp_messages (direction: inbound, sender_type: lead)
// 6. UPDATE whatsapp_conversations SET last_message_at = now()
// 7. Push real-time event to agent via Supabase Realtime
// 8. Return 200 immediately — all processing is non-blocking after signature check
```

**Type 2 — Status update (delivery receipt)**

```typescript
// Arrives when a message is delivered or read
// Updates the status column on the existing outbound message row
// This is the only UPDATE allowed on whatsapp_messages

UPDATE whatsapp_messages
SET status = $status,   -- 'delivered' | 'read' | 'failed'
    status_at = now()
WHERE wa_message_id = $wa_message_id
```

**Always return 200 to Meta.** If the webhook returns anything other than 200, Meta will retry. Process errors internally (log to Sentry) but always acknowledge receipt.

---

### 14.5 Lead Dossier Integration

A lead that originated from WhatsApp, or has any WhatsApp messages, shows a **WhatsApp thread panel** on their dossier — the last 5 messages with a link to the full conversation on the WhatsApp page.

The lead's `source` field is set to `'whatsapp'` at ingestion and displayed on `LeadInfoCard` alongside the platform badge (Meta / Google / Website / WhatsApp).

---

### 14.6 The AI Chatbot — Planned, Not Built

> This section describes the intended architecture. Implementation comes after the core WhatsApp page is stable.

**What it does:**

When a new WhatsApp lead comes in, the chatbot activates automatically and starts a conversation with the lead. Its job is to introduce the company, answer questions about services, and send relevant collateral — brochures, images, video links — while the agent is reaching the lead by phone. By the time the agent connects, the lead already knows who we are.

**Architecture:**

```
Inbound WhatsApp message
→ Check: is bot active for this conversation?
   → YES: route to bot handler
   → NO:  deliver to agent inbox as normal

Bot handler:
→ Fetch conversation history from whatsapp_messages
→ Fetch company knowledge base (RAG — Supabase pgvector)
→ Call Claude API with:
     system:  company persona + instructions
     context: retrieved knowledge chunks
     history: last N messages
→ Claude returns response
→ POST reply to Meta WhatsApp Business API
→ INSERT into whatsapp_messages (sender_type: bot, is_bot: true)
```

**Bot on/off per conversation:**

```sql
-- Add to whatsapp_conversations
bot_active      boolean       NOT NULL DEFAULT true
bot_paused_by   uuid                    REFERENCES profiles(id)
bot_paused_at   timestamptz
```

When an agent sends a manual message from the WhatsApp page, `bot_active` is set to `false` for that conversation. The agent has taken over — the bot steps back. The agent can re-enable the bot from the conversation header if needed.

**Knowledge base (RAG):**

```sql
-- Separate table, not part of leads schema
whatsapp_bot_knowledge
  id              uuid    PRIMARY KEY
  title           text    NOT NULL    -- e.g. "Concierge Service Overview"
  content         text    NOT NULL    -- full text chunk
  embedding       vector(1536)        -- pgvector, from text-embedding-3-small
  media_url       text                -- optional: brochure PDF, image, video link
  media_type      text                -- pdf | image | video
  domain          text                -- which service domain this chunk belongs to
  created_at      timestamptz
```

Chunks are embedded at upload time. At query time, the lead's message is embedded and the top-k nearest chunks are retrieved and passed to Claude as context.

**What the bot can send:**

- Text responses about company services, process, pricing ranges
- Brochure PDFs (`media_type: document`)
- Property / product images (`media_type: image`)
- Video links (`media_type: video` — sent as a text link, not a raw video file)

**What the bot never does:**

- Quotes specific prices or makes commitments
- Handles objections or complaints — hands off to agent immediately
- Continues talking after the agent has manually entered the conversation

**File map additions (when built):**

```
lib/
├── services/
│   └── whatsapp-bot.ts          ← bot handler, RAG retrieval, Claude call
├── actions/
│   └── whatsapp.ts              ← sendWhatsAppMessage(), toggleBot()
└── services/
    └── whatsapp-ingestion.ts    ← inbound webhook handler

app/
└── (dashboard)/
    └── whatsapp/
        ├── page.tsx             ← WhatsApp page (conversation list + chat)
        └── [id]/
            └── page.tsx         ← direct link to a specific conversation

components/
└── whatsapp/
    ├── ConversationList.tsx     ← left panel
    ├── ChatWindow.tsx           ← right panel, message thread
    ├── MessageBubble.tsx        ← single message, handles all types
    ├── MediaMessage.tsx         ← image / doc / video rendering
    └── BotStatusToggle.tsx      ← on/off switch in conversation header
```

## 15. Decision Log

| Date | Decision                      | Chosen                                                                                                                                                                     | Why                                                                                                                                                                                                                          |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | Notes: private vs common type | Removed `note_type` enum entirely. All notes in `lead_notes` are visible to anyone with domain access. Private working thoughts belong in `leads.private_scratchpad` only. | Scratchpad already covers the private use case. Splitting notes into two visibility tiers adds RLS complexity, a lock icon to build, and a choice agents don't need to make on every note.                                   |
| —    | Scratchpad on reassignment    | Clear `private_scratchpad` when lead is reassigned                                                                                                                         | Scratchpad is named and designed as private to the assigned agent. Passing it to the next agent violates that contract. If context needs to transfer, the outgoing agent writes a note before reassignment.                  |
| —    | Task architecture             | Core `tasks` table + per-module extension tables (`task_gia_meta`, etc.)                                                                                                   | A single god table with nullable module-specific columns becomes unmaintainable at scale. Extension tables isolate module concerns — adding or deprecating a module never touches the core table or any other module's data. |
