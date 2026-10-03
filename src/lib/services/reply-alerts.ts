// reply-alerts.ts — THE reply-clock alert pass (migration 0253). The trigger on sia.wag_messages
// keeps the clocks; this file only reads the RUNNING ones and walks each up its ladder
// (constants/reply-clocks.ts):
//
//   reply  (member waiting for any reply):  genies + bishops at 2 min → queen at 5 min
//   update (since 2026-10-03: a PROMISE Elaya read from the chat, sia.promises, promise-reader.ts):
//          the person who promised at its due time → bishops 15 min later → queen 30 min later;
//          a member who chases an open promise tells the promiser and the bishops at once. A
//          promise waiting on the member never alerts. The word-based hold clock is still kept by
//          the trigger (Elaya's open loops read it) but no longer alerts.
//
// Each step is CLAIMED on the clock row before anything is sent (a conditional update on the same
// started_at, so a clock a staff reply already stopped is never alerted), recorded in elaya_alerts
// (its dedupe key is the second lock), then delivered: an in-app notification per alert and ONE
// Elaya WhatsApp message per person per pass (several groups at once are listed together). A step
// whose moment passed long ago (switch just turned on, job was down) is handled silently.
// No model is called. No `server-only`: it runs from Trigger.dev.

import { createAdminClient } from '@/lib/supabase/admin';
import { memberDb } from '@/lib/supabase/schemas';
import { createNotification } from '@/lib/services/notifications-service';
import { getQueendomSeats } from '@/lib/services/queendom-seats';
import { getReplyAlertSwitches } from '@/lib/services/llm-providers-service';
import { recordAlert, sendElayaAlertWhatsApp, type Alert, type AlertPerson } from '@/lib/services/elaya-alerts';
import { mapRows } from '@/lib/utils/rows';
import { formatIstClock } from '@/lib/utils/ist';
import { siaGroupHref } from '@/lib/constants/sia-roles';
import { listOpenPromises, type PromiseRow } from '@/lib/services/promise-reader';
import {
  REPLY_CLOCKS_READ_LIMIT, REPLY_LADDER, REPLY_STEP_MAX_LATE_SECONDS, UPDATE_LADDER, updateDueAt,
  type ReplyClock, type ReplyStep,
} from '@/lib/constants/reply-clocks';

const LOG = '[reply-alerts]';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0253 is not in the generated types until the next regen
const admin = () => createAdminClient() as any;

export type ClockRow = {
  group_jid: string;
  member_id: string | null;
  wait_started_at: string | null;
  wait_text: string | null;
  wait_steps: string[];
  hold_started_at: string | null;
  hold_text: string | null;
  hold_by: string | null;
  hold_promised_minutes: number | null;
  hold_steps: string[];
};

type Switches = { reply: boolean; update: boolean };
export type DueStep = { clock: ReplyClock; step: ReplyStep; dueAt: number; startedAt: string; stale: boolean };

export type ReplyAlertPassResult = {
  switches: Switches;
  running: number;
  fired: number;
  silenced: number;
  /** The next moment a step falls due among the clocks read (epoch ms), so the job can sleep until it. */
  nextDueAt: number | null;
  due?: { group: string; clock: ReplyClock; step: string }[];
};

/**
 * The steps of one clock row that are due at `now`, and the earliest one still ahead. Pure, so the
 * ladder can be checked without a database.
 */
export function stepsFor(row: ClockRow, now: number, switches: Switches): { due: DueStep[]; next: number | null } {
  const due: DueStep[] = [];
  let next: number | null = null;
  const walk = (clock: ReplyClock, startedAt: string, base: number, ladder: readonly ReplyStep[], done: string[]) => {
    for (const step of ladder) {
      if (done.includes(step.id)) continue;
      const at = base + step.afterSeconds * 1000;
      if (at <= now) due.push({ clock, step, dueAt: at, startedAt, stale: now - at > REPLY_STEP_MAX_LATE_SECONDS * 1000 });
      else next = next === null ? at : Math.min(next, at);
    }
  };
  if (switches.reply && row.wait_started_at) {
    walk('reply', row.wait_started_at, new Date(row.wait_started_at).getTime(), REPLY_LADDER, row.wait_steps ?? []);
  }
  if (switches.update && row.hold_started_at) {
    walk('update', row.hold_started_at, updateDueAt(row.hold_started_at, row.hold_promised_minutes), UPDATE_LADDER, row.hold_steps ?? []);
  }
  return { due, next };
}

