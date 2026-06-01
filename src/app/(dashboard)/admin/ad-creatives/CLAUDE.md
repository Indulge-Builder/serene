# Ad Creatives Admin — CLAUDE.md

**Route:** `/admin/ad-creatives` — admin and founder only; others `redirect('/dashboard')`.

## Page

`page.tsx` — server orchestrator. `Promise.all`:

- `getAllAdCreatives()` — all rows, newest-first per campaign
- `getCampaignMetrics(role, domain, EMPTY_FILTERS)` — derives distinct `campaign_key` options for the upload form

Renders `<AdCreativesManager initialCreatives={...} campaignKeys={...} />`.

## Mutations

`src/lib/actions/ad-creatives.ts` — `upsertAdCreative`, `deleteAdCreative`.

- Zod first line; `getCurrentProfile()` role guard (admin/founder).
- Writes via `adminClient`; `campaign_key` normalised `toLowerCase().trim()` (matches DB CHECK).
- `revalidatePath('/admin/ad-creatives')` and `revalidatePath('/campaigns')`.

## Storage

Supabase bucket `ad-creatives` (or project-configured bucket used by `AdCreativesManager`). Public read for video URLs on dossier/campaign surfaces.

## Schema (migration 0058)

`ad_creatives.campaign_key` is **not** UNIQUE — multiple videos per campaign. Batch reads: `getAdCreativesForCampaign` / `getAdCreativesForCampaigns` in `ad-creatives-service.ts`. Never N+1 per card on campaign list.

## Related docs

- Campaign carousel: `src/app/(dashboard)/campaigns/CLAUDE.md`
- Dossier modal: `src/components/leads/CLAUDE.md` (`CampaignVideoModal`, `LeadInfoCard`)
