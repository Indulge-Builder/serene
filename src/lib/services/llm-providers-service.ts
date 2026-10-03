// LLM provider + Elaya settings config reads — sla_policies pattern (migration 0116):
// read per request via the admin client, NEVER module-cached. Editing the
// llm_providers row (or a settings row) changes behaviour on the next message
// with no deploy. Config SELECT RLS is admin/founder; the engine reads via the
// service-role client because every caller path is already session-authenticated
// (the chat route / page is the trust boundary, Q-13 convention).

import { createAdminClient } from '@/lib/supabase/admin';
import { MCP_ROLES } from '@/lib/constants/mcp';
import { ELAYA_VOICE_SETTING_KEY } from '@/lib/constants/elaya-voice';
import { USER_ROLES } from '@/lib/constants/roles';
import type { UserRole } from '@/lib/types';
import type { LlmJobType, LlmProviderRow } from '@/lib/types/elaya';

const DEFAULT_DAILY_MESSAGE_CAP = 200;
const DEFAULT_SESSION_EXPIRY_HOURS = 24;

export type PiiMaskingDepth = 'off' | 'light' | 'strict';

/** Active provider config for a job type. Throws when no active row exists. */
export async function getLlmJobConfig(jobType: LlmJobType): Promise<LlmProviderRow> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('llm_providers')
    .select('*')
    .eq('job_type', jobType)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('[llm-providers-service] getLlmJobConfig failed:', error.message);
    throw new Error(`No LLM provider config readable for job '${jobType}'`);
  }
  if (!data) throw new Error(`No active LLM provider configured for job '${jobType}'`);
  return data as LlmProviderRow;
}

async function getSettingValue(key: string): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('elaya_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.warn('[llm-providers-service] settings read failed:', error.message);
    return null;
  }
  return (data as { value: unknown } | null)?.value ?? null;
}

/**
 * Which brain answers a channel (config rows `brain_whatsapp` / `brain_in_app`,
 * value `"node"` | `"python"`; migration 0179). Read per request, never cached —
 * flipping a row moves the very next message, no deploy (the model-switch
 * posture). Anything missing, malformed, or failed → `'node'`: the incumbent
 * brain keeps answering, so a config hiccup can never silence Elaya.
 */
export type ElayaBrainKind = 'node' | 'python';

export async function getElayaBrainForChannel(
  channel: 'whatsapp' | 'in_app',
): Promise<ElayaBrainKind> {
  // Non-production test seam: ELAYA_BRAIN_OVERRIDE_IN_APP / _WHATSAPP short-circuit
  // the DB read so the eval harness can drive the real route against a local brain
  // without touching the shared config rows. Production ignores them by construction
  // — the config row stays the only switch there.
  if (process.env.NODE_ENV !== 'production') {
    const override =
      channel === 'whatsapp'
        ? process.env.ELAYA_BRAIN_OVERRIDE_WHATSAPP
        : process.env.ELAYA_BRAIN_OVERRIDE_IN_APP;
    if (override === 'node' || override === 'python') return override;
  }
  const value = await getSettingValue(channel === 'whatsapp' ? 'brain_whatsapp' : 'brain_in_app');
  return value === 'python' ? 'python' : 'node';
}

/**
 * Is Elaya's voice door switched on (config row `voice_enabled`, migration 0247)?
 * Seeded false; read per call, never cached; anything but `true` — a missing row,
 * a failed read — is OFF (the door fails closed, like the brain switch falls to
 * the incumbent). Flip: UPDATE elaya_settings SET value='true' WHERE key='voice_enabled'.
 */
export async function isElayaVoiceEnabled(): Promise<boolean> {
  return (await getSettingValue(ELAYA_VOICE_SETTING_KEY)) === true;
}

/** Server-enforced daily message cap (config row `daily_message_cap`). */
export async function getDailyMessageCap(): Promise<number> {
  const value = await getSettingValue('daily_message_cap');
  return typeof value === 'number' && value > 0 ? value : DEFAULT_DAILY_MESSAGE_CAP;
}

/** PII gateway depth (config row `pii_masking_depth`). Defaults to 'light'. */
export async function getPiiMaskingDepth(): Promise<PiiMaskingDepth> {
  const value = await getSettingValue('pii_masking_depth');
  return value === 'off' || value === 'light' || value === 'strict' ? value : 'light';
}

/** Conversation session expiry window in hours (config row `session_expiry_hours`). */
export async function getSessionExpiryHours(): Promise<number> {
  const value = await getSettingValue('session_expiry_hours');
  return typeof value === 'number' && value > 0 ? value : DEFAULT_SESSION_EXPIRY_HOURS;
}

