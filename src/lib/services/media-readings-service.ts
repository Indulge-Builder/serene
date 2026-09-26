// media-readings-service.ts — THE public.media_readings access + THE sweep (Elaya's eyes, 0246,
// docs/architecture/media-understanding-plan.md). No `server-only`: runs from Trigger.dev and a
// laptop bench. Admin client throughout; the CALLER gates a page read with the scope it already
// holds (a reading is a column on a message the person may already see, never a new door).
//
// The shape: SQL finds stored files with no reading (media_enqueue_*), SQL claims a batch
// (media_claim), this file downloads the bytes, asks media-reader.ts, saves the row, and writes
// one sia.extraction_runs row per read. Money: a daily cap the backlog stops at while the live
// lane (files from the last 24 h) keeps a reserve. Failure: attempts count, dead at 3, never
// re-billed, still listed. The past: the redo pass re-profiles a conversation once an informative
// reading lands after the profiler already read it.

import { createAdminClient } from "@/lib/supabase/admin";
import { createRateGate, isRateLimited, retryAfterMs } from "@/lib/elaya/rate-gate";
import { maskPii } from "@/lib/elaya/pii";
import { getMediaDailyCapUsd, getPiiMaskingDepth, type PiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { readMediaFile, type MediaReadOutcome } from "@/lib/services/media-reader";
import { downloadSiaMediaBytes } from "@/lib/services/sia-media-store";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { toISTMidnight } from "@/lib/utils/ist";
import {
  MEDIA_ESCALATE_DEFAULT, MEDIA_FILE_MAX_BYTES, MEDIA_FOLD_LABEL, MEDIA_LIVE_HOURS, MEDIA_LIVE_RESERVE, MEDIA_MAX_ATTEMPTS, MEDIA_PARALLEL_READS,
  MEDIA_PDF_MAX_BYTES, MEDIA_REDO_WINDOWS_PER_RUN, MEDIA_RUN_KIND, MEDIA_SWEEP_BATCH, type MediaClass,
} from "@/lib/constants/media";
import { DEEP_READ_RATE_PAUSE_MAX_MS, DEEP_READ_RATE_PAUSE_MS } from "@/lib/constants/elaya-jobs";
import type { MediaReadingBrief, MediaReadingRow } from "@/lib/types/media";

const LOG = "[media-readings]";

// The table is not in the generated types until the next regen; one loose handle (the profiler's posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any; storage: { from: (b: string) => any } };
const db = (): Loose => createAdminClient() as unknown as Loose;
const sia = (): Loose => createAdminClient().schema("sia") as unknown as Loose;

// ─── Reads a page or a model reader uses ─────────────────────────────────────

/** The readings behind Sia messages, by wa_message_id (one group). Empty map when none. */
export async function getReadingsForSiaMessages(groupJid: string, waMessageIds: string[]): Promise<Map<string, MediaReadingBrief>> {
  const out = new Map<string, MediaReadingBrief>();
  if (waMessageIds.length === 0) return out;
  const { data, error } = await db().from("media_readings")
    .select("id, status, kind, class, sensitive, summary, confidence, extracted_text, context")
    .eq("source", "sia_media").eq("context->>group_jid", groupJid).in("context->>wa_message_id", waMessageIds);
  if (error) { console.warn(`${LOG} sia readings read failed`, error.message); return out; }
  for (const r of (data ?? []) as (MediaReadingBrief & { context: { wa_message_id?: string } })[]) {
    if (r.context?.wa_message_id) out.set(r.context.wa_message_id, { id: r.id, status: r.status, kind: r.kind, class: r.class, sensitive: r.sensitive, summary: r.summary, confidence: r.confidence, extracted_text: r.sensitive ? null : r.extracted_text });
  }
  return out;
}

/** The readings behind Freshdesk notes, keyed "<conversation_id>:<n>" (the attachment's 1-based position). */
export async function getReadingsForFreshdeskConversations(conversationIds: number[]): Promise<Map<string, MediaReadingBrief>> {
  const out = new Map<string, MediaReadingBrief>();
  if (conversationIds.length === 0) return out;
  const { data, error } = await db().from("media_readings")
    .select("id, source_ref, status, kind, class, sensitive, summary, confidence, extracted_text")
    .eq("source", "freshdesk_attachment").in("context->>conversation_id", conversationIds.map(String));
  if (error) { console.warn(`${LOG} freshdesk readings read failed`, error.message); return out; }
  for (const r of (data ?? []) as (MediaReadingBrief & { source_ref: string })[]) out.set(r.source_ref, { id: r.id, status: r.status, kind: r.kind, class: r.class, sensitive: r.sensitive, summary: r.summary, confidence: r.confidence, extracted_text: r.sensitive ? null : r.extracted_text });
  return out;
}

/**
 * The fold line for a message that carries a file: what a text reader sees in place of the file.
 * Mirrors the CASE in sia.wag_messages_read (0246); a change here is a change there.
 */
export function foldReadingLine(messageType: string, reading: MediaReadingBrief | null | undefined, opts: { withText?: boolean } = {}): string {
  const label = MEDIA_FOLD_LABEL[messageType] ?? "image";
  if (!reading) return `[${label}, not read yet]`;
  if (reading.status !== "done" || !reading.summary) return `[${label}, not read yet]`;
  let line = `[${label}: ${reading.summary}`;
  if (opts.withText !== false && !reading.sensitive && reading.extracted_text) {
    const t = reading.extracted_text.replace(/\s+/g, " ").trim();
    if (reading.kind === "audio" || reading.kind === "video") line += ` | said: ${t.slice(0, 900)}`;
    else line += ` | text: ${t.slice(0, 600)}`;
  }
  return line + "]";
}

/** Today's spend (IST day) and the backlog left, for the settings panel and the sweep's own gate. */
export async function getMediaSpendToday(): Promise<{ spentUsd: number; queued: number; done: number; dead: number }> {
  const since = toISTMidnight(new Date()).toISOString();
  const d = db();
  const [{ data: spend }, q, done, dead] = await Promise.all([
    d.from("media_readings").select("cost_usd").gte("read_at", since).not("cost_usd", "is", null).limit(5000),
    d.from("media_readings").select("id", { count: "exact", head: true }).eq("status", "queued"),
    d.from("media_readings").select("id", { count: "exact", head: true }).eq("status", "done"),
    d.from("media_readings").select("id", { count: "exact", head: true }).eq("status", "dead"),
  ]);
  const spentUsd = ((spend ?? []) as { cost_usd: number | string }[]).reduce((n, r) => n + Number(r.cost_usd ?? 0), 0);
  return { spentUsd, queued: Number(q.count ?? 0), done: Number(done.count ?? 0), dead: Number(dead.count ?? 0) };
}

// ─── Bytes ───────────────────────────────────────────────────────────────────

async function loadBytes(row: MediaReadingRow): Promise<{ bytes: Buffer; contentType: string | null } | { skip: string }> {
  const max = row.kind === "pdf" ? MEDIA_PDF_MAX_BYTES : row.kind === "audio" || row.kind === "video" ? 64 * 1024 * 1024 : MEDIA_FILE_MAX_BYTES;
  if (row.size_bytes && row.size_bytes > max) return { skip: `file is ${Math.round(row.size_bytes / 1024 / 1024)} MB, over the ${Math.round(max / 1024 / 1024)} MB limit` };
  try {
    if (row.bucket === "s3" || row.path.startsWith("s3://")) {
      const got = await downloadSiaMediaBytes(row.path, max);
      return got ?? { skip: "file not in the archive or over the limit" };
    }
    if (!row.bucket) return { skip: "no bucket" };
    const { data, error } = await db().storage.from(row.bucket).download(row.path);
    if (error || !data) return { skip: `download failed: ${error?.message ?? "no data"}` };
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength > max) return { skip: `file is over the ${Math.round(max / 1024 / 1024)} MB limit` };
    return { bytes, contentType: (data as Blob).type || null };
  } catch (e) {
    return { skip: `download threw: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}` };
  }
}