/** "1 min", "1.5 min", "2 h". */
function waitLabel(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `${Math.max(1, Math.round(min * 2) / 2)} min`;
  return `${Math.round((min / 60) * 10) / 10} h`;
}

/** Mark steps handled on the clock row, only while the SAME clock is still running. */
async function claimSteps(row: ClockRow, clock: ReplyClock, startedAt: string, stepIds: string[]): Promise<boolean> {
  const col = clock === 'reply' ? 'wait' : 'hold';
  const current = (clock === 'reply' ? row.wait_steps : row.hold_steps) ?? [];
  const { data, error } = await admin().schema('sia').from('reply_clocks')
    .update({ [`${col}_steps`]: [...new Set([...current, ...stepIds])] })
    .eq('group_jid', row.group_jid).eq(`${col}_started_at`, startedAt)
    .select('group_jid');
  if (error) { console.error(`${LOG} claim failed:`, error.message); return false; }
  return Array.isArray(data) && data.length > 0;
}

/**
 * THE read of every running clock (a member waiting, or a holding reply owing an answer), for the
 * alert pass below and for Elaya's open-loops read (elaya-data.ts). Admin client; the CALLER scopes
 * the rows to the queendoms it may see. null = the read failed (never an empty list that reads as
 * "nobody is waiting").
 */
export async function listRunningReplyClocks(limit = REPLY_CLOCKS_READ_LIMIT): Promise<ClockRow[] | null> {
  const { data, error } = await admin().schema('sia').from('reply_clocks')
    .select('group_jid, member_id, wait_started_at, wait_text, wait_steps, hold_started_at, hold_text, hold_by, hold_promised_minutes, hold_steps')
    .or('wait_started_at.not.is.null,hold_started_at.not.is.null')
    .limit(limit);
  if (error) { console.error(`${LOG} clocks read failed:`, error.message); return null; }
  return mapRows<ClockRow, ClockRow>(data, (r) => r);
}

export async function runReplyAlertPass(opts: { apply: boolean }): Promise<ReplyAlertPassResult> {
  const switches = await getReplyAlertSwitches();
  const empty: ReplyAlertPassResult = { switches, running: 0, fired: 0, silenced: 0, nextDueAt: null };
  if (!switches.reply && !switches.update) return empty;

  const now = Date.now();
  const { data, error } = await admin().schema('sia').from('reply_clocks')
    .select('group_jid, member_id, wait_started_at, wait_text, wait_steps, hold_started_at, hold_text, hold_by, hold_promised_minutes, hold_steps')
    .or('wait_started_at.not.is.null,hold_started_at.not.is.null')
    .limit(REPLY_CLOCKS_READ_LIMIT);
  if (error) { console.error(`${LOG} clocks read failed:`, error.message); return empty; }
  const rows = mapRows<ClockRow, ClockRow>(data, (r) => r);

  let nextDueAt: number | null = null;
  const work: { row: ClockRow; steps: DueStep[] }[] = [];
  for (const row of rows) {
    const { due, next } = stepsFor(row, now, { reply: switches.reply, update: false });
    if (next !== null) nextDueAt = nextDueAt === null ? next : Math.min(nextDueAt, next);
    if (due.length) work.push({ row, steps: due });
  }
  // Promises (the update alert): their own ladder from each promise's due time.
  const promises = switches.update ? (await listOpenPromises()) ?? [] : [];
  const promiseWork: { p: PromiseRow; steps: PromiseDue[] }[] = [];
  for (const p of promises) {
    const { due, next } = promiseStepsFor(p, now);
    if (next !== null) nextDueAt = nextDueAt === null ? next : Math.min(nextDueAt, next);
    if (due.length) promiseWork.push({ p, steps: due });
  }
  const result: ReplyAlertPassResult = { ...empty, running: rows.length + promises.length, nextDueAt };
  if (opts.apply && promiseWork.length) await firePromiseAlerts(promiseWork, now, result);
  if (!opts.apply) {
    result.due = work.flatMap((w) => w.steps.map((s) => ({ group: w.row.group_jid, clock: s.clock, step: s.step.id })));
    return result;
  }
  if (work.length === 0) return result;

  // Claim first: one update per clock, every due step at once.
  const claimed: { row: ClockRow; step: DueStep }[] = [];
  for (const { row, steps } of work) {
    for (const clock of ['reply', 'update'] as const) {
      const mine = steps.filter((s) => s.clock === clock);
      if (!mine.length) continue;
      if (!(await claimSteps(row, clock, mine[0].startedAt, mine.map((s) => s.step.id)))) continue;
      for (const s of mine) {
        if (s.stale) result.silenced++;
        else claimed.push({ row, step: s });
      }
    }
  }
  if (claimed.length === 0) return result;

  const ctx = await loadContext(claimed.map((c) => c.row));

  // Build every alert and who hears it; then one WhatsApp per person for the whole pass.
  const byPerson = new Map<string, { person: AlertPerson; alerts: { id: string; title: string; body: string }[] }>();
  const delivered = new Map<string, Record<string, unknown>>();
  for (const { row, step } of claimed) {
    const alert = buildAlert(row, step, ctx, now);
    const people = recipientsFor(row, step, ctx);
    if (people.length === 0) { console.warn(`${LOG} nobody to tell for ${row.group_jid} ${step.clock}/${step.step.id}`); continue; }
    const id = await recordAlert(alert);
    if (!id) continue; // already fired for this wait
    delivered.set(id, { to: people.map((p) => p.full_name), in_app: 0, whatsapp: 0, pinged: 0 });
    for (const p of people) {
      const { error: nErr } = await createNotification({ recipient_id: p.id, type: 'system', action_url: alert.actionUrl, title: alert.title, body: alert.body.slice(0, 240) });
      if (!nErr) (delivered.get(id) as Record<string, number>).in_app++;
      const entry = byPerson.get(p.id) ?? { person: p, alerts: [] };
      entry.alerts.push({ id, title: alert.title, body: alert.body });
      byPerson.set(p.id, entry);
    }
    result.fired++;
  }

  for (const { person, alerts } of byPerson.values()) {
    const title = alerts.length === 1 ? alerts[0].title : `${alerts.length} members are waiting on the team`;
    const body = alerts.length === 1 ? alerts[0].body : alerts.map((a) => `- ${a.title}`).join('\n');
    const sent = await sendElayaAlertWhatsApp(person, title, body);
    if (sent === 'none') continue;
    for (const a of alerts) {
      const d = delivered.get(a.id) as Record<string, number> | undefined;
      if (d) d[sent]++;
    }
  }
  for (const [id, d] of delivered) await admin().from('elaya_alerts').update({ delivered: d }).eq('id', id);

  console.log(LOG, 'pass', JSON.stringify({ running: result.running, fired: result.fired, silenced: result.silenced }));
  return result;
}

