// elaya-alerts.ts — THE live alert sweep (migration 0235, 2026-09-24). Every five minutes, from
// Trigger.dev: is anything going wrong right now that a founder should hear about this minute?
//
//   A. unanswered — a member's last word has stood unanswered for ALERT_UNANSWERED_MINUTES (inside
//      the active hours; the same read as the pulse, sign-offs excluded).
//   B. tickets — a Freshdesk ticket escalated, went urgent, or was reopened since the last sweep
//      (from the movement ledger, so nothing is missed between sweeps).
//   C. tone — a member group with new member messages since the last sweep is read by the routing
//      tier: anger, a complaint, a visible mistake by us, an urgent same-day matter (severity 2 or 3
//      fires; one alert per group per kind inside the cooldown).
//   D. silent turns — a message to Elaya with no reply after SILENT_TURN_MINUTES: the TECH responders
//      are told (the Sia alert template + in-app), never the founders.
//
// Every alert is one row in elaya_alerts first (the dedupe key refuses a repeat), then delivered:
// founders on WhatsApp (free text inside their 24-hour window, else the template ping) and in-app.
// Gated by `elaya_alerts_enabled`; the bookmark lives in `elaya_alerts_state`. Fails closed: a read
// that throws alerts nobody, and the bookmark still moves so a bad window is not re-read forever.

import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveLlmForJob } from '@/lib/elaya/registry';
import { maskPii } from '@/lib/elaya/pii';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import { runElayaQuery } from '@/lib/services/elaya-query-service';
import { getWaitingGroups } from '@/lib/services/pulse-service';
import { sendElayaWhatsAppReply, sendElayaTemplatePing, sendSiaAlertNotification } from '@/lib/services/whatsapp-api';
import { createNotification } from '@/lib/services/notifications-service';
import { waFreeTextWindowOpen } from '@/lib/services/elaya-service';
import { markdownToWhatsApp } from '@/lib/utils/whatsapp-format';
import { mapWithConcurrency } from '@/lib/utils/concurrency';
import { mapRows } from '@/lib/utils/rows';
import { toIst, formatIstClock } from '@/lib/utils/ist';
import { siaGroupHref } from '@/lib/constants/sia-roles';
import { FRESHDESK_PATH } from '@/lib/constants/freshdesk';
import { SIA_ALERT_TIER1_PROFILE_IDS } from '@/lib/constants/sia-alerts';
import {
  ALERT_ACTIVE_HOURS_IST, ALERT_COOLDOWN_HOURS, ALERT_RUN_KIND, ALERT_SETTLE_SECONDS, ALERTS_STATE_KEY, ALERT_TONE_CONTEXT_MESSAGES,
  ALERT_TONE_GROUPS_PER_SWEEP, ALERT_TONE_PROMPT_VERSION, ALERT_UNANSWERED_MAX_HOURS, ALERT_UNANSWERED_MINUTES, SILENT_TURN_MINUTES,
  type ElayaAlertKind,
} from '@/lib/constants/elaya-jobs';

const LOG = '[elaya-alerts]';
const md5 = (s: string) => createHash('md5').update(s).digest('hex');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0235 is not in the generated types until the next regen
const admin = () => createAdminClient() as any;

type Founder = { id: string; full_name: string; phone: string | null };
type Alert = {
  kind: ElayaAlertKind;
  severity: 1 | 2 | 3;
  dedupeKey: string;
  title: string;
  body: string;
  groupJid?: string | null;
  memberId?: string | null;
  ticketId?: number | null;
  conversationId?: string | null;
  actionUrl: string;
  /** Who hears it: founders (the default) or the tech responders. */
  audience: 'founders' | 'tech';
};

export type AlertSweepResult = { since: string; until: string; considered: Record<string, number>; fired: number; skipped: number; judged: number };

// ── State ────────────────────────────────────────────────────────────────────