// ─── The caption the model may see: masked, never a member's name ────────────

type CaptionSource = { text: string | null; setting: string; durationSeconds: number | null };

async function captionFor(row: MediaReadingRow, depth: PiiMaskingDepth, nameMask: (groupJid: string, text: string) => Promise<string>): Promise<CaptionSource> {
  if (row.source === "sia_media") {
    const c = row.context;
    const { data } = await sia().from("wag_messages").select("text").eq("chat_jid", c.group_jid).eq("wa_message_id", c.wa_message_id).limit(1);
    const text = ((data ?? []) as { text: string | null }[])[0]?.text ?? null;
    const { data: md } = await sia().from("wag_media").select("duration_seconds").eq("id", row.source_ref).maybeSingle();
    const masked = text ? maskPii(await nameMask(c.group_jid as string, text), depth) : null;
    return { text: masked, setting: "a member's WhatsApp group with the Indulge concierge team", durationSeconds: (md as { duration_seconds: number | null } | null)?.duration_seconds ?? null };
  }
  if (row.source === "freshdesk_attachment") {
    const { data } = await createAdminClient().schema("freshdesk").from("conversations").select("body_text").eq("id", Number(row.context.conversation_id)).maybeSingle();
    const body = (data as { body_text: string | null } | null)?.body_text ?? null;
    return { text: body ? maskPii(body.slice(0, 400), depth) : null, setting: "a note on a Freshdesk ticket of the Indulge concierge team", durationSeconds: null };
  }
  return { text: null, setting: "a file shared with the Indulge concierge team", durationSeconds: null };
}

