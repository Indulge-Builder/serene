// THE public bot's knowledge pack (0252, docs/architecture/indulge-bot-plan.md section 7).
//
// The pack is the only thing the bot knows about Indulge. People write items on the Teach Elaya
// library page (public.elaya_training_assets, status draft → approved) and approve stories for the
// public (gia.service_cases.public_approved_at). Publishing compiles every approved item into ONE
// text, runs the leak check over it, and writes it as a new append-only row of
// public.bot_knowledge_versions. The bot reads the newest row and nothing else. A rollback is
// publishing an older row's text again, as a new row.
//
// The compiled text is the bot's system prompt, byte-identical for every person and every turn, so
// the provider's prompt cache holds it. Nothing volatile (a date, a version number, a name) is
// ever written into it.
//
// No `server-only`: the bench script (scripts/public-bot/bench.ts) reads the latest pack from a
// laptop. Admin client throughout; the CALLER gates (actions/public-bot.ts: admin/founder).

import { createAdminClient } from '@/lib/supabase/admin';
import { giaDb, memberDb } from '@/lib/supabase/schemas';
import { withRedisCache } from '@/lib/services/cache-helpers';
import { redis } from '@/lib/redis';
import { mapRows } from '@/lib/utils/rows';
import { leakCheck } from '@/lib/services/hands-draft';
import { redactSensitiveShapes } from '@/lib/services/media-reader';
import { fullNameHits } from '@/lib/services/bot-guards';
import { PUBLIC_BOT_REDIS } from '@/lib/constants/public-bot';
import { TRAINING_ASSET_KIND_LABELS, TRAINING_LIBRARY_KINDS } from '@/lib/constants/elaya-training';
import type { TrainingAssetRow } from '@/lib/types/elaya-training';

/** The marker the compiler writes and the guard reads the forbidden phrases back from. */
const NEVER_SAY_HEADING = '## Never say';

/** Emails at this domain may appear in the pack; any other email is a leak. */
const INDULGE_EMAIL_DOMAIN = 'indulge.global';

export type PublishedPack = {
  id: string;
  version: number;
  text: string;
  assetIds: string[];
  storyIds: string[];
  createdAt: string;
};

export type PackVersionSummary = {
  version: number;
  itemCount: number;
  createdAt: string;
  publishedBy: string | null;
  restoredFrom: number | null;
};

type StoryRow = { id: string; title: string; summary: string; public_summary: string | null; category: string; city: string | null; tags: string[] };

// ─── Compile ──────────────────────────────────────────────────────────────────