// ── Context: names, groups, seats, people ────────────────────────────────────

type Ctx = {
  members: Map<string, { full_name: string; queendom_id: string | null }>;
  subjects: Map<string, string | null>;
  people: Map<string, AlertPerson>;
  founders: AlertPerson[];
  seats: Map<string, Awaited<ReturnType<typeof getQueendomSeats>>>;
};

async function loadContext(rows: ClockRow[]): Promise<Ctx> {
  const memberIds = [...new Set(rows.map((r) => r.member_id).filter((x): x is string => Boolean(x)))];
  const groupJids = [...new Set(rows.map((r) => r.group_jid))];
  const [ms, gs, fs] = await Promise.all([
    memberIds.length ? memberDb(createAdminClient()).from('members').select('id, full_name, queendom_id').in('id', memberIds) : Promise.resolve({ data: [] }),
    admin().schema('sia').from('wag_groups').select('group_jid, subject').in('group_jid', groupJids),
    admin().from('profiles').select('id, full_name, phone').eq('role', 'founder').eq('is_active', true),
  ]);
  const members = new Map<string, { full_name: string; queendom_id: string | null }>();
  mapRows<{ id: string; full_name: string; queendom_id: string | null }, void>(ms.data, (m) => { members.set(m.id, m); });
  const subjects = new Map<string, string | null>();
  mapRows<{ group_jid: string; subject: string | null }, void>(gs.data, (g) => { subjects.set(g.group_jid, g.subject); });
  const founders = mapRows<AlertPerson, AlertPerson>(fs.data, (p) => p);

  const seats = new Map<string, Awaited<ReturnType<typeof getQueendomSeats>>>();
  for (const q of new Set([...members.values()].map((m) => m.queendom_id).filter((x): x is string => Boolean(x)))) {
    seats.set(q, await getQueendomSeats(q));
  }
  const ids = new Set<string>();
  for (const s of seats.values()) { s.bishops.forEach((b) => ids.add(b)); s.genies.forEach((g) => ids.add(g)); if (s.queen) ids.add(s.queen); }
  rows.forEach((r) => { if (r.hold_by) ids.add(r.hold_by); });
  const people = new Map<string, AlertPerson>();
  if (ids.size) {
    const { data: ps } = await admin().from('profiles').select('id, full_name, phone').in('id', [...ids]).eq('is_active', true);
    mapRows<AlertPerson, void>(ps, (p) => { people.set(p.id, p); });
  }
  return { members, subjects, people, founders, seats };
}

