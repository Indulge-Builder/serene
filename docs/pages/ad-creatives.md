# Ad Creatives — Page Spec

> **Purpose:** spec for `/admin/ad-creatives` — campaign-video upload/management, plus the two read surfaces that consume creatives.
> **Audience:** engineers. · **Source-of-truth scope:** the admin route, `ad-creatives-service.ts`, `ad-creatives.ts` actions, the `ad-creatives` Storage bucket usage.
> **Last verified:** 2026-06-24 full pass (2026-06-09 original; 2026-06-11 restructure).

## 1. Purpose

`public.ad_creatives` rows are campaign videos uploaded by admin/founder, keyed by a normalised
`campaign_key` matching `leads.utm_campaign` — string equality, **no FK**. A campaign may have
multiple videos (UNIQUE dropped in migration 0058). The videos surface read-only on the lead
dossier and campaign detail.

## 2. Who sees it

Admin page: admin/founder only (page redirect + RLS write policies + storage RLS 0092).
Reads: any authenticated user (`ad_creatives_select_authenticated` — agents need dossier
videos). Sidebar item appears only for admin/founder, above Settings in Configuration.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `ad-creatives-service.ts` — `getAdCreativesForCampaign` (one campaign → `AdCreative[]`), `getAdCreativesForCampaigns` (batch `Map`, **no live caller** — retained as a documented service API), `getAllAdCreatives`. **No Redis** — freshness via `revalidatePath` (the former cache was removed as a P-08 bug; do not re-add) |
| Actions | `ad-creatives.ts` — `upsertAdCreative` (normalises `campaign_key` via `normalizeCampaignKey()`; 23505 → friendly error), `deleteAdCreative`. Both admin/founder via `requireProfile(ADMIN_ROLES)`; adminClient writes |
| Storage | `ad-creatives` bucket — public read; INSERT/DELETE admin/founder (0092) |
| Validation | `ad-creative-schema.ts` (`upsertAdCreativeSchema` — id optional = create/update) |

## 4. Components

`AdCreativesManager` (+ `<ConfirmDialog>` for deletes) · `AdCreativeFormModal` · video
primitives (Deep dive §8) · read surfaces: `CampaignVideoModal` (lead dossier),
`CampaignAdPanel` (campaign detail left column; `AdCreativeCarousel` inside, plus an inline
upload tile via `AdCreativeFormModal` for admin/founder) · raw campaign keys for display
names (no decoration). The campaign list (`/campaigns`) no longer surfaces creatives —
`CampaignCard` is a `MotionLink` straight to `/campaigns/{name}` (the old `CampaignPreviewModal`
was deleted 2026-06-16).

## 5. States

- **Loading:** `admin/ad-creatives/loading.tsx` (PageSkeletons composition).
- **Empty:** `<EmptyState>` hero variant (no creatives uploaded yet).
- **Error:** upsert duplicate-key → friendly inline error; upload failures toast; deletes confirm via `<ConfirmDialog>`.

## 6. Invariants

Deep dive §12 — `campaign_key` normalisation is the only join mechanism (never add an FK);
multi-video per campaign assumed everywhere (`AdCreative[]`, never singular); writes
adminClient-after-role-check.

## 7. Open items

None recorded.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 1. Module Overview

**What ad creatives are:** Rows in `public.ad_creatives` — campaign videos (and optional metadata) uploaded by admin/founder, keyed by normalised `campaign_key` that matches `leads.utm_campaign`. This is **not** a join table; there is no FK from `leads`. Resolution is string equality on normalised `utm_campaign` ↔ `campaign_key`.

**Admin route:** `/admin/ad-creatives` — management UI (`AdCreativesManager` + `AdCreativeFormModal`).

**Two read surfaces (consume creatives, no writes):**

| Surface | Route / context | Component |
| --- | --- | --- |
| Lead dossier | `/leads/[id]` | `CampaignVideoModal` |
| Campaign detail | `/campaigns/[id]` | `CampaignAdPanel` (left column; inline upload via `AdCreativeFormModal` for admin/founder) |