/**
 * The member profiler's switch (row `member_profiler_enabled`, migration 0215). OFF unless the
 * row says exactly `true`: a missing row, a malformed value or a failed read all mean "do not
 * read anyone's chat". The cloud task asks on every run, so flipping the row is the whole
 * control — no deploy.
 */
export async function getMemberProfilerEnabled(): Promise<boolean> {
  try { return (await getSettingValue('member_profiler_enabled')) === true; } catch { return false; }
}

/** The ticket intake sweep's switch (0219). True only when the row is exactly `true`; anything else is off. */
export async function getTicketIntakeEnabled(): Promise<boolean> {
  try { return (await getSettingValue('ticket_intake_enabled')) === true; } catch { return false; }
}

/**
 * Who may use the MCP connector (row `mcp_audience`, migration 0233): a JSON list of roles.
 * Unknown values are dropped; a missing, empty or malformed row falls back to MCP_ROLES
 * (founder + admin), the smaller set. Read per request, never module-cached (the sla_policies
 * pattern): an UPDATE on the row opens or closes a role within a minute, no deploy.
 */
export async function getMcpAudience(): Promise<readonly UserRole[]> {
  try {
    const value = await getSettingValue('mcp_audience');
    if (!Array.isArray(value)) return MCP_ROLES;
    const roles = value.filter((v): v is UserRole => typeof v === 'string' && (USER_ROLES as string[]).includes(v));
    return roles.length > 0 ? roles : MCP_ROLES;
  } catch {
    return MCP_ROLES;
  }
}

/**
 * The daily briefing's switch (row `daily_briefing_enabled`). OFF unless the row says exactly
 * `true`, like the profiler: nothing is sent to a founder's WhatsApp until someone turns it on.
 */
export async function getDailyBriefingEnabled(): Promise<boolean> {
  try { return (await getSettingValue('daily_briefing_enabled')) === true; } catch { return false; }
}

/** The live alert sweep's switch (0235, seeded false): ON only when the row says exactly true. */
export async function getElayaAlertsEnabled(): Promise<boolean> {
  try { return (await getSettingValue('elaya_alerts_enabled')) === true; } catch { return false; }
}

/**
 * The reply clocks' two switches (0253, rows `reply_alerts_enabled` / `update_alerts_enabled`, seeded
 * false): clock 1 (member waiting for any reply) and clock 2 (a holding reply owes an answer) are
 * turned on separately. ON only when the row says exactly `true`; a failed read means OFF.
 */
export async function getReplyAlertSwitches(): Promise<{ reply: boolean; update: boolean }> {
  try {
    const [reply, update] = await Promise.all([getSettingValue('reply_alerts_enabled'), getSettingValue('update_alerts_enabled')]);
    return { reply: reply === true, update: update === true };
  } catch {
    return { reply: false, update: false };
  }
}

/**
 * The nightly label top-up's switch (row `elaya_labels_refresh_enabled`, no seed row): the one
 * switch that is ON by default. A top-up judges only the rows a saved label set has not seen, sends
 * nothing to anyone, and costs cents; it is OFF only when the row says exactly `false`. A failed
 * read means ON as well (a stale label is a smaller harm than a silent stop).
 */
export async function getElayaLabelsRefreshEnabled(): Promise<boolean> {
  try { return (await getSettingValue('elaya_labels_refresh_enabled')) !== false; } catch { return true; }
}

/**
 * The lesson writer's switch (row `intake_lessons_enabled`, no seed row; 0240): ON unless the row
 * says exactly `false`. It only writes DRAFTS a founder must approve, and only when there are
 * enough new verdicts, so the default is on.
 */
/** The member judgement's switch (row `member_assessment_enabled`, 0241): ON unless exactly false. About ₹2 a member, weekly, reaches no member. */
export async function getMemberAssessmentEnabled(): Promise<boolean> {
  try { return (await getSettingValue('member_assessment_enabled')) !== false; } catch { return true; }
}

export async function getIntakeLessonsEnabled(): Promise<boolean> {
  try { return (await getSettingValue('intake_lessons_enabled')) !== false; } catch { return true; }
}

/**
 * The deep read's spend switch (row `elaya_deep_read_spend_cap_usd`, a number): a read whose
 * estimate is above it stops and asks the founder before judging. Missing or malformed row = the
 * default in constants/elaya-jobs.ts; 0 or a negative number = always ask.
 */