/** The profiler's vault, opened once per group per run, so a caption never carries a member's name to the model. */
function makeNameMask(): (groupJid: string, text: string) => Promise<string> {
  const vaults = new Map<string, ((t: string) => string) | null>();
  return async (groupJid, text) => {
    if (!vaults.has(groupJid)) {
      try {
        const { openVault, getBroadSenders } = await import("@/lib/services/member-profiler");
        const { data: g } = await sia().from("wag_groups").select("member_id").eq("group_jid", groupJid).maybeSingle();
        const memberId = (g as { member_id: string | null } | null)?.member_id;
        const v = memberId ? await openVault(groupJid, memberId, [], await getBroadSenders()) : null;
        vaults.set(groupJid, v ? v.mask : null);
      } catch { vaults.set(groupJid, null); }
    }
    const mask = vaults.get(groupJid);
    return mask ? mask(text) : text;
  };
}

// ─── One file ────────────────────────────────────────────────────────────────

async function saveOutcome(row: MediaReadingRow, outcome: MediaReadOutcome, startedAt: string, durationMs: number): Promise<void> {
  const d = db();
  if (outcome.ok) {
    const r = outcome.reading;
    await d.from("media_readings").update({
      status: "done", class: r.class, sensitive: r.sensitive, summary: r.summary, description: r.description, extracted_text: r.extracted_text, fields: r.fields,
      language: r.language, confidence: r.confidence, model: r.model, prompt_version: r.prompt_version, input_tokens: r.tokens.in, output_tokens: r.tokens.out,
      cost_usd: r.cost_usd, duration_ms: durationMs, read_at: new Date().toISOString(), last_error: null,
    }).eq("id", row.id);
    await sia().from("extraction_runs").insert({
      kind: MEDIA_RUN_KIND, model: r.model, prompt_version: r.prompt_version, started_at: startedAt, finished_at: new Date().toISOString(), ok: true,
      client_id: row.context.member_id ?? null, tokens_in: r.tokens.in, tokens_out: r.tokens.out, cost_usd: r.cost_usd,
      input_ref: { reading_id: row.id, source: row.source, source_ref: row.source_ref, kind: row.kind, tier: r.tier },
      output: { class: r.class, sensitive: r.sensitive, summary: r.summary, confidence: r.confidence, raw: r.sensitive ? "(sensitive: not kept)" : r.raw.slice(0, 3000) },
    });
    return;
  }
  const dead = !outcome.skip && row.attempts >= MEDIA_MAX_ATTEMPTS;
  const status = outcome.skip ? "skipped" : dead ? "dead" : "queued";
  await d.from("media_readings").update({ status, last_error: outcome.error.slice(0, 500), read_at: new Date().toISOString(), duration_ms: durationMs }).eq("id", row.id);
  if (!outcome.skip) {
    await sia().from("extraction_runs").insert({
      kind: MEDIA_RUN_KIND, started_at: startedAt, finished_at: new Date().toISOString(), ok: false, client_id: row.context.member_id ?? null,
      input_ref: { reading_id: row.id, source: row.source, source_ref: row.source_ref, kind: row.kind, attempt: row.attempts }, error: outcome.error.slice(0, 500),
    });
  }
}

