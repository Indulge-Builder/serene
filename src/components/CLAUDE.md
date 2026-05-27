# Components CLAUDE.md

## List page header (reference implementation)

`src/app/(dashboard)/leads/page.tsx` establishes the canonical list-page header pattern:

- **Left:** `.type-page-title` (Playfair, light, primary). Optional `.type-eyebrow` above the title when a domain/module label is needed — not used on the leads page.
- **Right:** page actions (Add Lead, etc.).

Status summary pills live in `LeadsTable.tsx` toolbar (left of column picker), not in the page header. Derived from the `leads` prop; `.status-pill` utilities in `design-tokens.css`; `hidden md:flex`.

## Labelled datum row (read-only detail fields)

Standard layout for every read-only field in detail cards (dossiers, profile sections, audit panels).

```
[Icon w-4 h-4]  [Micro-label]     ← --text-2xs, semibold, widest tracking, uppercase, tertiary
                [Value]           ← --text-sm, normal weight, primary (tertiary when empty/—)
```

- Row: `flex items-center gap-3`. Icon is `flexShrink: 0`, colour `var(--theme-text-tertiary)`, `strokeWidth={1.5}`.
- Label + value stack: `flex-col` with `gap: 0.125rem` to the right of the icon.
- Technical values (phone, IDs, timestamps): value uses `var(--font-mono)`.
- Multi-field grids: `grid-cols-2`, `columnGap: var(--space-6)`, `rowGap: var(--space-5)`. Identity fields may `gridColumn: 1 / -1`.
- Separate visual groups with a full-width `1px` rule using `var(--theme-paper-border)` — no sub-headings.
- Reference implementation: `DatumRow` / `DatumValue` in `src/components/leads/LeadInfoCard.tsx`.
- Never hardcode icon colours. Never use `font-bold` / weight 700. Empty values show `—` in tertiary.

## Modal Rule

Every modal in Eia **must compose** `src/components/ui/modal.tsx`. Never reimplement modal chrome.

Modal props contract:
```
open:      boolean          — controls visibility
onClose:   () => void       — fired on Escape, backdrop click, or explicit close
title:     string           — rendered in modal header
children:  React.ReactNode  — body slot
footer:    React.ReactNode  — footer slot (rendered right-aligned)
maxWidth?: string           — Tailwind max-width class (default: "max-w-lg")
```

## AddLeadModal

`src/components/leads/AddLeadModal.tsx`

Props:
```
open:          boolean
onClose:       () => void
callerProfile: { id: string; role: UserRole; domain: AppDomain; full_name: string }
initialAgents: { id: string; full_name: string }[]   — pre-fetched at page level for caller's domain
onSuccess:     (leadId: string) => void
```

**Fields (in order):** First name, Last name, Phone, Email, Source, Domain (manager+ only), Assign to.

**Source field:** optional `<select>` — WhatsApp, Website, Meta, Google, Referral, YPO, Events. Stored in `form_data.manual_source`. `lead_intent` is always `null` on manual leads.

**Agent-domain enforcement rule:**
- Agents never see the Domain field — domain is always locked to `callerProfile.domain`.
- Agents never see the Assign-to select — rendered as a read-only display chip showing their own name.
- The server action (`createManualLead`) enforces `domain = caller.domain` on the server regardless of what the form sends.
- Managers/admins/founders see both Domain and Assign-to fields. When the domain changes, `listAgentsForDomain` is called to repopulate the agent dropdown.

**Duplicate phone handling:**
- Duplicate detection runs server-side via `get_active_lead_by_phone()`.
- When a duplicate is detected, the modal does NOT close. An inline warning banner appears with a link to the existing lead.
- The action returns `{ data: { leadId, duplicate: true }, error: null }` — never a silent insert.

## LeadColumnPicker

`src/components/leads/LeadColumnPicker.tsx`

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

Display-only. Zero business logic. Calls `useLeadColumnPreferences` indirectly via its props.
Locked columns (status, name) render a `Lock` icon — not toggleable, not draggable.
Drag-to-reorder via `@dnd-kit/sortable`. Transform-only animation (no width/height/padding).
Entrance animation: `opacity 0→1, y -4→0` over 200ms with `ease-out-expo`.

## useLeadColumnPreferences hook

`src/hooks/useLeadColumnPreferences.ts`

```
useLeadColumnPreferences(userId: string) → {
  visibleColumns:  LeadColumnId[]
  columnOrder:     LeadColumnId[]
  toggleColumn:    (id: LeadColumnId) => void
  reorderColumns:  (newOrder: LeadColumnId[]) => void
  resetToDefaults: () => void
}
```

Persists to `localStorage` under key `eia:leads:columns:${userId}:v1`.
Validates stored ids against the registry on load — unrecognised ids are silently dropped.
Locked columns are always in `visibleColumns` regardless of stored value.
Never touches Supabase. Never debounces — localStorage writes are synchronous.