The campaign **list** (`/campaigns`) is no longer a creative read surface. `CampaignCard` is a
`MotionLink` (`motion.create(Link)`) that navigates straight to `/campaigns/{name}` on click;
the intermediate `CampaignPreviewModal` (and its carousel) was deleted 2026-06-16.

**Access gate — admin page:** `page.tsx` calls `getCurrentProfile()`; missing profile → `/login`; role not `admin` or `founder` → `/dashboard`.

**RLS — reads:** `ad_creatives_select_authenticated` — any authenticated user may `SELECT` (agents need creatives on dossiers).

**RLS — writes:** `INSERT` / `UPDATE` / `DELETE` policies require `profiles.role IN ('admin', 'founder')`. Server actions also use `adminClient` after the same role check.

**Sidebar:** Section **Configuration** (rendered when `isManager` — manager, admin, founder). Nav item **Ad Creatives** (`Film`, `/admin/ad-creatives`) is inserted **only** when `isPrivileged` (`admin` or `founder`), **above** Settings in `getConfigurationNav()`.

---

### 2. Data Model — `ad_creatives` table

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `campaign_key` | `text` | NO | — | Lookup key; must equal `lower(trim(campaign_key))` (CHECK) |
| `ad_name` | `text` | YES | — | Optional display label |
| `video_url` | `text` | NO | — | Public URL (typically Supabase Storage) |
| `thumbnail_url` | `text` | YES | — | Optional poster URL |
| `notes` | `text` | YES | — | Internal team notes |
| `created_at` | `timestamptz` | NO | `now()` | Sort key (newest-first reads) |
| `updated_at` | `timestamptz` | NO | `now()` | Set on update via action |

#### Constraints

- `ad_creatives_campaign_key_normalised`: `campaign_key = lower(trim(campaign_key))`
- **Post–migration 0058:** no `UNIQUE` on `campaign_key` — multiple rows per campaign allowed

**Index:** `idx_ad_creatives_campaign_key` on `(campaign_key)` — non-unique; supports `.eq()` / `.in()` lookups by key.

#### RLS policies

| Policy | Operation | Who |
| --- | --- | --- |
| `ad_creatives_select_authenticated` | SELECT | `authenticated` (`USING (true)`) |
| `ad_creatives_insert_admin_founder` | INSERT | `admin`, `founder` |
| `ad_creatives_update_admin_founder` | UPDATE | `admin`, `founder` |
| `ad_creatives_delete_admin_founder` | DELETE | `admin`, `founder` |

#### 2a. Migration history (critical)

**Migration 0012** (`20260528000012_ad_creatives.sql`)

- Created `ad_creatives` with `campaign_key text NOT NULL UNIQUE` (one video per campaign).
- Added normalisation CHECK, RLS, and `idx_ad_creatives_campaign_key`.

**Migration 0058** (`20260601000058_ad_creatives_multi_video.sql`)

- Drops inline unique constraint `ad_creatives_campaign_key_key` if present (idempotent `DO` block).
- Recreates `idx_ad_creatives_campaign_key` defensively (`CREATE INDEX IF NOT EXISTS`).
- Normalisation CHECK unchanged.

**Migration 0092** (`20260608000092_fix_ad_creatives_storage_rls.sql`) — **Storage RLS, not table RLS.**

- Drops the legacy permissive storage policies `"Ad Creative Modal insert"` / `"Ad Creative Modal delete"` on `storage.objects`.
- Creates `ad_creatives_storage_insert` and `ad_creatives_storage_delete` — both gate `bucket_id = 'ad-creatives'` writes to `profiles.role IN ('admin', 'founder')`, mirroring the table-level write RLS from 0012.
- **No SELECT policy added** — bucket read stays public for the dossier/campaign playback surfaces.
- Net effect: uploading or deleting a Storage object in the `ad-creatives` bucket now requires admin/founder at the RLS layer, not merely an authenticated session (see §3).