export async function getDeepReadSpendCapUsd(): Promise<number> {
  const { DEEP_READ_SPEND_CAP_SETTING_KEY, DEEP_READ_SPEND_CAP_DEFAULT_USD } = await import('@/lib/constants/elaya-jobs');
  try {
    const v = await getSettingValue(DEEP_READ_SPEND_CAP_SETTING_KEY);
    return typeof v === 'number' && Number.isFinite(v) ? v : DEEP_READ_SPEND_CAP_DEFAULT_USD;
  } catch {
    return DEEP_READ_SPEND_CAP_DEFAULT_USD;
  }
}

// ─── Elaya's eyes (0246) ─────────────────────────────────────────────────────

/** The media reader's live lane (row `media_reading_enabled`). OFF unless exactly `true`. */
export async function getMediaReadingEnabled(): Promise<boolean> {
  try { return (await getSettingValue('media_reading_enabled')) === true; } catch { return false; }
}

/** The backlog lane (row `media_reading_backlog_enabled`): the history, read only under the daily cap. OFF unless exactly `true`. */
export async function getMediaBacklogEnabled(): Promise<boolean> {
  try { return (await getSettingValue('media_reading_backlog_enabled')) === true; } catch { return false; }
}

/** The day's spend ceiling for the reader (row `media_reading_daily_cap_usd`); missing or malformed = the default in constants/media.ts. */
export async function getMediaDailyCapUsd(): Promise<number> {
  const { MEDIA_DAILY_CAP_DEFAULT_USD } = await import('@/lib/constants/media');
  try {
    const v = await getSettingValue('media_reading_daily_cap_usd');
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : MEDIA_DAILY_CAP_DEFAULT_USD;
  } catch { return MEDIA_DAILY_CAP_DEFAULT_USD; }
}

/** Which classes get a second, dearer read below which confidence (row `media_reading_escalate`); the default in constants/media.ts otherwise. */
export async function getMediaEscalateRule(): Promise<{ classes: import('@/lib/constants/media').MediaClass[]; below_confidence: number }> {
  const { MEDIA_ESCALATE_DEFAULT, MEDIA_CLASSES } = await import('@/lib/constants/media');
  try {
    const v = await getSettingValue('media_reading_escalate') as { classes?: unknown; below_confidence?: unknown } | null;
    if (!v || typeof v !== 'object') return MEDIA_ESCALATE_DEFAULT;
    const classes = Array.isArray(v.classes) ? v.classes.filter((c): c is import('@/lib/constants/media').MediaClass => typeof c === 'string' && (MEDIA_CLASSES.values as readonly string[]).includes(c)) : MEDIA_ESCALATE_DEFAULT.classes;
    const below = typeof v.below_confidence === 'number' && v.below_confidence >= 0 && v.below_confidence <= 1 ? v.below_confidence : MEDIA_ESCALATE_DEFAULT.below_confidence;
    return { classes, below_confidence: below };
  } catch { return MEDIA_ESCALATE_DEFAULT; }
}

// ─── Elaya's hands (0245) ────────────────────────────────────────────────────

/** Every hands switch and cap in one read (rows in constants/hands.ts HANDS_SETTING_KEYS); a missing or malformed row = its default. */
export async function getHandsSettings(): Promise<{
  enabled: boolean;
  trustByCategory: Record<string, import('@/lib/constants/hands').HandsTrustLevel>;
  perJobCapInr: number;
  dailyCapInr: number;
  monthlyCapInr: number;
}> {
  const { HANDS_SETTING_KEYS, HANDS_TRUST_LEVELS, HANDS_PER_JOB_CAP_DEFAULT_INR, HANDS_DAILY_CAP_DEFAULT_INR, HANDS_MONTHLY_CAP_DEFAULT_INR } = await import('@/lib/constants/hands');
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  try {
    const admin = createAdminClient();
    const { data } = await admin.from('elaya_settings').select('key, value').in('key', Object.values(HANDS_SETTING_KEYS));
    const rows = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const trustRaw = rows.get(HANDS_SETTING_KEYS.trustByCategory);
    const trust: Record<string, import('@/lib/constants/hands').HandsTrustLevel> = {};
    if (trustRaw && typeof trustRaw === 'object') {
      for (const [k, v] of Object.entries(trustRaw as Record<string, unknown>)) {
        if (typeof v === 'string' && (HANDS_TRUST_LEVELS.values as readonly string[]).includes(v)) trust[k] = v as import('@/lib/constants/hands').HandsTrustLevel;
      }
    }
    return {
      enabled: rows.get(HANDS_SETTING_KEYS.enabled) === true,
      trustByCategory: trust,
      perJobCapInr: num(rows.get(HANDS_SETTING_KEYS.perJobCapInr), HANDS_PER_JOB_CAP_DEFAULT_INR),
      dailyCapInr: num(rows.get(HANDS_SETTING_KEYS.dailyCapInr), HANDS_DAILY_CAP_DEFAULT_INR),
      monthlyCapInr: num(rows.get(HANDS_SETTING_KEYS.monthlyCapInr), HANDS_MONTHLY_CAP_DEFAULT_INR),
    };
  } catch {
    return { enabled: false, trustByCategory: {}, perJobCapInr: HANDS_PER_JOB_CAP_DEFAULT_INR, dailyCapInr: HANDS_DAILY_CAP_DEFAULT_INR, monthlyCapInr: HANDS_MONTHLY_CAP_DEFAULT_INR };
  }
}

