# /admin/elaya-training: Elaya customer training

> **Purpose:** the page where the team curates what customer-facing Elaya knows and sends: brochures, work examples, testimonials, reviews, podcasts, media, documents, links and the company-facts brief, per domain.
> **Audience:** engineers. · **Source-of-truth scope:** this page and its data contracts. Working conventions live in `src/app/(dashboard)/admin/elaya-training/CLAUDE.md`. The feature it serves: [../modules/customer-welcome-blast.md](../modules/customer-welcome-blast.md).
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/admin/elaya-training/`, `src/components/admin/ElayaTrainingManager.tsx`, `TrainingAssetFormModal.tsx`, `src/lib/actions/elaya-training.ts`, `src/lib/services/elaya-training-service.ts`, `src/lib/constants/elaya-training.ts`, `src/lib/constants/route-permissions.ts`, `src/components/layout/Sidebar.tsx`, migration 0150.

## 1. Purpose

Customer Elaya greets a new prospect on WhatsApp and then answers their replies, and she may only
state facts and send material that the team put here. Each asset has a kind (10 kinds), a title,
an optional description, a file or a link, optional tags, a domain (empty means all domains), a
send order for the blast sequence, and an active flag. Nothing in this library changes how Elaya
answers the team.

This is the **Training** door of the Teach Elaya hub (`/settings/teach-elaya`); see
[../modules/elaya.md](../modules/elaya.md) section 13.

## 2. Who sees it

- **Page gate:** `hasManagerPageAccess(profile)`: manager, admin, founder, and anyone in the tech
  workbench domain. Everyone else is redirected to `/dashboard`. The page gate is the
  authorization boundary.
- **Reachability:** `/admin/elaya-training` is in the Gia domains' `DOMAIN_ROUTE_MAP` entries, so a
  Gia manager can reach it; admin and founder pass every route check; the tech workbench passes
  its own rule. It is deliberately not in `ALWAYS_ALLOWED_PREFIXES`. A concierge manager cannot
  reach it (the concierge map does not list it).
- **Navigation:** the sidebar no longer links the page directly. The "Teach Elaya" item in the
  configuration group opens the hub, whose Training card links here (`ELAYA_TRAINING_PATH`).

## 3. Data sources

- **Table** `elaya_training_assets` (migration 0150, schema `public`). Editable config, not
  append-only. The `kind` CHECK mirrors `TRAINING_ASSET_KINDS` (`constants/elaya-training.ts`):
  brochure, work_example, testimonial, review, podcast, image, video, doc, fact, url. RLS: every
  signed-in user may read; manager, admin and founder may write.
- **Page read:** `getAllTrainingAssets()`, newest first.
- **Send-path read:** `getTrainingAssetsForBlast(domain, interests?)`: active assets for the
  lead's domain or all domains, overlapping the lead's interests when given, in `send_order`. Admin
  client with an explicit domain filter, because the customer turn runs without a session.
- **Writes:** `src/lib/actions/elaya-training.ts` (`upsertTrainingAsset`, `deleteTrainingAsset`).
  Zod first, `requireProfile(['manager','admin','founder'])`, admin client writes, `sanitizeText`
  on title, description and tags only (never on a URL or storage path),
  `revalidatePath('/admin/elaya-training')`. **Company facts are one per domain:** a new
  `kind='fact'` for a domain that already has one updates the existing row.
- **Storage:** the PUBLIC `elaya-training` bucket (migration 0150). The modal uploads in the
  browser with per-kind size and type hints (`TRAINING_UPLOAD_HINTS`), and the action stores the
  object path or an external URL. The bucket is public so Gupshup can fetch a media URL with no
  signing step; the material is marketing collateral meant to be shared.

## 4. Components

- `page.tsx`: server orchestrator. Profile, the page gate, `getAllTrainingAssets()`, then
  `<ElayaTrainingManager initialAssets={...} />`.
- `components/admin/ElayaTrainingManager.tsx`: the `<h1>` with the page-title dot, the Company
  Facts card(s) at the top (one per domain), a filter strip with search, and the asset rows. Each
  row ends with the shared Edit and Delete pair (`EditDeleteActions`); delete asks through
  `ConfirmDialog`.
- `components/admin/TrainingAssetFormModal.tsx`: create and edit. The fields shown follow the
  kind's input mode (`trainingInputMode()`: media upload, link, or text).

## 5. States

- **Loading:** `loading.tsx`, the standard page skeleton.
- **Empty:** the shared `EmptyState`.
- **Errors:** from `form-errors.ts`; the modal keeps what was entered.

## 6. Invariants

- The page gate is the authorization boundary. Never add this route to `ALWAYS_ALLOWED_PREFIXES`.
- Company facts stay one per domain.
- `getTrainingAssetsForBlast` keeps its admin client and explicit domain filter.
- The library is the only source of company facts the customer brain may state; the customer
  prompt forbids inventing a service or a price.

## 7. Open items

- **Managers are not pinned to their own domain.** The Teach Elaya hub says "managers curate their
  own domain", but neither the action nor the RLS limits a manager to it: a manager can create or
  edit an asset for any domain.
- **A tech workbench agent can open the page but cannot save:** the page gate admits the workbench
  of any role, the write action accepts manager, admin and founder only.
- Whether the customer welcome template is live in production is not visible from the repo; see
  [../modules/customer-welcome-blast.md](../modules/customer-welcome-blast.md).
