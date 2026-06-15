# Intelligence Components — CLAUDE.md

Call Intelligence / Helpdesk surface components. Full feature spec:
`docs/modules/call-intelligence.md` (§6–§9). Reads go through
`lib/services/intelligence-service.ts`; writes through `lib/actions/intelligence.ts`.
All components here are display-only (A-06) **except** the admin/founder write
affordances noted below, which only OPEN a form — the mutation lives in the action.

## Component map

| Component | File | Responsibility |
| --- | --- | --- |
| `CaseCard` | `CaseCard.tsx` | Stacked preview card — the dossier `ServiceInterestCard` row. Display-only. |
| `CaseListRow` | `CaseListRow.tsx` | `/helpdesk` list row → opens `CaseDetailModal`. Card-list hover pattern, keyboard-activatable. Display-only. |
| `CaseDetailModal` | `CaseDetailModal.tsx` | Full detail view of one `service_cases` row (composes `ui/modal.tsx`). Shows everything saved on the case. **`canEdit?`** (admin/founder) adds an Edit button in the modal footer that opens `AddSuggestionModal` prefilled in edit mode — see the rule below. |
| `CategoryTag` | `CategoryTag.tsx` | THE static category pill — shared by `CaseCard`, `CaseListRow`, `CaseDetailModal`. Not the filter button. |
| `CategoryPill` | `CategoryPill.tsx` | Single category **filter** button (active/inactive). `HelpdeskSearch`'s pill row. |
| `HookList` | `HookList.tsx` | Conversation-hooks list (numbered items). |
| `HelpdeskSearch` | `HelpdeskSearch.tsx` | `'use client'` — owns query + category state and the entire client-side filter pipeline (no server round-trips per keystroke; `caseMatchesQuery` from `lib/utils/case-search.ts`). Mounts `CaseDetailModal`. Threads `canEdit` down. |
| `AddSuggestionButton` | `AddSuggestionButton.tsx` | `+ Suggestion` header CTA on `/helpdesk` (admin/founder only). Loads `AddSuggestionModal` on intent. |
| `AddSuggestionModal` | `AddSuggestionModal.tsx` | THE create-OR-edit form for a `service_cases` row. See the rule below. |
| `category-icons.ts` | — | category → Lucide icon map. |

## Create AND edit share ONE form, ONE action (R-01)

`AddSuggestionModal` is THE only suggestion form. It serves **both** create and edit —
**never fork an `EditSuggestionModal`.**

- Pass **`serviceCase?: ServiceCase`** to open in edit mode. The seed-on-open effect prefills
  every field from the row; submit carries the row's `id` (and preserves `sort_order`) into the
  same `upsertServiceCaseAction`, which **UPDATEs when `id` is set** (`ServiceCaseSchema.id` is
  optional). Heading → "Edit Suggestion", CTA → "Save Changes", toast → "Suggestion updated".
- Omit `serviceCase` and it is the create flow — unchanged.
- Never add a second action, a second schema, or a second form. The action owns Zod,
  `requireProfile(['admin','founder'])`, `sanitizeText`, the helpdesk Redis-key del, and
  `revalidatePath('/helpdesk')`. The modal closes on success; the refreshed RSC payload re-seeds
  the list/library — **never merge the row into client state manually.**

## Edit affordance gating — server is the gate, the hide is cosmetic

The `service_cases` write path is admin/founder-only in two server layers:
`requireProfile(['admin','founder'])` in `upsertServiceCaseAction` **and** the `service_cases`
UPDATE RLS (migration 0110). A forged save from any other role fails regardless of the UI.

`canEdit` is computed **once** on the `/helpdesk` page (`profile.role === 'admin' || 'founder'` —
the same expression that gates the `+ Suggestion` CTA) and threaded page → `HelpdeskSearch` →
`CaseDetailModal`. It is **cosmetic** — it only decides whether the Edit button renders. Never
treat the client-side hide as the security boundary, and never weaken the server gate because the
button is hidden. Do **not** call `requireProfile` client-side to derive `canEdit`; the page
already knows the role.

## Heavy-modal loading

Both `AddSuggestionModal` (from `AddSuggestionButton` and from `CaseDetailModal`) and
`CaseDetailModal` (from `HelpdeskSearch`) load on intent via `next/dynamic` + `useMountOnFirstOpen`
(perf G-1) — the call sites keep the modal mounted so `modal.tsx`'s internal exit animation plays.
Never statically import these into the route chunk; never conditional-render on `open` alone
(cuts the exit). See `src/components/CLAUDE.md` "Heavy modal loading rule".
