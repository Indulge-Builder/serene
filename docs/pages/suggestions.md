# Suggestions — Page Spec

> **Purpose:** spec for `/admin/suggestions` — the admin/founder triage inbox for staff-submitted suggestions and bug reports.
> **Audience:** engineers. · **Source-of-truth scope:** this route (the triage inbox). The submit side (the "Send feedback" composer) and the storage/RLS contract live in migrations 0134/0135 and `lib/constants/suggestions.ts`.
> **Last verified:** 2026-06-20 against `src/app/(dashboard)/admin/suggestions/page.tsx`.

## 1. Purpose

The triage inbox for the staff suggestion / bug-report channel. Any staff member submits a report
(a message + up to 4 screenshots) via the "Send feedback" composer — opened from the Sidebar footer
(desktop), the mobile dashboard `ElayaPresenceCard` overlay + `MOBILE_TRIGGER_PATHS` trigger, and the
`ElayaFeedbackCard` in the `/elaya` right rail (added 2026-06-20); all route through the one
`SuggestionFeedbackProvider` → `SuggestionComposerModal` → `submitSuggestionAction`. The reports
reports land here for admin/founder to read and triage — flipping each from **open → resolved**,
which notifies the original sender. A clean substrate for a future AI triage pass.

## 2. Who sees it

Admin and founder only. The page redirects all other roles to `/dashboard`; unauthenticated →
`/login`. The route is not in the Sidebar's main nav for non-privileged roles. (Staff *submit*
reports from anywhere via the composer — they never see this inbox; the `suggestions_select_own`
RLS lets a sender read only their own rows, which this page does not surface.)

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getSuggestionsForInbox(status?)` in `suggestions-service.ts` (SERVER ONLY, admin client) — the page is the trust boundary; open-first within the `(status, created_at DESC)` index, ≤200 rows, joins the sender's `full_name`, and mints a signed URL per image path |
| Resolve | `resolveSuggestion(id, resolvedBy)` (admin client) — writes ONLY `status`/`resolved_by`/`resolved_at` (column restriction enforced in code, RLS can't); returns the `sender_id` so the action notifies them. Called by `resolveSuggestionAction` |
| Storage | private `suggestions` bucket (migration 0135, `public = false`) — `image_paths` stores storage **PATHS, never URLs**; `getSuggestionsForInbox` mints short-lived (300s) signed URLs server-side for viewing |
| Tables | `suggestions` (migration 0134) — `category` (`bug`/`idea`/`other`), `message`, `image_paths text[]` (≤4), `status` (`open`/`resolved`), `resolved_by`/`resolved_at` |
| Notify | `notifications.type` value `'suggestion_resolved'` (migration 0136) — fired to the original sender on resolve; transactional (no `notificationKey`), never silenceable |

RSC seed: the page (already admin/founder-gated) fetches `getSuggestionsForInbox()` and passes it
to `<SuggestionInboxClient>` as `initialSuggestions`.

## 4. Components

- `SuggestionInboxClient` (`components/suggestions/SuggestionInboxClient.tsx`) — `'use client'`;
  card-list layout (one `motion.div` card per report, `--shadow-1` at rest), the **All | Open |
  Resolved** `TabSelector` filter, and the resolve button. Display + thin resolve state only — all
  data arrives seeded from the RSC.
- Per-card: sender `Avatar` + name, category label (`SUGGESTION_CATEGORY_LABELS`) + relative time,
  status pill, the message, the screenshot thumbnails (open full-size in a new tab via the signed
  URL), and a "Mark resolved" `Button` on open rows.
- Standard list-page header (title + dot).

## 5. States

- **Loading:** none beyond the RSC fetch — the page streams the seeded list.
- **Empty:** `<EmptyState>` (Inbox icon) — "Nothing here yet." (copy varies by the active filter tab).
- **Resolve in flight:** the row's button shows a spinner (`pending && resolvingId === s.id`); on
  success the row flips optimistically to resolved and `toast.success` fires; on error
  `toast.danger`. The RSC revalidate reconciles on next load.
- **Error:** a failed inbox read returns `[]` (the service logs); the page never throws.

## 6. Invariants

- Admin/founder only — the page redirect plus the `suggestions_select_admin` / `suggestions_update_admin`
  RLS (migration 0134) both gate access.
- The `suggestions` table is **NOT append-only** — it has an open→resolved lifecycle, so it gets
  exactly **one narrow admin UPDATE policy** (the `revival_candidates` carve-out) and **no DELETE
  policy, ever**. Only `status`/`resolved_by`/`resolved_at` are writable; the column restriction is
  enforced in `resolveSuggestion`, not SQL.
- Screenshots live in a **private** bucket — the row stores paths, never URLs; viewing always mints
  a short-lived signed URL server-side. Never store or render a permanent object URL.

## 7. Open items

A future AI triage pass over the inbox is the stated direction (migration 0134 names the table a
"clean substrate" for it). The migration is flagged "NOT yet applied to prod" in the ledger —
confirm application before relying on production data here.
