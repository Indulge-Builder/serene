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
lead:          Lead
assigneeName:  string | null
adCreative?:   AdCreative | null    — resolved by the dossier page server component
```

Renders the left-column contact card on the lead dossier page.
Contains the `AttributionStrip` (UTM fields) and `CampaignVideoModal` trigger logic.

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

## Service dependency map

| Component         | Service used (via prop, not import) |
|-------------------|--------------------------------------|
| LeadInfoCard      | `AdCreative` resolved by dossier page → `ad-creatives-service.ts` |
| AddLeadModal      | `createManualLead` action, `listAgentsForDomain` action |
| LeadColumnPicker  | none — props only |
| CampaignVideoModal| none — props only |