// ─── Desks (0248) ───────────────────────────────────────────────────────────

/** The desks switch and quiet hours in one read (constants/desks.ts DESK_SETTING_KEYS); a missing or malformed row = its default. */
export async function getDesksSettings(): Promise<{ enabled: boolean; quietHours: { from: number; to: number } }> {
  const { DESK_SETTING_KEYS, DESK_QUIET_HOURS_DEFAULT } = await import('@/lib/constants/desks');
  const hour = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : d);
  try {
    const { data } = await createAdminClient().from('elaya_settings').select('key, value').in('key', Object.values(DESK_SETTING_KEYS));
    const rows = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const q = (rows.get(DESK_SETTING_KEYS.quietHours) ?? {}) as { from?: unknown; to?: unknown };
    return {
      enabled: rows.get(DESK_SETTING_KEYS.enabled) === true,
      quietHours: { from: hour(q.from, DESK_QUIET_HOURS_DEFAULT.from), to: hour(q.to, DESK_QUIET_HOURS_DEFAULT.to) },
    };
  } catch {
    return { enabled: false, quietHours: { ...DESK_QUIET_HOURS_DEFAULT } };
  }
}

/** THE read of the Sia watcher settings (0249): the standby number and the daily
 *  coverage check switch (ON unless the row is false). Fails to "no standby, check on". */
export async function getSiaWatcherSettings(): Promise<{ standbyJid: string | null; membershipCheckEnabled: boolean; historyReprofileCapUsd: number }> {
  const { SIA_WATCHER_SETTING_KEYS, SIA_HISTORY_REPROFILE_CAP_USD_DEFAULT } = await import('@/lib/constants/sia-watcher');
  try {
    const { data } = await createAdminClient().from('elaya_settings').select('key, value').in('key', Object.values(SIA_WATCHER_SETTING_KEYS));
    const rows = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const jid = rows.get(SIA_WATCHER_SETTING_KEYS.standbyJid);
    return {
      standbyJid: typeof jid === 'string' && jid.endsWith('@s.whatsapp.net') ? jid : null,
      membershipCheckEnabled: rows.get(SIA_WATCHER_SETTING_KEYS.membershipCheckEnabled) !== false,
      historyReprofileCapUsd: ((v) => (typeof v === 'number' && v >= 0 ? v : SIA_HISTORY_REPROFILE_CAP_USD_DEFAULT))(rows.get(SIA_WATCHER_SETTING_KEYS.historyReprofileCapUsd)),
    };
  } catch {
    return { standbyJid: null, membershipCheckEnabled: true, historyReprofileCapUsd: SIA_HISTORY_REPROFILE_CAP_USD_DEFAULT };
  }
}

/**
 * The finance invoicing switch (row `finance_invoicing_enabled`, 0250). Read per call, never
 * cached. Anything but `true` — a missing row, a failed read — is OFF: no write reaches Zoho
 * Books or Freshdesk from the finance module.
 */
export async function getFinanceSettings(): Promise<{ enabled: boolean }> {
  const { FINANCE_SETTING_KEYS } = await import('@/lib/constants/finance');
  return { enabled: (await getSettingValue(FINANCE_SETTING_KEYS.enabled)) === true };
}

/**
 * The two editable hands documents (rows `hands_rulebook` and `hands_elaya_guide`, 2026-10-01):
 * what the agent is told, and how Elaya writes to it. Read per call, never cached, so an edit on
 * /settings/hands reaches Elaya's next hands read. A missing or malformed row falls back to the
 * built-in text at version 0.
 */