**Manual step on remote DB:** If production was created from migration 0012 but 0058 was never applied, the `UNIQUE` on `campaign_key` may still exist. Run the SQL in `20260601000058_ad_creatives_multi_video.sql` once on the remote database (or apply pending migrations via your normal Supabase migration workflow). Until the unique constraint is dropped, only one row per `campaign_key` can exist and second inserts may hit Postgres `23505`.

#### Service rename (singular → plural array)

| Before (conceptual) | After (current) |
| --- | --- |
| `getAdCreativeForCampaign` → `.single()` → `AdCreative \| null` | `getAdCreativesForCampaign` → array query → `AdCreative[]` |

- **Returns:** all matching rows, `ORDER BY created_at DESC` (newest first).
- **On error / no rows:** `[]` (never throws).
- **Callers still using the old name or expecting a single object** will fail at compile time or mis-handle multiple videos — treat as a bug.

#### 2b. `campaign_key` normalisation

**Rule:** `toLowerCase()` + `trim()` before every read and write.

**Enforced in:**

- `upsertAdCreative` action — `normalizeCampaignKey(campaign_key)` before DB write (shared util)
- `getAdCreativesForCampaign` / `getAdCreativesForCampaigns` — normalise input keys before query
- Admin `page.tsx` — `campaignKeys` from metrics: `c.campaign_name.toLowerCase().trim()`
- `campaigns/[id]/page.tsx` — `CampaignAdPanel campaignKey={normalizeCampaignKey(campaignName)}` (the inline-upload lock key)

**Why:** `utm_campaign` values from Meta/Google/Pabbly arrive with inconsistent casing; DB CHECK requires stored keys to be normalised.

---

### 3. Storage Bucket — `ad-creatives`

| Property | Value |
| --- | --- |
| Bucket name | `ad-creatives` (constant `BUCKET` in `AdCreativeFormModal.tsx`) |
| Created by migration | **No** — bucket must be created in Supabase Dashboard |
| Read access | Public (URLs from `getPublicUrl` used on dossier/campaign surfaces) |
| Write access | **admin / founder only** (Storage RLS, migration 0092). Upload uses browser `createClient()`, but `storage.objects` INSERT/DELETE policies require `profiles.role IN ('admin','founder')` — an authenticated non-admin upload is rejected at the RLS layer. |

**Path pattern:** `{uuid}.{ext}` at bucket root (e.g. `a1b2c3d4-....mp4`). No `{user_id}/` prefix (unlike `avatars` which uses `profile.id`).

**Mirrors `avatars` pattern:** browser client → `storage.from(bucket).upload(...)` → `getPublicUrl(path)` → persist URL in DB via server action.

**Application-layer file guards** (not Storage RLS rules):

- Max size: **100 MB** (`MAX_VIDEO_MB = 100`)
- MIME: must start with `video/*` (checked on `file` selection in `handleFileChange`, before upload)

---

### 4. Service — `ad-creatives-service.ts`

All functions use `createClient()` from `src/lib/supabase/server.ts`. On any error: log + return empty collection — **never throw**.

#### `getAdCreativesForCampaign(campaignName: string): Promise<AdCreative[]>`

| Aspect | Detail |
| --- | --- |
| Query | `.eq('campaign_key', normalised).order('created_at', { ascending: false })` |
| Pattern | Array (multi-row) |
| Empty | `[]` if key blank, DB error, or no rows |
| Called by | `leads/[id]/page.tsx` (`Promise.all` when `utm_campaign` set); `campaigns/[id]/page.tsx` |

#### `getAdCreativesForCampaigns(campaignNames: string[]): Promise<Map<string, AdCreative[]>>`