async function escalateRule(): Promise<{ classes: MediaClass[]; below_confidence: number }> {
  try {
    const { getMediaEscalateRule } = await import("@/lib/services/llm-providers-service");
    return await getMediaEscalateRule();
  } catch { return MEDIA_ESCALATE_DEFAULT; }
}

/**
 * Read one claimed row end to end. Returns the cost. Never throws; a rate limit is waited out
 * through the gate and retried once inside the deadline.
 */
export async function readOne(row: MediaReadingRow, ctx: { depth: PiiMaskingDepth; nameMask: ReturnType<typeof makeNameMask>; gate: ReturnType<typeof createRateGate>; deadline: number; escalate: { classes: MediaClass[]; below_confidence: number } }): Promise<{ ok: boolean; costUsd: number; skipped: boolean }> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const got = await loadBytes(row);
  if ("skip" in got) { await saveOutcome(row, { ok: false, error: got.skip, skip: true }, startedAt, Date.now() - t0); return { ok: false, costUsd: 0, skipped: true }; }
  const cap = await captionFor(row, ctx.depth, ctx.nameMask);
  const input = { kind: row.kind, mime: row.mime ?? got.contentType, bytes: got.bytes, caption: cap.text, setting: cap.setting, durationSeconds: cap.durationSeconds };

  let outcome: MediaReadOutcome | null = null;
  for (let attempt = 0; attempt < 2 && Date.now() < ctx.deadline; attempt++) {
    await ctx.gate.wait(ctx.deadline);
    outcome = await readMediaFile(input, { piiDepth: ctx.depth });
    if (!outcome.ok && isRateLimited(new Error(outcome.error))) { ctx.gate.hit(retryAfterMs(new Error(outcome.error))); continue; }
    ctx.gate.ok();
    break;
  }
  if (!outcome) outcome = { ok: false, error: "out of time before the read" };

  // The second, dearer look: only for the classes where a low first reading costs the team money or a booking.
  let cost = outcome.ok ? outcome.reading.cost_usd : 0;
  if (outcome.ok && !outcome.reading.sensitive && ctx.escalate.classes.includes(outcome.reading.class) && outcome.reading.confidence < ctx.escalate.below_confidence && Date.now() < ctx.deadline) {
    await ctx.gate.wait(ctx.deadline);
    const second = await readMediaFile(input, { tier: "reasoning", piiDepth: ctx.depth });
    if (second.ok) { second.reading.cost_usd += cost; outcome = second; cost = second.reading.cost_usd; }
  }
  await saveOutcome(row, outcome, startedAt, Date.now() - t0);
  return { ok: outcome.ok, costUsd: cost, skipped: false };
}

// ─── The sweep ───────────────────────────────────────────────────────────────

