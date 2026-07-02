# /admin/elaya-training — Elaya Customer Training

> **Purpose:** the admin surface where managers curate what customer-facing Elaya knows and
> sends: welcome-blast media, company facts, and reference assets per domain.
> **Audience:** engineers. · **Source-of-truth scope:** the `/admin/elaya-training` page
> behaviour and its data contracts. Working conventions live in
> `src/app/(dashboard)/admin/elaya-training/CLAUDE.md`. Module context:
> `docs/modules/customer-welcome-blast.md` (this page is Block 2 of that feature).
> **Last verified:** 2026-07-02 (migration 0150).

## 1. Purpose

Customer Elaya greets new prospects on WhatsApp with a welcome blast (media + intro) and then
answers their replies. This page is where the team manages that content. Every asset row has a
kind (10 kinds, for example media, fact, reference), optional tags, a domain (NULL means all
domains), a send order for the blast sequence, and an active flag.

## 2. Who sees it

Manager, admin, and founder only. The page role gate redirects everyone else to `/dashboard`.
The route sits in the Gia `DOMAIN_ROUTE_MAP` (not in `ALWAYS_ALLOWED_PREFIXES`), so a
Gia-domain manager can reach it, an agent bounces at the role redirect, and admin/founder
bypass the map. The sidebar entry lives in `getConfigurationNav`, self-gated by
`canAccessRoute` at the render site.

## 3. Data sources

- Table: `elaya_training_assets` (migration 0150). Editable config, not append-only. The SQL
  CHECK on `kind` mirrors `TRAINING_ASSET_KINDS`.
- Page read: `getAllTrainingAssets()`. Send-path read: `getTrainingAssetsForBlast` (admin
  client with an explicit domain scope, the parity rule).
- Writes: `src/lib/actions/elaya-training.ts` (`upsertTrainingAsset`, `deleteTrainingAsset`).
  Zod first, `requireProfile(['manager','admin','founder'])`, admin-client writes,
  `sanitizeText` on text fields only (never on url or storage_path),
  `revalidatePath('/admin/elaya-training')`. Company facts are a singleton per domain: a new
  `kind='fact'` row updates the existing one.
- Storage: the PUBLIC `elaya-training` bucket (migration 0150). The modal uploads client-side
  and the action persists the storage path or an external url. The bucket is public so the
  blast can send media urls with no signing step.

## 4. Components

- `page.tsx` is a thin server orchestrator: role gate, `getAllTrainingAssets()`, then
  `<ElayaTrainingManager initialAssets={...} />`.
- `src/components/admin/ElayaTrainingManager.tsx` owns the `<h1>` with the page-title dot,
  the filter bar, the asset list, and the upload modal.

## 5. States

`loading.tsx` shows the standard page skeleton. Empty state follows the `<EmptyState>`
convention.

## 6. Invariants

- The page role gate IS the authorization boundary. Never add this route to
  `ALWAYS_ALLOWED_PREFIXES`.
- Company facts stay singleton per domain.
- `getTrainingAssetsForBlast` keeps its admin client + explicit domain scope (sessionless
  WhatsApp sends have no `auth.uid()`).

## 7. Open items

None. Shipped 2026-06-26 as Block 2 of the customer welcome blast.
