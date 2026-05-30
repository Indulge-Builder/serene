# src/components/leads — CLAUDE.md

All components in this folder are **display-only**. They receive data via props.
Zero DB calls. Zero business logic. Zero service imports.

Cross-feature data flows through `lib/` only.
Every modal composes `src/components/ui/modal.tsx` — never reimplements chrome.

---

## Component inventory

### LeadInfoCard

`LeadInfoCard.tsx` — `'use client'`

Props:
```
lead:            Lead
assigneeName:    string | null
adCreative?:     AdCreative | null    — resolved by the dossier page server component
canEdit?:        boolean              — enables click-to-edit for contact fields (agent/admin/founder)
canReassign?:    boolean              — enables inline reassignment (manager/admin/founder)
agents?:         { id: string; full_name: string }[]   — active agents for the lead's domain; pre-fetched by dossier page
```

Renders the left-column contact card on the lead dossier page.
Contains the `AttributionStrip` (UTM fields), `CampaignVideoModal` trigger logic, and `AssigneeCombobox`.

**Reassignment rules:**

- When `canReassign={true}`, the "Assigned to" field renders as `AssigneeCombobox` instead of a plain `InfoRow`.
- At rest `AssigneeCombobox` is visually identical to every other read-only field — no border, no box, no visible chevron.
- On hover: a dashed accent underline appears under the name text and a small `ChevronDown` fades in.
- On click: a dropdown opens with a search input (auto-focused) and a list of agents from the `agents` prop.
- Selecting an agent calls `assignLead` from `lib/actions/leads.ts`, optimistically updates `currentAssigneeName` in local state, and shows a `Check` tick for 2 seconds. No page reload needed.
- `canReassign` is derived server-side from `profile.role` — never computed in the component.
- `agents` is fetched once in the dossier page via `getAgentsForDomain(lead.domain)` and is `[]` for agent-role callers (the field falls back to read-only `InfoRow`).

**Ad creative trigger rules:**

- `utm_campaign` renders as an interactive `<span role="button">` only when `adCreative` is not null.
- Hover: `color → var(--theme-accent)`, `text-decoration-color → var(--theme-accent)`, 150ms transition.
- `ad_name` row appears and is also interactive when `adCreative.ad_name === lead.ad_name`.
- When `adCreative` is null, both fields render as plain static text — no cursor change, no hover affordance.

---

### CampaignVideoModal

`CampaignVideoModal.tsx` — `'use client'`

Props:
```
isOpen:       boolean
onClose:      () => void
campaignName: string
adCreative:   AdCreative
```

Composes `ui/modal.tsx` with `maxWidth="max-w-2xl"`.
Native `<video>` element only — no external video player library.
`autoPlay`, `muted`, `playsInline`, `controls` attributes always present.
`video.play()` called via ref after mount; `NotAllowedError` caught silently.
Framer Motion entrance is inherited from `ui/modal.tsx` (350ms, ease-out-expo).
Footer: `null` — video is the sole content.

---

### AddLeadModal

`AddLeadModal.tsx` — `'use client'`

Props:
```
open:          boolean
onClose:       () => void
callerProfile: { id: string; role: UserRole; domain: AppDomain; full_name: string }
initialAgents: { id: string; full_name: string }[]
onSuccess:     (leadId: string) => void
```

Fields: First name, Last name, Phone, Email, Source, Domain (manager+), Assign to.
Source stored in `form_data.manual_source`. `lead_intent` always null on manual leads.
Duplicate detection server-side; inline banner with dossier link on dup — modal stays open.

---

### LeadColumnPicker

`LeadColumnPicker.tsx` — `'use client'`

Props:
```
open:            boolean
onClose:         () => void
visibleColumns:  LeadColumnId[]
columnOrder:     LeadColumnId[]
toggleColumn:    (id: LeadColumnId) => void
reorderColumns:  (newOrder: LeadColumnId[]) => void
resetToDefaults: () => void
```

Drag-to-reorder via `@dnd-kit/sortable`. Locked columns (status, name) show `Lock` icon — not toggleable.
Entrance animation: `opacity 0→1, y -4→0`, 200ms, ease-out-expo.

---

### LeadNotesInput

`LeadNotesInput.tsx` — `'use client'`

Props:
```
leadId:       string
canAdd:       boolean    — same gate as canEditPersonalDetails on the dossier page
onNoteAdded?: () => void — optional callback fired after successful note post
```

Calls `addLeadNote` action. Submits via button click or ⌘+Enter. Uses `useTransition`.
Header uses `--color-info-dark-*` tokens to visually distinguish from the scratchpad (which uses `--theme-paper-subtle`). Note has `call_outcome = null` — it does NOT increment `call_count` or change `last_call_outcome`.

---

### StatusActionPanel — Revive flow

When `status === 'junk'`, a `Revive Lead` button (amber/warning style, Zap icon) appears.
Clicking opens a `ConfirmModal` that calls `updateLeadStatus('in_discussion')`.
All prior history (calls, notes, activities) is preserved.
SLA timers re-schedule automatically — the existing `updateLeadStatus` action handles this correctly because `in_discussion` is not in `TERMINAL_SLA_STATUSES`.
The Called button remains disabled for junk leads — revive first, then call.

---

## Service dependency map

| Component         | Service used (via prop, not import) |
|-------------------|--------------------------------------|
| LeadInfoCard      | `AdCreative` resolved by dossier page → `ad-creatives-service.ts` |
| AddLeadModal      | `createManualLead` action, `listAgentsForDomain` action |
| LeadColumnPicker  | none — props only |
| CampaignVideoModal| none — props only |