function recipientsFor(row: ClockRow, s: DueStep, ctx: Ctx): AlertPerson[] {
  if (s.step.to === 'founders') return ctx.founders;
  if (s.step.to === 'promiser') return row.hold_by && ctx.people.has(row.hold_by) ? [ctx.people.get(row.hold_by) as AlertPerson] : [];
  const q = row.member_id ? ctx.members.get(row.member_id)?.queendom_id : null;
  const seats = q ? ctx.seats.get(q) : undefined;
  if (!seats) return [];
  const ids = s.step.to === 'bishops' ? seats.bishops : s.step.to === 'genies' ? seats.genies : seats.queen ? [seats.queen] : [];
  return ids.map((id) => ctx.people.get(id)).filter((p): p is AlertPerson => Boolean(p));
}

function buildAlert(row: ClockRow, s: DueStep, ctx: Ctx, now: number): Alert {
  const member = row.member_id ? ctx.members.get(row.member_id) : undefined;
  const subject = ctx.subjects.get(row.group_jid) ?? 'their group';
  const who = member?.full_name ?? subject ?? 'A member';
  const at = `${formatIstClock(new Date(s.startedAt))} IST`;
  const waited = waitLabel(now - new Date(s.startedAt).getTime());
  const quote = (t: string | null) => `"${(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)}"`;
  const base = {
    severity: s.step.severity,
    dedupeKey: `${s.clock}:${row.group_jid}:${s.startedAt}:${s.step.id}`,
    groupJid: row.group_jid,
    memberId: row.member_id,
    actionUrl: siaGroupHref(row.group_jid),
    audience: 'seats' as const,
  };
  if (s.clock === 'reply') {
    return { ...base, kind: 'reply_wait', title: `${who} is waiting for a reply, ${waited}`, body: `In ${subject}: ${quote(row.wait_text)} at ${at}. Nobody from the team has replied yet.` };
  }
  if (s.step.to === 'promiser') {
    return { ...base, kind: 'update_owed', title: `${who} is still waiting on your update`, body: `You wrote ${quote(row.hold_text)} at ${at} in ${subject}, and the answer has not gone out yet.` };
  }
  const promiser = row.hold_by ? ctx.people.get(row.hold_by)?.full_name : null;
  return { ...base, kind: 'update_owed', title: `${who} is still waiting on an update, ${waited}`, body: `${promiser ?? 'The team'} wrote ${quote(row.hold_text)} at ${at} in ${subject}. No answer since.` };
}

// ── Promises: the update alert (sia.promises, read by Elaya; 0255) ───────────

export type PromiseDue = { id: string; to: 'promiser' | 'bishops' | 'queen'; severity: 1 | 2 | 3; dueAt: number; stale: boolean; chased: boolean };

/**
 * The steps of one open promise that are due at `now`, and the earliest still ahead. Pure. The
 * ladder runs from the promise's due time (UPDATE_LADDER). A chase (the member asked for an update
 * after the last thing we told them) is its own step: the promiser and the bishops, at once.
 */
export function promiseStepsFor(p: PromiseRow, now: number): { due: PromiseDue[]; next: number | null } {
  const due: PromiseDue[] = [];
  let next: number | null = null;
  if (p.status !== 'open' || p.waiting_on === 'member') return { due, next };
  const done = p.steps ?? [];
  const lastTold = Math.max(new Date(p.promised_at).getTime(), p.last_update_at ? new Date(p.last_update_at).getTime() : 0);
  if (p.chased_at && new Date(p.chased_at).getTime() > lastTold && !done.includes('chased')) {
    const at = new Date(p.chased_at).getTime();
    for (const to of ['promiser', 'bishops'] as const) due.push({ id: 'chased', to, severity: 2, dueAt: at, stale: now - at > REPLY_STEP_MAX_LATE_SECONDS * 1000, chased: true });
  }
  if (p.due_at) {
    const base = new Date(p.due_at).getTime();
    for (const step of UPDATE_LADDER) {
      if (done.includes(step.id)) continue;
      const at = base + step.afterSeconds * 1000;
      const to = step.to === 'promiser' ? 'promiser' : step.to === 'queen' ? 'queen' : 'bishops';
      if (at <= now) due.push({ id: step.id, to, severity: step.severity, dueAt: at, stale: now - at > REPLY_STEP_MAX_LATE_SECONDS * 1000, chased: false });
      else next = next === null ? at : Math.min(next, at);
    }
  }
  return { due, next };
}