export type SweepReport = { enqueued: { sia: number; freshdesk: number }; released: number; read: number; failed: number; skipped: number; spentUsd: number; lane: "live" | "backlog" | "both" | "none"; stoppedBy: string | null };

export async function runMediaSweep(opts: { apply: boolean; deadlineMs: number; backlog: boolean; batch?: number }): Promise<SweepReport> {
  const deadline = Date.now() + opts.deadlineMs;
  const report: SweepReport = { enqueued: { sia: 0, freshdesk: 0 }, released: 0, read: 0, failed: 0, skipped: 0, spentUsd: 0, lane: "none", stoppedBy: null };
  const d = db();

  const [sia_, fd, rel] = await Promise.all([
    d.rpc("media_enqueue_sia", { p_limit: 2000, p_newest_first: true }),
    d.rpc("media_enqueue_freshdesk", { p_limit: 2000, p_newest_first: true }),
    d.rpc("media_release_stale", { p_minutes: 60 }),
  ]);
  report.enqueued = { sia: Number(sia_.data ?? 0), freshdesk: Number(fd.data ?? 0) };
  report.released = Number(rel.data ?? 0);
  if (sia_.error) console.warn(`${LOG} enqueue sia failed`, sia_.error.message);
  if (fd.error) console.warn(`${LOG} enqueue freshdesk failed`, fd.error.message);
  if (!opts.apply) return report;

  const [cap, spend, depth, escalate] = await Promise.all([getMediaDailyCapUsd(), getMediaSpendToday(), getPiiMaskingDepth(), escalateRule()]);
  let spent = spend.spentUsd;
  const gate = createRateGate({ pauseMs: DEEP_READ_RATE_PAUSE_MS, pauseMaxMs: DEEP_READ_RATE_PAUSE_MAX_MS });
  const nameMask = makeNameMask();
  const batch = opts.batch ?? MEDIA_SWEEP_BATCH;

  const runLane = async (live: boolean, budgetUsd: number): Promise<void> => {
    while (Date.now() < deadline && spent < budgetUsd) {
      const { data, error } = await d.rpc("media_claim", { p_limit: Math.min(batch, MEDIA_PARALLEL_READS * 6), p_live_only: live, p_live_hours: MEDIA_LIVE_HOURS });
      if (error) { console.warn(`${LOG} claim failed`, error.message); report.stoppedBy = "claim failed"; return; }
      const rows = (data ?? []) as MediaReadingRow[];
      if (rows.length === 0) return;
      report.lane = report.lane === "none" ? (live ? "live" : "backlog") : report.lane === (live ? "live" : "backlog") ? report.lane : "both";
      await mapWithConcurrency(rows, MEDIA_PARALLEL_READS, async (row) => {
        if (Date.now() >= deadline || spent >= budgetUsd) {
          // Out of time or money: hand the claim back untouched (attempts stays counted; it was never billed).
          await d.from("media_readings").update({ status: "queued", attempts: Math.max(0, row.attempts - 1) }).eq("id", row.id);
          return;
        }
        const r = await readOne(row, { depth, nameMask, gate, deadline, escalate });
        spent += r.costUsd; report.spentUsd += r.costUsd;
        if (r.skipped) report.skipped++; else if (r.ok) report.read++; else report.failed++;
      });
    }
    if (spent >= budgetUsd) report.stoppedBy = live ? "daily cap" : "backlog share of the daily cap";
    else if (Date.now() >= deadline) report.stoppedBy = "time budget";
  };

  // Live first, with the whole cap; the backlog only up to its share, so a big history can never starve today.
  await runLane(true, cap);
  if (opts.backlog && Date.now() < deadline) await runLane(false, cap * (1 - MEDIA_LIVE_RESERVE));
  return report;
}

// ─── The redo pass: the past, re-read where a file changed what a conversation meant ─

export type RedoReport = { groups: number; windows: number; read: number; failed: number; readingsMarked: number };