async function readState(): Promise<{ last_sweep_at: string | null }> {
  const { data } = await admin().from('elaya_settings').select('value').eq('key', ALERTS_STATE_KEY).maybeSingle();
  const v = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
  return { last_sweep_at: typeof v.last_sweep_at === 'string' ? v.last_sweep_at : null };
}
async function writeState(lastSweepAt: string): Promise<void> {
  const { error } = await admin().from('elaya_settings').upsert({ key: ALERTS_STATE_KEY, value: { last_sweep_at: lastSweepAt }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error(`${LOG} state write failed:`, error.message);
}

function inActiveHours(now: Date): boolean {
  const h = toIst(now).hour;
  return h >= ALERT_ACTIVE_HOURS_IST[0] && h < ALERT_ACTIVE_HOURS_IST[1];
}

// ── A. Unanswered members ────────────────────────────────────────────────────

async function unansweredAlerts(now: Date): Promise<Alert[]> {
  if (!inActiveHours(now)) return [];
  const rows = await getWaitingGroups(ALERT_UNANSWERED_MINUTES, ALERT_UNANSWERED_MAX_HOURS, 100);
  if (!rows) return [];
  return rows.map((r) => {
    const hours = Math.round((r.waiting_minutes / 60) * 10) / 10;
    return {
      kind: 'unanswered' as const,
      severity: r.waiting_minutes >= 24 * 60 ? 3 : 2,
      dedupeKey: `unanswered:${r.group_jid}:${r.last_message_at}`,
      title: `${r.member ?? r.subject ?? 'A member'} is waiting on us, ${hours} h`,
      body: `In ${r.subject ?? 'their group'}: "${(r.last_text ?? '').slice(0, 200)}" and nobody has replied since ${formatIstClock(new Date(r.last_message_at))} IST.`,
      groupJid: r.group_jid,
      memberId: r.member_id,
      actionUrl: siaGroupHref(r.group_jid),
      audience: 'founders' as const,
    };
  });
}

// ── B. Freshdesk movements ───────────────────────────────────────────────────

async function ticketAlerts(since: string, until: string): Promise<Alert[]> {
  const r = await runElayaQuery(
    `select c.ticket_id, c.field, c.old_value, c.new_value, c.changed_at, left(t.subject, 120) as subject, t.requester_name as requester, t.priority, t.status_label as status, coalesce(q.name, g.name, 'other') as queendom
     from freshdesk_ticket_changes c join freshdesk_tickets t on t.ticket_id = c.ticket_id left join freshdesk_groups g on g.group_id = t.group_id left join queendoms q on q.freshdesk_group_id = t.group_id
     where c.changed_at > '${since}'::timestamptz and c.changed_at <= '${until}'::timestamptz
       and ((c.field = 'is_escalated' and lower(c.new_value) in ('true','t','1')) or (c.field = 'priority' and c.new_value = '4') or (c.field = 'status' and c.old_value in ('4','5') and c.new_value not in ('4','5')))
     order by c.changed_at desc`,
    100,
  );
  if (!r.ok) { console.warn(`${LOG} ticket read failed:`, r.error); return []; }
  return r.rows.map((x) => {
    const ticket = Number(x.ticket_id);
    const reopened = x.field === 'status';
    const kind: ElayaAlertKind = reopened ? 'ticket_reopened' : 'ticket_escalated';
    const what = reopened ? 'was reopened' : x.field === 'priority' ? 'went urgent' : 'was escalated';
    return {
      kind,
      severity: 2 as const,
      dedupeKey: `fd:${ticket}:${x.field}:${x.changed_at}`,
      title: `Freshdesk #${ticket} ${what} (${x.queendom})`,
      body: `${x.requester ?? 'A member'}: "${x.subject ?? ''}" is now ${x.status ?? 'open'}, priority ${x.priority ?? '?'}.`,
      ticketId: ticket,
      actionUrl: `${FRESHDESK_PATH}/${ticket}`,
      audience: 'founders' as const,
    };
  });
}

// ── C. Tone ──────────────────────────────────────────────────────────────────

const TONE_SYSTEM = `You watch one WhatsApp group between Indulge's concierge team (S = staff) and a member, the client (M). Read the latest messages, newest last, and decide whether the founders should be told RIGHT NOW. Reply with ONE JSON object and nothing else:
{"concern": "none" | "angry" | "complaint" | "ignored" | "agent_mistake" | "urgent", "severity": 0 | 1 | 2 | 3, "title": "<at most 9 words>", "summary": "<one or two plain sentences: who, what, when>", "quote": "<the member's own words that show it, short, verbatim>"}
severity 3: the member is angry, threatens to leave or complain, disputes money, or has a safety or same-day travel emergency with no answer. 2: a clear complaint, a visible mistake by our team (wrong booking, charged wrongly, promised and missed), or the member repeating themselves because nobody answered. 1: mild friction. 0: nothing. Ordinary requests, questions, chit-chat, a plain thanks are "none", 0. Judge only the member's side; a staff apology alone is not a concern. Never invent.`;

type ToneVerdict = { concern: string; severity: number; title: string; summary: string; quote: string };

async function toneAlerts(since: string, settleUntil: string, deadline: number, judged: { n: number }): Promise<Alert[]> {
  // Groups with new MEMBER messages in the window, most first.
  const r = await runElayaQuery(
    `select m.group_id, count(*) as member_msgs from whatsapp_messages m join whatsapp_groups g on g.group_id = m.group_id
     where g.kind = 'member' and g.member_id is not null and not m.is_staff and not m.deleted and m.type not in ('system','reaction','protocol')
       and m.sent_at > '${since}'::timestamptz and m.sent_at <= '${settleUntil}'::timestamptz
     group by 1 order by 2 desc limit ${ALERT_TONE_GROUPS_PER_SWEEP}`,
    ALERT_TONE_GROUPS_PER_SWEEP,
  );
  if (!r.ok || r.rows.length === 0) return [];
  const wanted = new Set(r.rows.map((x) => String(x.group_id)));

  // The view keys a group by md5(jid); the jid is what an alert links to and what the cooldown keys on.
  const { data: groups } = await admin().schema('sia').from('wag_groups').select('group_jid, subject, member_id').eq('group_kind', 'member').eq('is_active', true);
  type G = { group_jid: string; subject: string | null; member_id: string | null };
  const byMd5 = new Map<string, G>();
  mapRows<G, void>(groups, (g) => { const h = md5(g.group_jid); if (wanted.has(h)) byMd5.set(h, g); });
  if (byMd5.size === 0) return [];

  // Cooldown: any tone alert on the same group inside the window means this sweep stays quiet on it.
  const cutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 3600_000).toISOString();
  const { data: recent } = await admin().from('elaya_alerts').select('group_jid').eq('kind', 'tone').gte('fired_at', cutoff).in('group_jid', [...byMd5.values()].map((g) => g.group_jid));
  const cooled = new Set(mapRows<{ group_jid: string }, string>(recent, (x) => x.group_jid));

  const names = new Map<string, string>();
  const ids = [...new Set([...byMd5.values()].map((g) => g.member_id).filter((x): x is string => Boolean(x)))];
  if (ids.length) {
    const { data: ms } = await admin().schema('member').from('members').select('id, full_name').in('id', ids);
    mapRows<{ id: string; full_name: string }, void>(ms, (m) => { names.set(m.id, m.full_name); });
  }

  const depth = await getPiiMaskingDepth();
  const llm = await resolveLlmForJob('routing');
  const candidates = [...byMd5.entries()].filter(([, g]) => !cooled.has(g.group_jid));
  const alerts: Alert[] = [];
  await mapWithConcurrency(candidates, 4, async ([h, g]) => {
    if (Date.now() > deadline) return;
    const ctx = await runElayaQuery(
      `select to_char(sent_at at time zone 'Asia/Kolkata', 'DD HH24:MI') as at, is_staff, sender_name, type, left(text, 300) as text from whatsapp_messages where group_id = '${h}' and not deleted and type not in ('system','reaction','protocol') order by sent_at desc limit ${ALERT_TONE_CONTEXT_MESSAGES}`,
      ALERT_TONE_CONTEXT_MESSAGES,
    );
    if (!ctx.ok || ctx.rows.length === 0) return;
    const lines = [...ctx.rows].reverse().map((m) => `${m.at} ${m.is_staff ? 'S' : 'M'} ${m.sender_name ?? '?'}: ${m.text ?? (m.type ? `[${m.type}]` : '')}`).join('\n');
    try {
      const res = await llm.adapter.complete({ model: llm.model, maxTokens: 400, timeoutMs: 40_000, cachePrefix: true, system: TONE_SYSTEM, messages: [{ role: 'user', content: maskPii(lines, depth) }] });
      judged.n++;
      const a = res.text.indexOf('{'), b = res.text.lastIndexOf('}');
      if (a < 0 || b <= a) return;
      const v = JSON.parse(res.text.slice(a, b + 1)) as ToneVerdict;
      const sev = Math.max(0, Math.min(3, Math.round(Number(v.severity) || 0)));
      if (sev < 2 || !v.concern || v.concern === 'none') return;
      const member = g.member_id ? (names.get(g.member_id) ?? null) : null;
      alerts.push({
        kind: 'tone',
        severity: sev as 2 | 3,
        dedupeKey: `tone:${g.group_jid}:${v.concern}:${settleUntil}`,
        title: `${member ?? g.subject ?? 'A member'}: ${String(v.title ?? v.concern).slice(0, 80)}`,
        body: `${String(v.summary ?? '').slice(0, 300)}${v.quote ? ` "${String(v.quote).slice(0, 160)}"` : ''} (${g.subject ?? 'their group'})`,
        groupJid: g.group_jid,
        memberId: g.member_id,
        actionUrl: siaGroupHref(g.group_jid),
        audience: 'founders',
      });
    } catch (e) {
      console.warn(`${LOG} tone read failed for a group:`, e instanceof Error ? e.message : e);
    }
  });
  return alerts;
}

// ── D. Silent turns (tech) ───────────────────────────────────────────────────

async function silentTurnAlerts(now: Date): Promise<Alert[]> {
  const to = new Date(now.getTime() - SILENT_TURN_MINUTES * 60_000).toISOString();
  const from = new Date(now.getTime() - 40 * 60_000).toISOString();
  const { data: users } = await admin().from('elaya_messages').select('id, conversation_id, sender_id, channel, content, created_at').eq('role', 'user').gte('created_at', from).lte('created_at', to).order('created_at');
  type U = { id: string; conversation_id: string; sender_id: string | null; channel: string; content: string; created_at: string };
  const rows = mapRows<U, U>(users, (x) => x);
  if (rows.length === 0) return [];
  const { data: replies } = await admin().from('elaya_messages').select('conversation_id, created_at').eq('role', 'assistant').gte('created_at', from).in('conversation_id', [...new Set(rows.map((r) => r.conversation_id))]);
  const lastReply = new Map<string, string>();
  mapRows<{ conversation_id: string; created_at: string }, void>(replies, (x) => { const cur = lastReply.get(x.conversation_id); if (!cur || x.created_at > cur) lastReply.set(x.conversation_id, x.created_at); });
  const silent = rows.filter((u) => !(lastReply.get(u.conversation_id) && (lastReply.get(u.conversation_id) as string) > u.created_at));
  if (silent.length === 0) return [];
  const { data: profs } = await admin().from('profiles').select('id, full_name').in('id', [...new Set(silent.map((u) => u.sender_id).filter(Boolean))]);
  const who = new Map<string, string>();
  mapRows<{ id: string; full_name: string }, void>(profs, (p) => { who.set(p.id, p.full_name); });
  return silent.map((u) => ({
    kind: 'silent_turn' as const,
    severity: 2 as const,
    dedupeKey: `silent:${u.id}`,
    title: `Elaya did not reply to ${who.get(u.sender_id ?? '') ?? 'a user'} (${u.channel})`,
    body: `Sent ${formatIstClock(new Date(u.created_at))} IST: "${u.content.slice(0, 160)}". No assistant reply after ${SILENT_TURN_MINUTES} minutes. Check the brain logs and the WhatsApp gate.`,
    conversationId: u.conversation_id,
    actionUrl: '/elaya',
    audience: 'tech' as const,
  }));
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function record(a: Alert): Promise<string | null> {
  const { data, error } = await admin().from('elaya_alerts').insert({
    kind: a.kind, severity: a.severity, dedupe_key: a.dedupeKey, group_jid: a.groupJid ?? null, member_id: a.memberId ?? null,
    ticket_id: a.ticketId ?? null, conversation_id: a.conversationId ?? null, title: a.title, body: a.body,
  }).select('id').single();
  if (error) {
    if (error.code !== '23505') console.error(`${LOG} record failed:`, error.message);
    return null; // 23505 = already fired for this incident
  }
  return (data as { id: string }).id;
}

async function deliverToFounders(a: Alert, founders: Founder[]): Promise<Record<string, unknown>> {
  const text = `**${a.title}**\n${a.body}`;
  const delivered: Record<string, unknown> = { in_app: 0, whatsapp: 0, pinged: 0 };
  for (const f of founders) {
    const first = f.full_name.split(' ')[0] ?? f.full_name;
    if (f.phone) {
      if (await waFreeTextWindowOpen(f.id)) {
        if (await sendElayaWhatsAppReply(f.phone, markdownToWhatsApp(text), f.id)) delivered.whatsapp = (delivered.whatsapp as number) + 1;
      } else if (await sendElayaTemplatePing(f.phone, f.id, first, a.title, a.body)) {
        delivered.pinged = (delivered.pinged as number) + 1;
      }
    }
    const { error } = await createNotification({ recipient_id: f.id, type: 'system', action_url: a.actionUrl, title: a.title, body: a.body.slice(0, 240) });
    if (!error) delivered.in_app = (delivered.in_app as number) + 1;
  }
  return delivered;
}

async function deliverToTech(a: Alert): Promise<Record<string, unknown>> {
  await sendSiaAlertNotification(a.title, a.body, 'tier1');
  let inApp = 0;
  for (const id of SIA_ALERT_TIER1_PROFILE_IDS) {
    const { error } = await createNotification({ recipient_id: id, type: 'system', action_url: a.actionUrl, title: a.title, body: a.body.slice(0, 240) });
    if (!error) inApp++;
  }
  return { tech_template: true, in_app: inApp };
}

// ── The sweep ────────────────────────────────────────────────────────────────

export async function runAlertSweep(opts: { apply: boolean; deadlineMs: number }): Promise<AlertSweepResult> {
  const now = new Date();
  const deadline = Date.now() + opts.deadlineMs;
  const state = await readState();
  const since = state.last_sweep_at ?? new Date(now.getTime() - 15 * 60_000).toISOString();
  const until = now.toISOString();
  const settleUntil = new Date(now.getTime() - ALERT_SETTLE_SECONDS * 1000).toISOString();
  const judged = { n: 0 };

  const { data: fdata } = await admin().from('profiles').select('id, full_name, phone').eq('role', 'founder').eq('is_active', true);
  const founders = mapRows<Founder, Founder>(fdata, (x) => x);

  const settled = await Promise.allSettled([
    unansweredAlerts(now),
    ticketAlerts(since, until),
    toneAlerts(since, settleUntil, deadline, judged),
    silentTurnAlerts(now),
  ]);
  const considered: Record<string, number> = {};
  const all: Alert[] = [];
  for (const [i, s] of settled.entries()) {
    const name = ['unanswered', 'tickets', 'tone', 'silent_turn'][i];
    if (s.status === 'fulfilled') { considered[name] = s.value.length; all.push(...s.value); }
    else { considered[name] = -1; console.error(`${LOG} ${name} failed:`, s.reason instanceof Error ? s.reason.message : s.reason); }
  }

  let fired = 0, skipped = 0;
  const admin_ = admin();
  for (const a of all.sort((x, y) => y.severity - x.severity)) {
    if (!opts.apply) { skipped++; continue; }
    const id = await record(a);
    if (!id) { skipped++; continue; }
    const delivered = a.audience === 'tech' ? await deliverToTech(a) : await deliverToFounders(a, founders);
    await admin_.from('elaya_alerts').update({ delivered }).eq('id', id);
    fired++;
  }

  // One ledger row per sweep that judged anything (the run kind the ai_runs view lists).
  if (judged.n > 0 || fired > 0) {
    await admin_.schema('sia').from('extraction_runs').insert({
      kind: ALERT_RUN_KIND, prompt_version: ALERT_TONE_PROMPT_VERSION, started_at: until, finished_at: new Date().toISOString(), ok: true,
      input_ref: { since, until, considered, judged: judged.n, dry_run: !opts.apply }, output: { fired, skipped, alerts: all.map((a) => ({ kind: a.kind, severity: a.severity, title: a.title })) },
    });
  }
  if (opts.apply) await writeState(until);
  const result = { since, until, considered, fired, skipped, judged: judged.n };
  console.log(LOG, 'sweep', JSON.stringify(result));
  return result;
}