async function firePromiseAlerts(work: { p: PromiseRow; steps: PromiseDue[] }[], now: number, result: ReplyAlertPassResult): Promise<void> {
  // Claim: one update per promise, only while it is still open.
  const claimed: { p: PromiseRow; step: PromiseDue }[] = [];
  for (const { p, steps } of work) {
    const ids = [...new Set(steps.map((s) => s.id))];
    const { data, error } = await admin().schema('sia').from('promises')
      .update({ steps: [...new Set([...(p.steps ?? []), ...ids])] }).eq('id', p.id).eq('status', 'open').select('id');
    if (error || !Array.isArray(data) || data.length === 0) continue;
    for (const s of steps) { if (s.stale) result.silenced++; else claimed.push({ p, step: s }); }
  }
  if (claimed.length === 0) return;

  const ctx = await loadContext(claimed.map(({ p }) => ({
    group_jid: p.group_jid, member_id: p.member_id, wait_started_at: null, wait_text: null, wait_steps: [],
    hold_started_at: null, hold_text: null, hold_by: p.promiser_profile_id, hold_promised_minutes: null, hold_steps: [],
  })));
  const byPerson = new Map<string, { person: AlertPerson; alerts: { id: string; title: string; body: string }[] }>();
  for (const { p, step } of claimed) {
    const q = p.queendom_id ?? (p.member_id ? ctx.members.get(p.member_id)?.queendom_id : null) ?? null;
    const seats = q ? ctx.seats.get(q) : undefined;
    const promiser = p.promiser_profile_id ? ctx.people.get(p.promiser_profile_id) : undefined;
    const ids = step.to === 'promiser' ? (promiser ? [promiser.id] : seats?.genies ?? []) : step.to === 'bishops' ? seats?.bishops ?? [] : seats?.queen ? [seats.queen] : [];
    const people = ids.map((id) => ctx.people.get(id)).filter((x): x is AlertPerson => Boolean(x));
    if (people.length === 0) continue;
    const member = p.member_id ? ctx.members.get(p.member_id) : undefined;
    const subject = ctx.subjects.get(p.group_jid) ?? 'their group';
    const who = member?.full_name ?? subject;
    const said = `"${(p.promised_text ?? '').replace(/\s+/g, ' ').trim().slice(0, 140)}"`;
    const late = p.due_at ? waitLabel(now - new Date(p.due_at).getTime()) : null;
    const title = step.chased
      ? `${who} is chasing: ${p.what}`
      : step.to === 'promiser' ? `${who} is still waiting: ${p.what}` : `${who} is still waiting, ${late} past due: ${p.what}`;
    const body = step.chased
      ? `The member asked for an update in ${subject}. ${promiser?.full_name ?? 'The team'} had said ${said}${p.due_at ? `, due ${formatIstClock(new Date(p.due_at))} IST` : ''}.`
      : `${promiser?.full_name ?? 'The team'} said ${said} at ${formatIstClock(new Date(p.promised_at))} IST in ${subject}; it was due ${p.due_at ? `${formatIstClock(new Date(p.due_at))} IST` : 'by now'}${p.waiting_on === 'vendor' ? ' (waiting on a vendor: an update to the member helps)' : ''}.`;
    const alert: Alert = {
      kind: 'update_owed', severity: step.severity, dedupeKey: `promise:${p.id}:${step.id}:${step.to}:${p.due_at ?? ''}`,
      groupJid: p.group_jid, memberId: p.member_id, actionUrl: siaGroupHref(p.group_jid), audience: 'seats', title, body,
    };
    const id = await recordAlert(alert);
    if (!id) continue;
    for (const person of people) {
      await createNotification({ recipient_id: person.id, type: 'system', action_url: alert.actionUrl, title: alert.title, body: alert.body.slice(0, 240) });
      const entry = byPerson.get(person.id) ?? { person, alerts: [] };
      entry.alerts.push({ id, title, body });
      byPerson.set(person.id, entry);
    }
    result.fired++;
  }
  for (const { person, alerts } of byPerson.values()) {
    const title = alerts.length === 1 ? alerts[0].title : `${alerts.length} promises to members are overdue`;
    const body = alerts.length === 1 ? alerts[0].body : alerts.map((a) => `- ${a.title}`).join('\n');
    await sendElayaAlertWhatsApp(person, title, body);
  }
}