/**
 * For each member group where informative readings landed AFTER the profiler passed that moment:
 * rebuild the conversations around those files from sia.wag_messages_read (the fold), run the
 * profiler's own reading on them (same prompt, same vault, same dedup), and mark the readings.
 * The profiler's facts supersede by key and its events dedupe on the first message id, so a
 * second reading of the same conversation adds what the file taught and repeats nothing.
 */
export async function runMediaRedo(opts: { apply: boolean; deadlineMs: number; maxGroups?: number }): Promise<RedoReport> {
  const deadline = Date.now() + opts.deadlineMs;
  const report: RedoReport = { groups: 0, windows: 0, read: 0, failed: 0, readingsMarked: 0 };
  const { data, error } = await db().rpc("media_redo_groups", { p_limit: opts.maxGroups ?? MEDIA_REDO_WINDOWS_PER_RUN, p_statuses: ["Active"] });
  if (error) { console.warn(`${LOG} redo groups failed`, error.message); return report; }
  const groups = (data ?? []) as { group_jid: string; member_id: string; first_at: string; last_at: string; readings: number }[];
  if (groups.length === 0) return report;
  const { buildWindows, profileWindow, getBroadSenders } = await import("@/lib/services/member-profiler");
  const { PROFILER_QUIET_HOURS } = await import("@/lib/constants/member-profiler");
  const broad = await getBroadSenders();
  const padMs = PROFILER_QUIET_HOURS * 3600_000;

  for (const g of groups) {
    if (Date.now() >= deadline) break;
    report.groups++;
    const { data: readingRows } = await db().from("media_readings").select("id, context").eq("source", "sia_media").eq("status", "done").is("reprofiled_at", null).eq("context->>group_jid", g.group_jid).limit(500);
    const readings = ((readingRows ?? []) as { id: string; context: { at?: string } }[]).filter((r) => r.context.at);
    const moments = readings.map((r) => new Date(r.context.at as string).getTime()).sort((a, b) => a - b);
    // Cluster the files' moments into conversations (a quiet gap ends one), then read each cluster with its context.
    const ranges: { from: number; to: number }[] = [];
    for (const t of moments) {
      const last = ranges[ranges.length - 1];
      if (last && t - last.to < padMs) last.to = t; else ranges.push({ from: t, to: t });
    }
    let allOk = true;
    for (const r of ranges) {
      if (Date.now() >= deadline) { allOk = false; break; }
      const { data: msgs, error: mErr } = await sia().from("wag_messages_read").select("id, sender_jid, text:text_read, type, wa_timestamp")
        .eq("chat_jid", g.group_jid).eq("is_revoked", false).not("text_read", "is", null)
        .gte("wa_timestamp", new Date(r.from - padMs).toISOString()).lte("wa_timestamp", new Date(r.to + padMs).toISOString())
        .order("wa_timestamp", { ascending: true }).limit(400);
      if (mErr) { console.warn(`${LOG} redo messages failed`, mErr.message); allOk = false; continue; }
      const list = ((msgs ?? []) as { id: string; sender_jid: string; text: string; type: string; wa_timestamp: string }[]).filter((m) => m.text && m.text.trim());
      if (list.length === 0) continue;
      // The whole span is one finished conversation as far as this pass is concerned (the files' moments are all in the past).
      const windows = buildWindows(g.group_jid, g.member_id, list, Date.now());
      for (const w of windows) {
        if (Date.now() >= deadline) { allOk = false; break; }
        report.windows++;
        const o = await profileWindow(w, { broad, apply: opts.apply });
        if (o.status === "failed") { report.failed++; allOk = false; } else report.read++;
      }
    }
    if (allOk && opts.apply && readings.length) {
      const { error: uErr } = await db().from("media_readings").update({ reprofiled_at: new Date().toISOString() }).in("id", readings.map((x) => x.id));
      if (!uErr) report.readingsMarked += readings.length;
    }
  }
  return report;
}