| Aspect | Detail |
| --- | --- |
| Query | Single round trip: `.in('campaign_key', normalisedKeys).order('created_at', { ascending: false })` — equivalent to `WHERE campaign_key IN (...)`; **never** loop per campaign |
| Return | `Map<campaignKey, AdCreative[]>` — each array newest-first |
| Empty | `new Map()` on error or empty input |
| Called by | **No live caller.** Retained as a documented service API (was `CampaignListAsync`'s batch fetch; dropped 2026-06-16 when `CampaignPreviewModal` was deleted). The batch-map shape is preserved for any future list-card use — never loop `getAdCreativesForCampaign` per campaign instead |

#### `getAllAdCreatives(): Promise<AdCreative[]>`

| Aspect | Detail |
| --- | --- |
| Query | `select('*').order('created_at', { ascending: false })` — all rows |
| Called by | `admin/ad-creatives/page.tsx` |

---

### 5. Actions — `ad-creatives.ts`

Both actions: Zod first line → `requireProfile(ADMIN_ROLES)` (the A-18 session/role guard from
`lib/actions/_auth.ts`; `ADMIN_ROLES: UserRole[] = ['admin', 'founder']`) → `{ data, error }`.
Never a hand-rolled `getCurrentProfile()` + role check.

#### `upsertAdCreative`

| Step | Behaviour |
| --- | --- |
| Input | `FormData` via `upsertAdCreativeSchema` (Zod parsed before the auth guard) |
| Auth | `requireProfile(ADMIN_ROLES)` — `formErrors.unauthorized` if not admin/founder |
| Normalise | `normalizeCampaignKey(campaign_key)` (shared util, `lib/utils/campaigns.ts` — lowercase + trim) before DB write; never an inline `.toLowerCase().trim()` |
| Sanitize | `sanitizeText()` on `ad_name` and `notes` when non-empty |
| DB | `id` present → `adminClient.update`; absent → `adminClient.insert` |
| `23505` | On insert failure: `"A creative already exists for that campaign."` (legacy message; post-0058 duplicate `campaign_key` is allowed — this path only fires if another unique violation occurs) |
| Revalidate | `revalidatePath('/admin/ad-creatives')` **and** `revalidatePath('/campaigns')` — campaign list/detail are RSC-cached; admin list must refresh too |

#### `deleteAdCreative`

| Step | Behaviour |
| --- | --- |
| Schema | `deleteAdCreativeSchema` — `id` uuid |
| Auth | `requireProfile(ADMIN_ROLES)` after Zod |
| DB | `adminClient.delete().eq('id', id).select('campaign_key').maybeSingle()` — reads the row back; `error \|\| !deleted` → `formErrors.generic` (a delete that matched no row fails, not silently succeeds). Row only — the **Storage object is intentionally not deleted** (orphaned bucket files are harmless and cheap) |
| Returns | `{ data: { id }, error }` |
| Revalidate | Same two paths as upsert |

---

### 6. Validation Schemas — `ad-creative-schema.ts`

#### `upsertAdCreativeSchema`

| Field | Rules |
| --- | --- |
| `id` | Optional nullable uuid — **present = update mode** |
| `campaign_key` | Required, min 1, max 300, `.trim()` (action lowercases before write) |
| `video_url` | Required, valid URL, max 2000 |
| `thumbnail_url` | Optional nullable URL, max 2000 |
| `ad_name` | Optional nullable, max 200 |
| `notes` | Optional nullable, max 2000 |

#### `deleteAdCreativeSchema`

| Field | Rules |
| --- | --- |
| `id` | Required uuid |

Zod failures map to `formErrors.generic` in actions — never raw Zod text in UI.

---

### 7. `/admin/ad-creatives` — Management Page

#### `page.tsx` (server orchestrator)

1. Access gate (admin/founder only).
2. `Promise.all`:
   - `getAllAdCreatives()` — full list for manager UI
   - `getCampaignMetrics(profile.role, profile.domain, EMPTY_FILTERS)` — distinct live `utm_campaign` names for form dropdown
3. `campaignKeys`: `Set` of `campaign_name.toLowerCase().trim()`, sorted.
4. Renders `<AdCreativesManager initialCreatives={creatives} campaignKeys={campaignKeys} />`.

#### `AdCreativesManager`

**Layout:** Canonical three-row list page (header + filter strip + card list).

| Row | Content |
| --- | --- |
| 1 | `type-page-title` + `page-title-dot`; `MotionButton` primary **Add Creative** |
| 2 | Filter strip: `SlidersHorizontal`, active-count badge (1 when search non-empty), `SearchBar`, result count (`N creative(s)`) |
| 3 | Card list or Playfair italic empty state |

**Search:** Client-side `useMemo`; haystack = `campaign_key`, `ad_name`, `notes` (joined, case-insensitive substring).

**Cards:** Thumbnail (`<video>` muted cover or `Film` placeholder); title = `row.ad_name?.trim() || row.campaign_key` (raw key fallback); subtitle = `row.campaign_key` **always** (raw key, never beautified — `beautifyCampaignTitle` was deleted 2026-06-23); optional notes line. Edit/Delete: bordered ghost buttons (UsersTable-style hover). Hover: `translateY(-1px)` + `--shadow-2`. Framer Motion: `opacity 0→1`, `y 4→0`, stagger `min(index * 80, 320) ms`, `EASE_OUT_EXPO`.

**State:** `useState(initialCreatives)` — on save/delete, updates local array (`handleSaved` / filter delete). **No `router.refresh()`** on success — avoids round trip; parent owns list.

**Delete:** themed `<ConfirmDialog>` (title "Delete creative?", body naming `confirmTarget.campaign_key`, `danger`, `pending`/`pendingLabel="Deleting…"`) → on confirm, `deleteAdCreative` inside a `useTransition`, optimistic local filter on success + toast. No `window.confirm` (replaced 2026-06-11 — the one intentional UX change in the `ConfirmDialog` adoption).

**Empty states (V-09):** Playfair italic — "No ad creatives yet." / "Nothing matches your search." with tertiary subcopy.

#### `AdCreativeFormModal`

| Topic | Detail |
| --- | --- |
| Mode | `editing` prop null → create; `AdCreative` → edit (`id` sent in FormData) |
| Campaign dropdown | **Disabled when editing** — `campaign_key` is the join key for all consumers; changing it orphans links. Helper text: delete and re-add to relink. If stored key missing from `campaignKeys`, still shown as an option. |
| Display | Options show the raw campaign key |
| Upload | Hidden file input → `createClient().storage.from('ad-creatives').upload(path, file)` → `getPublicUrl` → `videoUrl` state → `upsertAdCreative` on Save (same flow as avatar upload, different path) |
| Guards | 100 MB + `video/*` at file selection |
| Preview | Live `<video>` after upload in subtle panel; Replace video link |
| Labels | `label-micro` (V-10) |
| Success | `onSaved(row, wasEdit)` → parent patches state; modal closes; toast |

---

### 8. Video Primitives

#### `AdCreativePlayer`

**Props:** `videoUrl: string`, `thumbnailUrl: string | null`

**Visual:** Container `aspect-ratio: 9/16`, `max-height: 480px`, `object-fit: contain`, `--theme-canvas` letterbox background. `<video>`: `autoPlay`, `muted`, `playsInline`, `controls`, optional `poster`.

**Mount:** `video.play()` via ref; `NotAllowedError` caught silently.

**Unmount cleanup:** `video.pause()` only — **`video.src` is intentionally not cleared.** Clearing `src` blanks the element under React Strict Mode double-mount (JSX `src` unchanged on remount → black box). `pause()` stops audio bleed; DOM node is removed on real unmount.

**Used by:** `AdCreativeCarousel` only (the carousel wraps the player; `CampaignAdPanel` and `CampaignVideoModal` mount the carousel, never the player directly).

#### `AdCreativeCarousel`

**Props:** `creatives: AdCreative[]`, `showMeta?: boolean` (default `false`), `align?: 'center' | 'start'`

**Behaviour:** One `AdCreativePlayer` at a time; prev/next wrap with modulo; dot indicators + `{n} / {total}` when multiple; arrows hidden when `length === 1`. `showMeta`: `ad_name` above player, `notes` below.

**`key={current.id}`** on `AdCreativePlayer` — forces remount per slide so each video autoplays from start and previous effect cleanup runs `pause()`.

**Player width:** the carousel constrains its `AdCreativePlayer` to `maxWidth: 270px` (≈ 480px tall × 9/16); `align="center"` (default) centres it via `marginInline: auto`, `align="start"` left-aligns. `CampaignAdPanel` passes `align="center"`.

**Used by:** `CampaignVideoModal` (lead dossier), `CampaignAdPanel` (campaign detail).

---

### 9. The Two Read Surfaces

#### 9a. `CampaignVideoModal` (lead dossier)

##### Lead dossier data path

```text
leads/[id]/page.tsx
  Promise.all → getAdCreativesForCampaign(lead.utm_campaign)  // [] if no utm_campaign
  → LeadInfoCard adCreatives={...}
  → CampaignVideoModal adCreatives={...}
```

**Trigger:** `LeadInfoCard` — `utm_campaign` renders as `CampaignLinkTrigger` (clickable) only when `adCreatives.length > 0`; otherwise plain mono text. Opens `videoModalOpen` state. There is **no** separate `ad_name` row trigger in current code — only the Campaign field.

**Props:** `isOpen`, `onClose`, `campaignName` (raw `lead.utm_campaign`), `adCreatives[]`

**UI:** `Modal` `max-w-2xl`, footer `null`. Title = single creative's `ad_name` if exactly one row and `ad_name` set; else `campaignName`. Body: `<AdCreativeCarousel creatives={adCreatives} showMeta />`.

#### 9b. `CampaignAdPanel` (campaign detail `/campaigns/[id]`)

##### Campaign detail data path

```text
campaigns/[id]/page.tsx
  getAdCreativesForCampaign(campaignName)   // same string as metrics + leads filter
  canUpload = role === 'admin' || role === 'founder'
  → <CampaignAdPanel
       adCreatives={...}
       campaignKey={normalizeCampaignKey(campaignName)}
       canUpload={canUpload}
     />
```

**Props:** `adCreatives: AdCreative[]` (newest-first, may be empty) · `campaignKey: string` (normalised; the inline-upload lock key) · `canUpload: boolean` (admin/founder gate for the empty-tile Plus).

**Layout:** The page grid (`lg:grid-cols-[320px_1fr]`) puts the panel in a **320px left column** beside the 2×4 metrics grid; stacks below `lg`. The panel **always renders** the `SectionCard` "AD CREATIVE" (the card frame stays so the two columns balance whether or not a video exists) — it **never returns `null`**.

- **Has creatives** → `<AdCreativeCarousel creatives showMeta align="center" />` (the player itself caps at `maxWidth: 270px`). Header shows a `{N} ads` count only when `creatives.length > 1`.
- **No creatives** → an `EmptyAdTile` with the same 9:16 footprint (`maxWidth: 270px`, dashed border). `canUpload` → a Plus button that opens the **same `AdCreativeFormModal`** (`next/dynamic`, R-01 — no second uploader) with this campaign pre-selected + locked via `defaultCampaignKey`; new uploads prepend to local state without a refetch. `!canUpload` → the tile shows serif-italic "No video yet." with no Plus.

Framer Motion wrapper: `opacity 0→1`, `y 8→0`, 350ms `EASE_OUT_EXPO`.

> **Campaign list — no creative surface.** `/campaigns` cards (`CampaignCard`) are a `MotionLink`
> (`motion.create(Link)`) that navigate straight to `/campaigns/{encodeURIComponent(name)}` on
> click. The old intermediate `CampaignPreviewModal` (the `max-w-3xl` 40/60 preview with a carousel)
> and the `getAdCreativesForCampaigns` batch fetch behind it were **deleted 2026-06-16**. There is
> no creative read on the list page.

---

### 10. Campaign name display

**Rule:** Campaign names are shown RAW everywhere — the same `utm_campaign` key used
for DB lookups (no decoration). The old `beautifyCampaignTitle` ` · `-separator decorator
was deleted 2026-06-23; never reintroduce a campaign-title beautifier.

**Display sites:** `AdCreativeFormModal` dropdown labels, `AdCreativesManager` search/cards,
admin card titles + subtitles (raw `campaign_key`), `CampaignVideoModal`/`CampaignAdPanel` titles,
the campaign detail H1, budget tables.

---

### 11. Access Control Summary

| Action | agent | manager | admin | founder |
| --- | --- | --- | --- | --- |
| View `/admin/ad-creatives` | ✗ (redirect) | ✗ | ✓ | ✓ |
| Upload / edit / delete creative | ✗ | ✗ | ✓ | ✓ |
| SELECT creative (RLS) | ✓ | ✓ | ✓ | ✓ |
| View on lead dossier | ✓ | ✓ | ✓ | ✓ |
| View on campaign list/detail | ✗ page | ✓ | ✓ | ✓ |

Campaign pages: agent/guest redirected from `/campaigns`; manager+ can see read surfaces. Sidebar **Ad Creatives** link: admin/founder only (Configuration section visible to manager+ but link gated).

---

### 12. Known Invariants (must never be violated)

1. **`campaign_key` always normalised** — via `normalizeCampaignKey()` (`lib/utils/campaigns.ts`) on write; `toLowerCase` + `trim` on every read key. Never an inline `.toLowerCase().trim()` in an action.
2. **`getAdCreativesForCampaigns` is one query** — `.in('campaign_key', keys)`; if it is ever re-wired to a list surface, never call `getAdCreativesForCampaign` in a loop over campaign cards. (Currently no live caller — kept as a documented batch API.)
3. **`AdCreativePlayer` unmount** must call `video.pause()` to prevent audio bleed; do not clear `video.src` (Strict Mode regression).
4. **`key={current.id}`** on carousel player is mandatory for correct autoplay and cleanup per slide.
5. **`campaign_key` locked on edit** in `AdCreativeFormModal` — changing it orphans consumer links.
6. **Storage bucket `ad-creatives`** is manual Dashboard setup — not created by any migration.
7. **`upsertAdCreative` maps Postgres `23505`** to user-readable text — never surface raw Postgres errors (handler may be rare post-0058).
8. **Every write revalidates** `/admin/ad-creatives` and `/campaigns`.
9. **Multiple videos per `campaign_key` are allowed** since migration 0058 — any code assuming `.single()` or one row per campaign is a bug.
10. **Admin list uses optimistic local state** after upsert/delete — do not rely on full-page refetch for manager UX.
11. **`video_url` comes from Storage public URL** — bucket must allow public read for playback surfaces.
12. **Writes are role-gated then admin-client** — `requireProfile(ADMIN_ROLES)` (A-18) is the trust boundary; the DB write uses `adminClient` (bypasses RLS, but RLS still mirrors the same admin/founder gate as defence in depth). `deleteAdCreative` reads the row back (`.select('campaign_key').maybeSingle()`) and fails when no row matched.

---

### File map (quick reference)

| Path | Role |
| --- | --- |
| `src/app/(dashboard)/admin/ad-creatives/page.tsx` | Admin orchestrator |
| `src/components/admin/AdCreativesManager.tsx` | List UI |
| `src/components/admin/AdCreativeFormModal.tsx` | Create/edit + upload |
| `src/lib/services/ad-creatives-service.ts` | All reads |
| `src/lib/actions/ad-creatives.ts` | Upsert/delete |
| `src/lib/validations/ad-creative-schema.ts` | Zod |
| `src/components/campaigns/AdCreativePlayer.tsx` | Video primitive |
| `src/components/campaigns/AdCreativeCarousel.tsx` | Multi-video UI |
| `src/components/leads/CampaignVideoModal.tsx` | Dossier modal |
| `src/components/campaigns/CampaignAdPanel.tsx` | Campaign-detail left-column panel (carousel + inline upload tile) |
| `src/components/campaigns/CampaignCard.tsx` | List card — `MotionLink` to `/campaigns/{name}` (no creative read; `CampaignPreviewModal` deleted 2026-06-16) |
| `supabase/migrations/20260528000012_ad_creatives.sql` | Table + RLS |
| `supabase/migrations/20260601000058_ad_creatives_multi_video.sql` | Drop UNIQUE |
| `supabase/migrations/20260608000092_fix_ad_creatives_storage_rls.sql` | Storage bucket INSERT/DELETE → admin/founder |