/** Every approved, active, unexpired item, plus the stories approved for the public. */
async function readPackSources(): Promise<{ assets: TrainingAssetRow[]; stories: StoryRow[] }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ data: assets, error: assetsError }, { data: stories, error: storiesError }] = await Promise.all([
    admin
      .from('elaya_training_assets')
      .select('*')
      .eq('status', 'approved')
      .eq('active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('send_order', { ascending: true })
      .order('created_at', { ascending: true }),
    giaDb(admin)
      .from('service_cases')
      .select('id, title, summary, public_summary, category, city, tags')
      .not('public_approved_at', 'is', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  if (assetsError) throw new Error(`[bot-knowledge] library read failed: ${assetsError.message}`);
  if (storiesError) throw new Error(`[bot-knowledge] stories read failed: ${storiesError.message}`);
  return {
    assets: mapRows<TrainingAssetRow, TrainingAssetRow>(assets, (r) => r),
    stories: mapRows<StoryRow, StoryRow>(stories, (r) => r),
  };
}

const oneLine = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The pack text. Sections in a fixed order, items in a fixed order (send order, then age), so the
 * same approved items always compile to the same bytes and the prompt cache survives a republish.
 */
export function compilePackText(assets: TrainingAssetRow[], stories: StoryRow[]): string {
  const byKind = (kind: string) => assets.filter((a) => a.kind === kind);
  const out: string[] = [];

  const facts = byKind('fact');
  if (facts.length) {
    out.push('## Facts about Indulge');
    for (const f of facts) out.push(`### ${oneLine(f.title)}\n${(f.description ?? '').trim()}`);
  }

  const answers = byKind('answer');
  if (answers.length) {
    out.push('## Answers to the questions people ask');
    for (const a of answers) out.push(`Q: ${oneLine(a.title)}\nA: ${(a.description ?? '').trim()}`);
  }

  const objections = byKind('objection');
  if (objections.length) {
    out.push('## When someone hesitates');
    for (const o of objections) out.push(`They say: ${oneLine(o.title)}\nThe honest answer: ${(o.description ?? '').trim()}`);
  }

  const storyLines = [
    ...byKind('story').map((s) => `- ${oneLine(s.title)}: ${oneLine(s.description)}${s.tags.length ? ` [${s.tags.join(', ')}]` : ''}`),
    ...stories.map((s) => `- ${oneLine(s.title)}: ${oneLine(s.public_summary || s.summary)} [${[s.category, s.city, ...s.tags].filter(Boolean).join(', ')}]`),
  ];
  if (storyLines.length) {
    out.push('## Stories (all true; tell one in two or three lines, never add a detail that is not here)');
    out.push(storyLines.join('\n'));
  }

  const news = byKind('news');
  if (news.length) {
    out.push('## News');
    for (const n of news) out.push(`- ${(n.approved_at ?? n.created_at).slice(0, 10)}: ${oneLine(n.title)}. ${oneLine(n.description)}`);
  }

  const library = assets.filter((a) => (TRAINING_LIBRARY_KINDS as readonly string[]).includes(a.kind));
  if (library.length) {
    out.push('## The library (what you may send with send_material, by id)');
    for (const item of library) {
      const parts = [
        `id: ${item.id}`,
        TRAINING_ASSET_KIND_LABELS[item.kind],
        oneLine(item.title),
        item.when_to_send ? `send when: ${oneLine(item.when_to_send)}` : null,
        item.kind !== 'ready_message' && item.description ? oneLine(item.description).slice(0, 240) : null,
        item.kind === 'url' && item.url ? `link: ${item.url}` : null,
      ].filter(Boolean);
      out.push(`- ${parts.join(' | ')}`);
    }
  }

  const never = byKind('forbidden');
  if (never.length) {
    out.push(`${NEVER_SAY_HEADING} (never mention any of these, in any language, even if asked)`);
    out.push(
      never
        .flatMap((n) => [n.title, ...(n.description ?? '').split('\n')])
        .map(oneLine)
        .filter(Boolean)
        .map((l) => `- ${l}`)
        .join('\n'),
    );
  }

  return out.join('\n\n');
}

/** The forbidden phrases, read back from a compiled pack (the output guard's list). */
export function forbiddenPhrasesFromPack(text: string): string[] {
  const at = text.indexOf(NEVER_SAY_HEADING);
  if (at < 0) return [];
  const rest = text.slice(at).split('\n').slice(1);
  const lines: string[] = [];
  for (const line of rest) {
    if (line.startsWith('## ')) break;
    const l = line.replace(/^-\s*/, '').trim();
    if (l) lines.push(l);
  }
  return lines;
}

// ─── The leak check on the pack ───────────────────────────────────────────────

export type PackLeakHit = { kind: 'name' | 'contact' | 'sensitive'; value: string };

/**
 * A pack may never carry a person's name, a phone or email that is not Indulge's own, or a card /
 * ID shape. The Never say section is skipped: it exists to hold names the bot must not say.
 */
export function packLeakCheck(text: string, names: readonly string[], allowedPhones: readonly string[]): PackLeakHit[] {
  const at = text.indexOf(NEVER_SAY_HEADING);
  const checked = at >= 0 ? text.slice(0, at) : text;
  const hits: PackLeakHit[] = [];
  for (const n of fullNameHits(checked, names)) hits.push({ kind: 'name', value: n });
  const allowedDigits = allowedPhones.map((p) => p.replace(/\D/g, '').slice(-10)).filter(Boolean);
  for (const c of leakCheck(checked, [])) {
    if (c.includes('@')) {
      if (!c.toLowerCase().endsWith(`@${INDULGE_EMAIL_DOMAIN}`)) hits.push({ kind: 'contact', value: c });
    } else if (!allowedDigits.includes(c.replace(/\D/g, '').slice(-10))) {
      hits.push({ kind: 'contact', value: c });
    }
  }
  for (const f of redactSensitiveShapes(checked).found) hits.push({ kind: 'sensitive', value: f });
  return hits;
}

// ─── Names the bot must never say (guard input) ───────────────────────────────

let namesMemo: { at: number; names: string[] } | null = null;
const NAMES_TTL_MS = 10 * 60 * 1000;

/**
 * Every active staff member's and every member's full name, for the leak checks. Read in code,
 * never shown to the model. Memoised per server instance for ten minutes.
 */
export async function getGuardNames(): Promise<string[]> {
  if (namesMemo && Date.now() - namesMemo.at < NAMES_TTL_MS) return namesMemo.names;
  const admin = createAdminClient();
  const names = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from('profiles').select('full_name').eq('is_active', true).range(from, from + page - 1);
    if (error) break;
    for (const r of (data ?? []) as { full_name: string | null }[]) if (r.full_name) names.add(r.full_name.trim());
    if (!data || data.length < page) break;
  }
  for (let from = 0; ; from += page) {
    const { data, error } = await memberDb(admin).from('members').select('full_name').order('id').range(from, from + page - 1);
    if (error) break;
    for (const r of (data ?? []) as { full_name: string | null }[]) if (r.full_name) names.add(r.full_name.trim());
    if (!data || data.length < page) break;
  }
  const list = [...names].filter((n) => n.split(/\s+/).length >= 2);
  namesMemo = { at: Date.now(), names: list };
  return list;
}

/** Indulge's own public numbers: the public line, the staff line, and the website's button. */
export function indulgePublicPhones(): string[] {
  return [process.env.GUPSHUP_PUBLIC_NUMBER, process.env.GUPSHUP_PARTNER_NUMBER, process.env.INDULGE_PUBLIC_CONTACT_NUMBER]
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
}

// ─── Publish and read ─────────────────────────────────────────────────────────

/** What would be published right now: the text, its counts, and the leak check's verdict. */
export async function previewPack(): Promise<{ text: string; itemCount: number; assetIds: string[]; storyIds: string[]; hits: PackLeakHit[] }> {
  const { assets, stories } = await readPackSources();
  const text = compilePackText(assets, stories);
  const hits = packLeakCheck(text, await getGuardNames(), indulgePublicPhones());
  return {
    text,
    itemCount: assets.length + stories.length,
    assetIds: assets.map((a) => a.id),
    storyIds: stories.map((s) => s.id),
    hits,
  };
}

/**
 * Publish the approved items as the new pack. Refused when the leak check finds anything (the hit
 * names the item's words, so the editor can fix it) or when nothing is approved.
 */
export async function publishPackCore(actorId: string): Promise<{ ok: true; version: number } | { ok: false; reason: 'empty' | 'leak' | 'db'; hits?: PackLeakHit[] }> {
  const preview = await previewPack();
  if (preview.itemCount === 0 || preview.text.trim().length === 0) return { ok: false, reason: 'empty' };
  if (preview.hits.length > 0) return { ok: false, reason: 'leak', hits: preview.hits };
  const { data, error } = await createAdminClient()
    .from('bot_knowledge_versions')
    .insert({
      compiled_text: preview.text,
      item_count: preview.itemCount,
      asset_ids: preview.assetIds,
      story_ids: preview.storyIds,
      leak_check: { hits: 0, checked_at: new Date().toISOString() },
      published_by: actorId,
    })
    .select('version')
    .single();
  if (error || !data) {
    console.error('[bot-knowledge] publish failed:', error?.message);
    return { ok: false, reason: 'db' };
  }
  await clearPackCache();
  return { ok: true, version: Number((data as { version: number }).version) };
}

/** Publish an older version's text again, as a new row (a rollback never edits history). */
export async function restorePackCore(actorId: string, version: number): Promise<{ ok: true; version: number } | { ok: false }> {
  const admin = createAdminClient();
  const { data: old } = await admin.from('bot_knowledge_versions').select('*').eq('version', version).maybeSingle();
  if (!old) return { ok: false };
  const row = old as { compiled_text: string; item_count: number; asset_ids: string[]; story_ids: string[]; leak_check: unknown };
  const { data, error } = await admin
    .from('bot_knowledge_versions')
    .insert({
      compiled_text: row.compiled_text,
      item_count: row.item_count,
      asset_ids: row.asset_ids,
      story_ids: row.story_ids,
      leak_check: row.leak_check as never,
      restored_from: version,
      published_by: actorId,
    })
    .select('version')
    .single();
  if (error || !data) return { ok: false };
  await clearPackCache();
  return { ok: true, version: Number((data as { version: number }).version) };
}

async function clearPackCache(): Promise<void> {
  try {
    await redis.del(PUBLIC_BOT_REDIS.pack);
  } catch (e) {
    console.warn('[bot-knowledge] pack cache clear failed', e);
  }
}

async function readLatestPack(): Promise<PublishedPack | null> {
  const { data, error } = await createAdminClient()
    .from('bot_knowledge_versions')
    .select('id, version, compiled_text, asset_ids, story_ids, created_at')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as { id: string; version: number; compiled_text: string; asset_ids: string[]; story_ids: string[]; created_at: string };
  return { id: r.id, version: Number(r.version), text: r.compiled_text, assetIds: r.asset_ids ?? [], storyIds: r.story_ids ?? [], createdAt: r.created_at };
}

/** The live pack (the newest published version), cached five minutes; a publish clears it. */
export async function getLatestPack(): Promise<PublishedPack | null> {
  return withRedisCache(PUBLIC_BOT_REDIS.pack, 300, readLatestPack);
}

export async function listPackVersions(limit = 20): Promise<PackVersionSummary[]> {
  const { data } = await createAdminClient()
    .from('bot_knowledge_versions')
    .select('version, item_count, created_at, published_by, restored_from')
    .order('version', { ascending: false })
    .limit(limit);
  return ((data ?? []) as { version: number; item_count: number; created_at: string; published_by: string | null; restored_from: number | null }[]).map((r) => ({
    version: Number(r.version),
    itemCount: r.item_count,
    createdAt: r.created_at,
    publishedBy: r.published_by,
    restoredFrom: r.restored_from === null ? null : Number(r.restored_from),
  }));
}

