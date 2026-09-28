# Suggestions: Page Spec

> **Purpose:** spec for `/admin/suggestions`, the admin/founder triage inbox for the suggestions and bug reports the team sends through "Send feedback".
> **Audience:** engineers. · **Source-of-truth scope:** this route (the inbox) and where the composer opens from. The storage and RLS contract: migrations 0134 / 0135 / 0136 and `lib/constants/suggestions.ts`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/admin/suggestions/{page,loading}.tsx`, `src/components/suggestions/*`, `src/lib/services/suggestions-service.ts`, `src/lib/actions/suggestions.ts`, `src/components/layout/Sidebar.tsx`, `src/components/elaya/{ElayaChatShell,ElayaFeedbackCard}.tsx`, `src/components/dashboard/widgets/ElayaPresenceCard.tsx`.

## 1. Purpose

The inbox for the staff suggestion and bug-report channel. Anyone signed in can send a report (a
category, a message and up to four screenshots) through the one composer:
`SuggestionFeedbackProvider` (mounted once in the dashboard layout) → `SuggestionComposerModal` →
`submitSuggestionAction`. Admin and founder read the reports here and mark each one resolved,
which notifies the sender. The table is meant as a clean base for a future AI triage pass.

**Where "Send feedback" opens from:**

- the Sidebar footer (desktop), and the same button in the mobile drawer (the drawer closes first);
- `/elaya`: the `ElayaFeedbackCard` in the right rail on large screens, and a header icon button
  below `lg` (through `useOptionalSuggestionFeedback`, 2026-09-26);
- the dashboard's `ElayaPresenceCard` on a phone, as a row in its own header.

The `/elaya` doors only exist for people Elaya is on for (`hasElayaAccess`); everyone keeps the
Sidebar button.

## 2. Who sees it

- **Page gate:** `hasElevatedPageAccess` (admin, founder, or a tech workbench member); anyone else,
  including a missing session, goes to `/dashboard`.
- **The tech workbench sees the full inbox.** `getSuggestionsForInbox` runs on the admin client
  with no role check of its own (it trusts the page), so a tech account reads every report and its
  signed screenshot links. "Mark resolved" fails for them: `resolveSuggestionAction` requires
  admin/founder.
- **Sidebar:** "Suggestions" (`MessageSquarePlus`) in `ADMIN_NAV`, listed through `isNavVisible`;
  it is in the founder's curated sidebar. Staff who send reports never see this inbox; the
  `suggestions_select_own` RLS policy lets a sender read their own rows, which no page shows.
- The title row carries the `PageControls` bell.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getSuggestionsForInbox(status?)` in `suggestions-service.ts` (server-only, admin client; the page is the trust boundary): newest first (`created_at DESC`, at most 200), the sender's `full_name` joined, and a 300-second signed URL minted for each image path |
| Resolve | `resolveSuggestion(id, resolvedBy)` (admin client) writes only `status`, `resolved_by`, `resolved_at` (the column limit is in code; RLS cannot restrict columns) and returns the `sender_id`. Called by `resolveSuggestionAction` (`requireProfile(['admin','founder'])`) |
| Submit | `submitSuggestionAction` (any signed-in role) |
| Storage | the private `suggestions` bucket (0135): `image_paths` holds storage **paths, never URLs** |
| Table | `public.suggestions` (0134): `category` (`bug`, `idea`, `other`), `message`, `image_paths text[]` (up to 4), `status` (`open`, `resolved`), `resolved_by`, `resolved_at`, `sender_id`, `created_at` |
| Notify | the in-app type `suggestion_resolved` (0136), sent to the original sender on resolve. Transactional: it has no notification key and cannot be muted |

The page (already gated) seeds `<SuggestionInboxClient initialSuggestions>` from
`getSuggestionsForInbox()`.

## 4. Components

- **`SuggestionInboxClient`** (client): an **All | Open | Resolved** `TabSelector` (content-sized,
  never a full-row tray), then one `motion.div` card per report (`--shadow-1` at rest). Display and
  a thin resolve state only.
- **Per card:** the sender's `Avatar` and name, the category label (`SUGGESTION_CATEGORY_LABELS`)
  and relative time, a status pill, the message, the screenshot thumbnails (each opens full size in
  a new tab through its signed URL), and a "Mark resolved" `Button` on open reports.
- **`SuggestionComposerModal`** + **`SuggestionFeedbackProvider`**: the composer and its single
  mount point.

## 5. States

- **Loading:** `admin/suggestions/loading.tsx` (a tab placeholder and three card placeholders).
- **Empty:** a framed `<EmptyState>` with the `MessageSquarePlus` icon and the title "Nothing here
  yet."; the description says there are no open reports and you are all caught up on the Open tab,
  otherwise "Feedback from the team will land here."
- **Resolving:** the row's button spins while its action runs; on success the row flips to resolved
  and `toast.success` fires; on error `toast.danger`. The next load reconciles.
- **Error:** a failed inbox read returns `[]` (logged); the page never throws.

## 6. Invariants

- Resolving is admin/founder only, in the action and in the `suggestions_update_admin` RLS policy.
  Reading the inbox is gated by the page, and the service trusts it (see §2 for the workbench gap).
- `suggestions` is **not** append-only: it has an open → resolved lifecycle, so it has exactly one
  narrow admin UPDATE policy (the `revival_candidates` carve-out) and **no DELETE policy, ever**.
  Only `status`, `resolved_by`, `resolved_at` are written, enforced in `resolveSuggestion`.
- Screenshots live in a private bucket; rows store paths; viewing always mints a short-lived signed
  URL on the server. Never store or render a permanent object URL.

## 7. Open items

- The tech workbench can read every report and its screenshots (the admin-client read has no role
  check). Add a service-side admin/founder check, as `getAgentUsage` has, or keep the page to a
  literal admin/founder gate.
- A future AI triage pass over the inbox is the stated direction (0134).
