# Elaya Training Admin — CLAUDE.md

**Route:** `/admin/elaya-training` — **manager / admin / founder** only; others
`redirect('/dashboard')` (the page's role gate IS the authorization boundary). Block 2 of the
customer welcome-blast (`docs/modules/customer-welcome-blast.md`).

## Page

`page.tsx` — server orchestrator. `getCurrentProfile()` + the manager/admin/founder role redirect,
then `getAllTrainingAssets()`. Renders `<ElayaTrainingManager initialAssets={...} />` (the `<h1>` +
page-title dot + filter bar live inside the manager — primary nav page → gets the dot).

## Reachability (NOT ALWAYS_ALLOWED_PREFIXES)

`/admin/elaya-training` is in the **GIA `DOMAIN_ROUTE_MAP`** (`route-permissions.ts`), so a
Gia-domain manager can reach it; an agent bounces at the page's role redirect; admin/founder bypass
the map. It is deliberately NOT in `ALWAYS_ALLOWED_PREFIXES` (that would expose it to agents/guests).
The Sidebar entry sits in `getConfigurationNav` (added unconditionally, self-gated by the
`canAccessRoute` filter at the render site — the `/oversight` precedent).

## Mutations

`src/lib/actions/elaya-training.ts` — `upsertTrainingAsset`, `deleteTrainingAsset`. Zod-first;
`requireProfile(['manager','admin','founder'])`; adminClient writes; `sanitizeText` on text fields
only (never url/storage_path); `revalidatePath('/admin/elaya-training')`. Singleton company-facts:
one `kind='fact'` row per domain (a fresh fact updates the existing one).

## Storage

PUBLIC `elaya-training` bucket (migration 0150). The modal uploads CLIENT-side
(`supabase.storage.from('elaya-training').upload` → `getPublicUrl`) and the action persists the
storage PATH + (or) an external url. Public read so the future blast's `sendGupshupMediaMessage` can
fetch a sent media url with no signing step.

## Schema (migration 0150)

`elaya_training_assets` — 10 `kind`s (the SQL CHECK mirrors `TRAINING_ASSET_KINDS`), `tags text[]`,
`domain app_domain` nullable (NULL = all domains), `send_order` (the blast sequence), `active`.
Editable config (NOT append-only). The send-path read is `getTrainingAssetsForBlast` (admin client +
domain scope — the parity rule), specified now so the NEXT block doesn't refactor it.