export async function getHandsGuides(): Promise<{ rulebook: import('@/lib/types/hands').HandsGuideDoc; guide: import('@/lib/types/hands').HandsGuideDoc }> {
  const { HANDS_SETTING_KEYS, HANDS_RULEBOOK, HANDS_ELAYA_GUIDE_DEFAULT } = await import('@/lib/constants/hands');
  type Doc = import('@/lib/types/hands').HandsGuideDoc;
  const fallback = (body: string): Doc => ({ body, version: 0, at: null, by: null, note: null, source: 'default', history: [] });
  const read = (v: unknown, d: string): Doc => {
    const o = (v && typeof v === 'object' ? v : {}) as Partial<Doc>;
    if (typeof o.body !== 'string' || !o.body.trim()) return fallback(d);
    return {
      body: o.body, version: typeof o.version === 'number' ? o.version : 1, at: o.at ?? null, by: o.by ?? null, note: o.note ?? null,
      source: o.source ?? 'edit', history: Array.isArray(o.history) ? o.history.filter((h) => h && typeof h.body === 'string') : [],
    };
  };
  try {
    const { data } = await createAdminClient().from('elaya_settings').select('key, value').in('key', [HANDS_SETTING_KEYS.rulebook, HANDS_SETTING_KEYS.elayaGuide]);
    const rows = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    return { rulebook: read(rows.get(HANDS_SETTING_KEYS.rulebook), HANDS_RULEBOOK), guide: read(rows.get(HANDS_SETTING_KEYS.elayaGuide), HANDS_ELAYA_GUIDE_DEFAULT) };
  } catch {
    return { rulebook: fallback(HANDS_RULEBOOK), guide: fallback(HANDS_ELAYA_GUIDE_DEFAULT) };
  }
}

/**
 * THE read of the public bot's settings (0252): the switch (`public_bot_enabled`, OFF unless the
 * row is exactly true), the daily spend cap in dollars, and the team's test phones (digits, last
 * ten kept, compared by the caller the same way). Read per call, never cached: flipping the switch
 * stops the very next message. A failed read is OFF.
 */
export async function getPublicBotSettings(): Promise<{ enabled: boolean; dailyCapUsd: number; testPhones: string[] }> {
  const { PUBLIC_BOT_SETTING_KEYS, PUBLIC_BOT_DAILY_CAP_USD_DEFAULT } = await import('@/lib/constants/public-bot');
  try {
    const { data, error } = await createAdminClient().from('elaya_settings').select('key, value').in('key', Object.values(PUBLIC_BOT_SETTING_KEYS));
    if (error) return { enabled: false, dailyCapUsd: PUBLIC_BOT_DAILY_CAP_USD_DEFAULT, testPhones: [] };
    const rows = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const cap = rows.get(PUBLIC_BOT_SETTING_KEYS.dailyCapUsd);
    const phones = rows.get(PUBLIC_BOT_SETTING_KEYS.testPhones);
    return {
      enabled: rows.get(PUBLIC_BOT_SETTING_KEYS.enabled) === true,
      dailyCapUsd: typeof cap === 'number' && cap >= 0 ? cap : PUBLIC_BOT_DAILY_CAP_USD_DEFAULT,
      testPhones: Array.isArray(phones)
        ? phones.filter((p): p is string => typeof p === 'string').map((p) => p.replace(/\D/g, '').slice(-10)).filter((p) => p.length === 10)
        : [],
    };
  } catch {
    return { enabled: false, dailyCapUsd: PUBLIC_BOT_DAILY_CAP_USD_DEFAULT, testPhones: [] };
  }
}

/**
 * THE read of the teammate's switches (0257, constants/elaya-teammate.ts): the mode (off / shadow /
 * live; a missing or malformed row is SHADOW, never live) and the queendoms live delivery is on for.
 * Read per sweep, never cached.
 */
export async function getTeammateSettings(): Promise<{ mode: import('@/lib/constants/elaya-teammate').TeammateMode; queendomIds: string[] }> {
  const { TEAMMATE_SETTING_KEYS, TEAMMATE_MODES } = await import('@/lib/constants/elaya-teammate');
  try {
    const { data } = await createAdminClient().from('elaya_settings').select('key, value').in('key', Object.values(TEAMMATE_SETTING_KEYS));
    const rows = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const mode = rows.get(TEAMMATE_SETTING_KEYS.mode);
    const qs = rows.get(TEAMMATE_SETTING_KEYS.queendoms);
    return {
      mode: typeof mode === 'string' && (TEAMMATE_MODES as readonly string[]).includes(mode) ? (mode as import('@/lib/constants/elaya-teammate').TeammateMode) : 'shadow',
      queendomIds: Array.isArray(qs) ? qs.filter((q): q is string => typeof q === 'string') : [],
    };
  } catch {
    return { mode: 'shadow', queendomIds: [] };
  }
}
