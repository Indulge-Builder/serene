// elaya-teammate.ts — THE operating teammate: Elaya's proactive half (migration 0257, 2026-10-03;
// docs/architecture/elaya-behaviour-contract.md "The operating teammate: event-to-outcome").
//
//   Persisted signal (a ticket's service time near, a ticket silent after options, a request on no
//   ticket, the occasions ahead) → a typed INTERVENTION with its owner, its words and its evidence
//   → the existing delivery routes (one Elaya WhatsApp line, the in-app notification) → an
//   acknowledgement (a short reply on WhatsApp, or the page) → the ladder when nobody answers
//   (the owner again, then the bishop, then the queen) → resolved on EVIDENCE (the checklist
//   ticked, the member replied, the card closed) or by a "done" reply; never nagging a solved thing.
//
// Laws of this file:
//   • No model call. Every rule is typed data in constants/elaya-teammate.ts and every line is the
//     founder's Tone vocabulary. A nudge is cheap, deterministic and never invented.
//   • One logical issue = one row (dedupe_key UNIQUE). Delivery receipts, acknowledgement and
//     resolution are three different states; a read receipt or silence is never an acknowledgement.
//   • SHADOW first: in shadow mode rows are written with a 'shadow' delivery entry and nothing is
//     sent. Live delivery needs mode = live AND the queendom named in elaya_teammate_queendoms.
//   • Ownership is resolved from the ticket (assignee, bishop) and the queendom's seats
//     (queendom-seats.ts), never guessed; a row with nobody to tell stays proposed and says so.
//   • Runs from Trigger.dev (src/trigger/elaya-teammate.ts): no `server-only` import anywhere here.

import { createAdminClient } from '@/lib/supabase/admin';
import { memberDb } from '@/lib/supabase/schemas';
import { mapRows } from '@/lib/utils/rows';
import { formatDate } from '@/lib/utils/dates';
import { IST_OFFSET_MS } from '@/lib/utils/ist';
import { createNotification } from '@/lib/services/notifications-service';
import { sendElayaAlertWhatsApp, type AlertPerson } from '@/lib/services/elaya-alerts';
import { getQueendomSeats, type QueendomSeats } from '@/lib/services/queendom-seats';
import { getTeammateSettings } from '@/lib/services/llm-providers-service';
import { listOpenIntakeProposalsForScope, openIntakeProposalIds, type OpenIntakeCard } from '@/lib/services/intake-cards';
import { findMemberOccasionsInScope, queendomNames } from '@/lib/services/member-occasions';
import { ELAYA_BEHAVIOUR_VERSION } from '@/lib/constants/elaya-behaviour';
import { TICKET_ACTIVE_STATUSES, TICKETS_PATH, type TicketChecklistItem } from '@/lib/constants/tickets';
import { CLIENTS_PATH } from '@/lib/constants/sia-roles';
import {
  ESCALATION_LADDER, INTERVENTION_REPLY_WINDOW_HOURS, INTERVENTION_SNOOZE_HOURS, LAST_MILE_EXPIRE_AFTER_HOURS, LAST_MILE_LOOKAHEAD_HOURS,
  LAST_MILE_RULES, OCCASIONS_DIGEST_DAYS, OCCASIONS_DIGEST_HOUR_IST, OCCASIONS_DIGEST_MAX_LINES, OCCASIONS_TITLE, REPLY_LINES,
  SILENCE_AFTER_OPTIONS_HOURS, SILENCE_BODY, SILENCE_TITLE, TEAMMATE_SETTING_KEYS, TEAMMATE_SWEEP_LIMIT, UNTRACKED_BODY, UNTRACKED_REQUEST_HOURS,
  UNTRACKED_TITLE, classifyInterventionReply, type InterventionKind, type InterventionState, type LastMileRule, type TeammateMode,
} from '@/lib/constants/elaya-teammate';

const LOG = '[elaya-teammate]';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0257 is not in the generated types until the next regen
const admin = () => createAdminClient() as any;
const HOUR = 3_600_000;

// ── Rows and candidates ─────────────────────────────────────────────────────

export type InterventionRow = {
  id: string; created_at: string; updated_at: string; kind: InterventionKind; subject_kind: string; subject_id: string; checkpoint: string; dedupe_key: string;
  ticket_id: string | null; member_id: string | null; group_jid: string | null; queendom_id: string | null; priority: number; title: string; body: string;
  observation: string; next_step: string | null; evidence: Record<string, unknown>; state: InterventionState; delivery_mode: 'immediate' | 'digest';
  recipient_id: string | null; recipient_role: string | null; escalation_step: number; next_check_at: string | null;
  delivery: { at: string; step: number; recipient_id: string | null; channel: string }[]; acknowledged_at: string | null; acknowledged_by: string | null;
  snoozed_until: string | null; resolved_at: string | null; resolution: string | null; policy_version: string | null;
};

export type TicketLite = {
  id: string; ticket_no: string; member_id: string; queendom_id: string | null; group_jid: string | null; category: string; sub_category: string | null;
  title: string; checklist: TicketChecklistItem[]; status: string; requested_for: string | null; updated_at: string; last_member_update_at: string | null;
  assignee_id: string | null; bishop_id: string | null;
};

/** What the sweep decided a signal deserves, before it touches the database. */
export type Candidate = {
  kind: InterventionKind; subject_kind: 'ticket' | 'member' | 'group' | 'intake_proposal' | 'queendom'; subject_id: string; checkpoint: string; dedupe_key: string;
  ticket_id?: string | null; member_id?: string | null; group_jid?: string | null; queendom_id: string | null; priority: 1 | 2 | 3;
  title: string; body: string; observation: string; next_step: string | null; evidence: Record<string, unknown>; delivery_mode: 'immediate' | 'digest';
  /** Who owns the next move, in ladder order: the owner, then the bishop(s), then the queen. */
  owner_id: string | null; bishop_ids: string[]; queen_id: string | null; action_url: string;
};

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const whenIst = (iso: string) => formatDate(iso, "EEE d MMM, h:mm a");
const hoursBetween = (a: number, b: number) => Math.round(Math.abs(a - b) / HOUR);

/** The most specific rule for a ticket's category and sub-category, or null. Pure. */
export function pickLastMileRule(category: string, subCategory: string | null, rules: readonly LastMileRule[] = LAST_MILE_RULES): LastMileRule | null {
  const specific = rules.find((r) => r.category === category && subCategory !== null && r.subCategories.includes(subCategory));
  return specific ?? rules.find((r) => r.category === category && r.subCategories.length === 0) ?? null;
}

/** The checklist labels a rule asks for that are still unticked. Pure. */
export function openLabels(checklist: TicketChecklistItem[], rule: LastMileRule): string[] {
  return rule.labels.filter((label) => !checklist.some((i) => i.label === label && i.done_at));
}

/** Last-mile candidates: an active ticket whose service time is inside the rule's window and whose proof is missing. Pure. */
export function lastMileCandidates(tickets: TicketLite[], memberName: (id: string) => string, seats: (q: string | null) => QueendomSeats, now: Date, rules: readonly LastMileRule[] = LAST_MILE_RULES): Candidate[] {
  const t = now.getTime();
  const out: Candidate[] = [];
  for (const tk of tickets) {
    if (!tk.requested_for || !(TICKET_ACTIVE_STATUSES as readonly string[]).includes(tk.status)) continue;
    const rule = pickLastMileRule(tk.category, tk.sub_category, rules);
    if (!rule) continue;
    const at = Date.parse(tk.requested_for);
    if (Number.isNaN(at) || at < t - LAST_MILE_EXPIRE_AFTER_HOURS * HOUR || at > t + rule.hoursBefore * HOUR) continue;
    const open = openLabels(tk.checklist ?? [], rule);
    if (rule.labels.length > 0 && open.length === 0) continue;
    const s = seats(tk.queendom_id);
    const member = memberName(tk.member_id);
    out.push({
      kind: 'last_mile', subject_kind: 'ticket', subject_id: tk.id, checkpoint: rule.id, dedupe_key: `last_mile:${tk.id}:${rule.id}`,
      ticket_id: tk.id, member_id: tk.member_id, group_jid: tk.group_jid, queendom_id: tk.queendom_id, priority: 1,
      title: rule.title, body: fill(rule.body, { member, ticket: tk.ticket_no, when: whenIst(tk.requested_for) }),
      observation: rule.labels.length ? `${tk.ticket_no} is due ${whenIst(tk.requested_for)}; still unticked: ${open.join(', ')}.` : `${tk.ticket_no} is due ${whenIst(tk.requested_for)}; the record cannot prove the last mile, only a person can.`,
      next_step: rule.labels.length ? `Check it and tick: ${open.join(', ')}.` : 'Check reality and reply done.',
      evidence: { ticket_no: tk.ticket_no, requested_for: tk.requested_for, open_labels: open, rule: rule.id, status: tk.status },
      delivery_mode: 'immediate', owner_id: tk.assignee_id ?? tk.bishop_id ?? s.bishops[0] ?? s.queen, bishop_ids: tk.bishop_id ? [tk.bishop_id] : s.bishops, queen_id: s.queen,
      action_url: `${TICKETS_PATH}/${tk.id}`,
    });
  }
  return out;
}

/** Silence after options: a ticket waiting on the member with no word from them for a while. Pure. */
export function silenceCandidates(tickets: TicketLite[], memberName: (id: string) => string, seats: (q: string | null) => QueendomSeats, now: Date): Candidate[] {
  const t = now.getTime();
  const out: Candidate[] = [];
  for (const tk of tickets) {
    if (tk.status !== 'awaiting_member') continue;
    const since = Math.max(Date.parse(tk.updated_at), tk.last_member_update_at ? Date.parse(tk.last_member_update_at) : 0);
    if (t - since < SILENCE_AFTER_OPTIONS_HOURS * HOUR) continue;
    const s = seats(tk.queendom_id);
    const days = Math.floor((t - since) / (24 * HOUR));
    out.push({
      kind: 'watch', subject_kind: 'ticket', subject_id: tk.id, checkpoint: 'silence_after_options', dedupe_key: `silence:${tk.id}:${new Date(since).toISOString().slice(0, 13)}`,
      ticket_id: tk.id, member_id: tk.member_id, group_jid: tk.group_jid, queendom_id: tk.queendom_id, priority: 2,
      title: SILENCE_TITLE, body: fill(SILENCE_BODY, { member: memberName(tk.member_id), ticket: tk.ticket_no, days: String(days) }),
      observation: `${tk.ticket_no} has waited on the member since ${whenIst(new Date(since).toISOString())}.`, next_step: 'Call and check what did not land.',
      evidence: { ticket_no: tk.ticket_no, status: tk.status, silent_since: new Date(since).toISOString() },
      delivery_mode: 'immediate', owner_id: tk.assignee_id ?? tk.bishop_id ?? s.bishops[0] ?? s.queen, bishop_ids: tk.bishop_id ? [tk.bishop_id] : s.bishops, queen_id: s.queen,
      action_url: `${TICKETS_PATH}/${tk.id}`,
    });
  }
  return out;
}

/** A request Serene found that is on no ticket after a while: the bishops' move. Pure. */
export function untrackedCandidates(cards: OpenIntakeCard[], seats: (q: string | null) => QueendomSeats, now: Date): Candidate[] {
  const t = now.getTime();
  const out: Candidate[] = [];
  for (const c of cards) {
    const age = hoursBetween(t, Date.parse(c.first_message_at));
    if (age < UNTRACKED_REQUEST_HOURS) continue;
    const s = seats(c.queendom_id);
    out.push({
      kind: 'action_needed', subject_kind: 'intake_proposal', subject_id: c.id, checkpoint: 'untracked_request', dedupe_key: `untracked:${c.id}`,
      member_id: c.member_id, group_jid: c.group_jid, queendom_id: c.queendom_id, priority: 2,
      title: UNTRACKED_TITLE, body: fill(UNTRACKED_BODY, { member: c.member_name, hours: String(age), summary: c.summary.slice(0, 160) }),
      observation: `An open request card since ${whenIst(c.first_message_at)} with no ticket.`, next_step: 'Create the ticket or dismiss the card.',
      evidence: { proposal_id: c.id, first_message_at: c.first_message_at, confidence: c.confidence },
      delivery_mode: 'immediate', owner_id: s.bishops[0] ?? s.queen, bishop_ids: s.bishops, queen_id: s.queen,
      action_url: `${TICKETS_PATH}/new?proposal=${c.id}`,
    });
  }
  return out;
}

/** One digest per queendom per day: the occasions of the week, for the queen and her bishops. Pure. */
export function occasionsDigestCandidate(queendomId: string, queendomName: string, seats: QueendomSeats, dateIst: string, rows: { member: string; kind: string; date: string; days_away: number; detail: string | null }[]): Candidate | null {
  if (rows.length === 0) return null;
  const lines = rows.slice(0, OCCASIONS_DIGEST_MAX_LINES).map((r) => `- ${r.member}: ${r.kind.replace('_', ' ')} ${r.days_away === 0 ? 'today' : r.days_away === 1 ? 'tomorrow' : `in ${r.days_away} days`} (${r.date})${r.detail ? `, ${r.detail}` : ''}`);
  const more = rows.length > OCCASIONS_DIGEST_MAX_LINES ? `\n…and ${rows.length - OCCASIONS_DIGEST_MAX_LINES} more on the members page.` : '';
  return {
    kind: 'opportunity', subject_kind: 'queendom', subject_id: queendomId, checkpoint: 'occasions_week', dedupe_key: `occasions:${queendomId}:${dateIst}`,
    queendom_id: queendomId, priority: 3, title: OCCASIONS_TITLE,
    body: `${queendomName}, the next ${OCCASIONS_DIGEST_DAYS} days:\n${lines.join('\n')}${more}\n💡 Quick tip: a tiny touch planned today beats a scramble on the day. Reply done when it is in hand.`,
    observation: `${rows.length} occasion(s) on record for ${queendomName} in the next ${OCCASIONS_DIGEST_DAYS} days.`, next_step: 'Plan the touch for each one.',
    evidence: { count: rows.length, members: rows.slice(0, OCCASIONS_DIGEST_MAX_LINES).map((r) => r.member) },
    delivery_mode: 'digest', owner_id: seats.queen ?? seats.bishops[0] ?? null, bishop_ids: seats.bishops, queen_id: seats.queen, action_url: CLIENTS_PATH,
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

async function readTickets(now: Date): Promise<TicketLite[]> {
  const lookahead = new Date(now.getTime() + LAST_MILE_LOOKAHEAD_HOURS * HOUR).toISOString();
  const cols = 'id, ticket_no, member_id, queendom_id, group_jid, category, sub_category, title, checklist, status, requested_for, updated_at, last_member_update_at, assignee_id, bishop_id';
  const db = admin().schema('sia');
  const [near, silent] = await Promise.all([
    db.from('tickets').select(cols).in('status', [...TICKET_ACTIVE_STATUSES]).not('requested_for', 'is', null).lte('requested_for', lookahead).gte('requested_for', new Date(now.getTime() - LAST_MILE_EXPIRE_AFTER_HOURS * HOUR).toISOString()).limit(TEAMMATE_SWEEP_LIMIT),
    db.from('tickets').select(cols).eq('status', 'awaiting_member').lte('updated_at', new Date(now.getTime() - SILENCE_AFTER_OPTIONS_HOURS * HOUR).toISOString()).limit(TEAMMATE_SWEEP_LIMIT),
  ]);
  if (near.error) console.error(`${LOG} near tickets read failed:`, near.error.message);
  if (silent.error) console.error(`${LOG} silent tickets read failed:`, silent.error.message);
  const seen = new Map<string, TicketLite>();
  for (const r of [...mapRows<TicketLite, TicketLite>(near.data, (x) => x), ...mapRows<TicketLite, TicketLite>(silent.data, (x) => x)]) seen.set(r.id, { ...r, checklist: Array.isArray(r.checklist) ? r.checklist : [] });
  return [...seen.values()];
}

async function readTicketsByIds(ids: string[]): Promise<Map<string, TicketLite>> {
  const out = new Map<string, TicketLite>();
  if (ids.length === 0) return out;
  const { data } = await admin().schema('sia').from('tickets').select('id, ticket_no, member_id, queendom_id, group_jid, category, sub_category, title, checklist, status, requested_for, updated_at, last_member_update_at, assignee_id, bishop_id').in('id', ids);
  mapRows<TicketLite, void>(data, (r) => { out.set(r.id, { ...r, checklist: Array.isArray(r.checklist) ? r.checklist : [] }); });
  return out;
}

async function readOpenInterventions(): Promise<InterventionRow[]> {
  const { data, error } = await admin().from('elaya_interventions').select('*').in('state', ['proposed', 'delivered', 'acknowledged', 'snoozed']).order('created_at', { ascending: true }).limit(1000);
  if (error) { console.error(`${LOG} interventions read failed:`, error.message); return []; }
  return mapRows<InterventionRow, InterventionRow>(data, (r) => r);
}

async function memberNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await memberDb(admin()).from('members').select('id, full_name').in('id', ids.slice(i, i + 150));
    mapRows<{ id: string; full_name: string }, void>(data, (m) => { out.set(m.id, m.full_name); });
  }
  return out;
}

async function people(ids: string[]): Promise<Map<string, AlertPerson>> {
  const out = new Map<string, AlertPerson>();
  if (ids.length === 0) return out;
  const { data } = await admin().from('profiles').select('id, full_name, phone').in('id', ids).eq('is_active', true);
  mapRows<AlertPerson, void>(data, (p) => { out.set(p.id, p); });
  return out;
}

async function appendEvent(interventionId: string, event: string, detail: Record<string, unknown> = {}, actorId: string | null = null): Promise<void> {
  const { error } = await admin().from('elaya_intervention_events').insert({ intervention_id: interventionId, event, actor_id: actorId, detail });
  if (error) console.error(`${LOG} event insert failed:`, error.message);
}

// ── The sweep ───────────────────────────────────────────────────────────────

export type TeammateSweepResult = {
  mode: TeammateMode; live_queendoms: number; candidates: Record<string, number>; created: number; delivered: number; nudged: number; escalated: number;
  resolved: number; superseded: number; shadowed: number; skipped_no_owner: number; digests: number; warnings: string[];
};

export async function runTeammateSweep(opts: { apply: boolean; deadlineMs: number; now?: Date }): Promise<TeammateSweepResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const settings = await getTeammateSettings();
  const result: TeammateSweepResult = { mode: settings.mode, live_queendoms: settings.queendomIds.length, candidates: {}, created: 0, delivered: 0, nudged: 0, escalated: 0, resolved: 0, superseded: 0, shadowed: 0, skipped_no_owner: 0, digests: 0, warnings: [] };
  if (settings.mode === 'off') return result;
  const live = (queendomId: string | null) => settings.mode === 'live' && Boolean(queendomId) && settings.queendomIds.includes(queendomId as string);
  const timeLeft = () => Date.now() - started < opts.deadlineMs;

  // 1. The signals.
  const [tickets, cards, open, qNames] = await Promise.all([
    readTickets(now),
    listOpenIntakeProposalsForScope(null, { olderThan: new Date(now.getTime() - UNTRACKED_REQUEST_HOURS * HOUR).toISOString(), limit: 200 }),
    readOpenInterventions(),
    queendomNames(),
  ]);
  if (cards === null) result.warnings.push('the request cards could not be read');
  const seatsByQueendom = new Map<string, QueendomSeats>();
  const queendomIds = new Set<string>([...tickets.map((t) => t.queendom_id), ...(cards?.proposals ?? []).map((c) => c.queendom_id), ...open.map((o) => o.queendom_id)].filter((x): x is string => Boolean(x)));
  for (const q of queendomIds) seatsByQueendom.set(q, await getQueendomSeats(q));
  const seats = (q: string | null) => (q && seatsByQueendom.get(q)) || { queen: null, bishops: [], joker: null, genies: [] };
  const names = await memberNames([...new Set([...tickets.map((t) => t.member_id), ...open.map((o) => o.member_id).filter((x): x is string => Boolean(x))])]);
  const memberName = (id: string) => names.get(id) ?? 'The member';

  // 2. The candidates, by rule.
  const candidates: Candidate[] = [
    ...lastMileCandidates(tickets, memberName, seats, now),
    ...silenceCandidates(tickets, memberName, seats, now),
    ...untrackedCandidates(cards?.proposals ?? [], seats, now),
  ];
  // The weekly occasions digest, once a day per queendom after the digest hour (IST).
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dateIst = ist.toISOString().slice(0, 10);
  if (ist.getUTCHours() >= OCCASIONS_DIGEST_HOUR_IST) {
    for (const [qid, qname] of qNames) {
      if (!settings.queendomIds.includes(qid) && settings.mode === 'live') continue; // live: only the named queendoms; shadow: every queendom is recorded
      if (open.some((o) => o.dedupe_key === `occasions:${qid}:${dateIst}`)) continue;
      const already = await admin().from('elaya_interventions').select('id').eq('dedupe_key', `occasions:${qid}:${dateIst}`).maybeSingle();
      if (already.data) continue;
      const r = await findMemberOccasionsInScope({ scopeAll: true, head: false, queendomId: qid }, { to: new Date(now.getTime() + OCCASIONS_DIGEST_DAYS * 24 * HOUR).toISOString().slice(0, 10), limit: 50 }, qNames);
      if (!('ok' in r) || !r.ok) continue;
      const c = occasionsDigestCandidate(qid, qname, seats(qid), dateIst, r.occasions);
      if (c) candidates.push(c);
    }
  }
  for (const c of candidates) result.candidates[c.checkpoint] = (result.candidates[c.checkpoint] ?? 0) + 1;

  // 3. New rows for new keys (the UNIQUE key makes a race harmless).
  const byKey = new Map(open.map((o) => [o.dedupe_key, o]));
  const ownersByKey = new Map<string, Candidate>();
  for (const c of candidates) {
    ownersByKey.set(c.dedupe_key, c);
    if (byKey.has(c.dedupe_key)) continue;
    if (!opts.apply) { result.created += 1; continue; }
    const { data, error } = await admin().from('elaya_interventions').insert({
      kind: c.kind, subject_kind: c.subject_kind, subject_id: c.subject_id, checkpoint: c.checkpoint, dedupe_key: c.dedupe_key, ticket_id: c.ticket_id ?? null,
      member_id: c.member_id ?? null, group_jid: c.group_jid ?? null, queendom_id: c.queendom_id, priority: c.priority, title: c.title, body: c.body,
      observation: c.observation, next_step: c.next_step, evidence: { ...c.evidence, action_url: c.action_url, owner_id: c.owner_id, bishop_ids: c.bishop_ids, queen_id: c.queen_id },
      state: 'proposed', delivery_mode: c.delivery_mode, recipient_id: c.owner_id, recipient_role: c.owner_id ? (c.owner_id === c.queen_id ? 'queen' : c.bishop_ids.includes(c.owner_id) ? 'bishop' : 'genie') : null,
      next_check_at: now.toISOString(), policy_version: ELAYA_BEHAVIOUR_VERSION,
    }).select('*').single();
    if (error) { if (error.code !== '23505') console.error(`${LOG} insert failed:`, error.message); continue; }
    const row = data as InterventionRow;
    result.created += 1;
    await appendEvent(row.id, 'proposed', { checkpoint: c.checkpoint, owner_id: c.owner_id });
    open.push(row); byKey.set(row.dedupe_key, row);
  }

  // 4. Every open row: resolve on evidence, deliver, nudge, escalate.
  const ticketIds = [...new Set(open.map((o) => o.ticket_id).filter((x): x is string => Boolean(x)))];
  const ticketsNow = await readTicketsByIds(ticketIds);
  const cardIds = open.filter((o) => o.subject_kind === 'intake_proposal').map((o) => o.subject_id);
  const openCards = await openIntakeProposalIds(cardIds);
  const personIds = new Set<string>();
  for (const o of open) { if (o.recipient_id) personIds.add(o.recipient_id); for (const id of (o.evidence.bishop_ids as string[] | undefined) ?? []) personIds.add(id); const q = o.evidence.queen_id as string | undefined; if (q) personIds.add(q); }
  const persons = await people([...personIds]);

  for (const row of open) {
    if (!timeLeft()) { result.warnings.push('out of time before every row was looked at'); break; }
    const t = now.getTime();
    // a. Resolve on evidence.
    const verdict = resolveVerdict(row, ticketsNow, openCards, now);
    if (verdict) {
      if (opts.apply) {
        await admin().from('elaya_interventions').update({ state: verdict.state, resolved_at: now.toISOString(), resolution: verdict.resolution, next_check_at: null }).eq('id', row.id);
        await appendEvent(row.id, verdict.state, { resolution: verdict.resolution });
      }
      if (verdict.state === 'resolved') result.resolved += 1; else result.superseded += 1;
      continue;
    }
    if (row.state === 'acknowledged') continue;                       // seen: no more nudges, only evidence closes it
    if (row.state === 'snoozed' && row.snoozed_until && Date.parse(row.snoozed_until) > t) continue;
    if (row.next_check_at && Date.parse(row.next_check_at) > t && row.state !== 'proposed') continue;

    // b. Who, at this step.
    const step = row.state === 'proposed' ? 0 : Math.min(row.escalation_step + (row.state === 'snoozed' ? 0 : 1), ESCALATION_LADDER.length - 1);
    if (row.state === 'delivered' && row.escalation_step >= ESCALATION_LADDER.length - 1) continue;   // the ladder is spent; evidence or a person closes it
    if (row.delivery_mode === 'digest' && row.state !== 'proposed') continue;                            // a digest goes once
    const ladder = ESCALATION_LADDER[step];
    const bishops = (row.evidence.bishop_ids as string[] | undefined) ?? [];
    const queen = (row.evidence.queen_id as string | null | undefined) ?? null;
    const recipientId = ladder.to === 'owner' ? row.recipient_id : ladder.to === 'bishop' ? (bishops[0] ?? queen) : queen;
    const person = recipientId ? persons.get(recipientId) : undefined;
    if (!person) { result.skipped_no_owner += 1; continue; }
    const role = recipientId === queen ? 'queen' : bishops.includes(recipientId as string) ? 'bishop' : 'genie';

    // c. Shadow: record what would have gone, once.
    if (!live(row.queendom_id)) {
      if (row.delivery.some((d) => d.channel === 'shadow')) continue;
      if (opts.apply) {
        await admin().from('elaya_interventions').update({ delivery: [...row.delivery, { at: now.toISOString(), step, recipient_id: person.id, channel: 'shadow' }], recipient_id: person.id, recipient_role: role }).eq('id', row.id);
        await appendEvent(row.id, 'shadow', { would_send_to: person.full_name, step });
      }
      result.shadowed += 1;
      continue;
    }

    // d. Live: send through the existing routes, then the receipt.
    if (!opts.apply) { if (step === 0) result.delivered += 1; else if (ladder.to === 'owner') result.nudged += 1; else result.escalated += 1; continue; }
    const body = `${ladder.prefix}${row.body}`;
    const actionUrl = (row.evidence.action_url as string | undefined) ?? TICKETS_PATH;
    const channel = await sendElayaAlertWhatsApp(person, row.title, body);
    const { error: nErr } = await createNotification({ recipient_id: person.id, type: 'system', action_url: actionUrl, title: row.title, body: body.slice(0, 240) });
    const next = ladder.afterHours > 0 ? new Date(t + ladder.afterHours * HOUR).toISOString() : null;
    const delivery = [...row.delivery, { at: now.toISOString(), step, recipient_id: person.id, channel: channel === 'none' && nErr ? 'none' : channel === 'none' ? 'in_app' : channel }];
    await admin().from('elaya_interventions').update({ state: 'delivered', recipient_id: person.id, recipient_role: role, escalation_step: step, next_check_at: row.delivery_mode === 'digest' ? null : next, delivery, snoozed_until: null }).eq('id', row.id);
    const event = step === 0 ? 'delivered' : ladder.to === 'owner' ? 'nudged' : 'escalated';
    await appendEvent(row.id, event, { to: person.full_name, role, channel, in_app: !nErr, step });
    if (event === 'delivered') result.delivered += 1; else if (event === 'nudged') result.nudged += 1; else result.escalated += 1;
    if (row.delivery_mode === 'digest') result.digests += 1;
  }
  return result;
}

/** Has the world moved on? resolved = the proof landed; superseded = the moment passed or the subject went away. Pure over the rows given. */
export function resolveVerdict(row: InterventionRow, tickets: Map<string, TicketLite>, openCards: Set<string> | null, now: Date): { state: 'resolved' | 'superseded'; resolution: string } | null {
  const t = now.getTime();
  if (row.subject_kind === 'ticket') {
    const tk = row.ticket_id ? tickets.get(row.ticket_id) : undefined;
    if (!tk) return { state: 'superseded', resolution: 'ticket_gone' };
    if (row.kind === 'last_mile') {
      if (!(TICKET_ACTIVE_STATUSES as readonly string[]).includes(tk.status)) return { state: 'resolved', resolution: 'evidence:ticket_closed' };
      const rule = LAST_MILE_RULES.find((r) => r.id === row.checkpoint);
      if (rule && rule.labels.length > 0 && openLabels(tk.checklist, rule).length === 0) return { state: 'resolved', resolution: 'evidence:checklist' };
      if (tk.requested_for && Date.parse(tk.requested_for) + LAST_MILE_EXPIRE_AFTER_HOURS * HOUR < t) return { state: 'superseded', resolution: 'time_passed' };
      return null;
    }
    if (row.kind === 'watch') {
      if (tk.status !== 'awaiting_member') return { state: 'resolved', resolution: 'evidence:status_moved' };
      if (tk.last_member_update_at && Date.parse(tk.last_member_update_at) > Date.parse(row.created_at)) return { state: 'resolved', resolution: 'evidence:member_replied' };
      return null;
    }
  }
  if (row.subject_kind === 'intake_proposal') {
    if (openCards && !openCards.has(row.subject_id)) return { state: 'resolved', resolution: 'evidence:card_closed' };
    return null;
  }
  if (row.subject_kind === 'queendom' && row.state === 'delivered' && Date.parse(row.created_at) < t - 7 * 24 * HOUR) return { state: 'superseded', resolution: 'time_passed' };
  return null;
}

// ── Replies and the page ────────────────────────────────────────────────────

/**
 * THE acknowledgement by reply (the staff WhatsApp gate calls it BEFORE the brain): a short "ok" /
 * "done" / "later" from a person with a nudge in flight marks it seen / resolved / snoozed and
 * answers in one line; the brain never runs for it. null = not a reply to a nudge (a real message).
 */
export async function acknowledgeInterventionByReply(userId: string, text: string, now: Date = new Date()): Promise<string | null> {
  const kind = classifyInterventionReply(text);
  if (!kind) return null;
  const since = new Date(now.getTime() - INTERVENTION_REPLY_WINDOW_HOURS * HOUR).toISOString();
  const { data, error } = await admin().from('elaya_interventions').select('*').eq('recipient_id', userId).in('state', ['delivered', 'snoozed']).gte('updated_at', since).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const row = data as InterventionRow;
  const patch: Record<string, unknown> =
    kind === 'done' ? { state: 'resolved', resolved_at: now.toISOString(), resolution: 'done_by_reply', next_check_at: null }
    : kind === 'snooze' ? { state: 'snoozed', snoozed_until: new Date(now.getTime() + INTERVENTION_SNOOZE_HOURS * HOUR).toISOString(), next_check_at: new Date(now.getTime() + INTERVENTION_SNOOZE_HOURS * HOUR).toISOString() }
    : { state: 'acknowledged', acknowledged_at: now.toISOString(), acknowledged_by: userId, next_check_at: null };
  const { error: uErr } = await admin().from('elaya_interventions').update(patch).eq('id', row.id);
  if (uErr) { console.error(`${LOG} reply update failed:`, uErr.message); return null; }
  await appendEvent(row.id, kind === 'done' ? 'resolved' : kind === 'snooze' ? 'snoozed' : 'acknowledged', { by_reply: text.slice(0, 80) }, userId);
  const ref = (row.evidence.ticket_no as string | undefined) ?? '';
  return `${REPLY_LINES[kind]}${ref ? ` (${row.title} ${ref})` : ''}`;
}

export type InterventionForPage = InterventionRow & { recipient_name: string | null; member_name: string | null; queendom_name: string | null };

/** The page read (admin/founder; the page gates): the newest rows with the names a person needs. */
export async function listInterventionsForPage(limit = 200): Promise<InterventionForPage[]> {
  const { data, error } = await admin().from('elaya_interventions').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error(`${LOG} page read failed:`, error.message); return []; }
  const rows = mapRows<InterventionRow, InterventionRow>(data, (r) => r);
  const [persons, members, qNames] = await Promise.all([
    people([...new Set(rows.map((r) => r.recipient_id).filter((x): x is string => Boolean(x)))]),
    memberNames([...new Set(rows.map((r) => r.member_id).filter((x): x is string => Boolean(x)))]),
    queendomNames(),
  ]);
  return rows.map((r) => ({ ...r, recipient_name: r.recipient_id ? (persons.get(r.recipient_id)?.full_name ?? null) : null, member_name: r.member_id ? (members.get(r.member_id) ?? null) : null, queendom_name: r.queendom_id ? (qNames.get(r.queendom_id) ?? null) : null }));
}

/** A person's own move on a row (the page): seen / snoozed / resolved / dismissed, with an event. The ACTION gates. */
export async function setInterventionStateCore(id: string, state: 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed', by: string, note: string | null, now: Date = new Date()): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> =
    state === 'acknowledged' ? { state, acknowledged_at: now.toISOString(), acknowledged_by: by, next_check_at: null }
    : state === 'snoozed' ? { state, snoozed_until: new Date(now.getTime() + INTERVENTION_SNOOZE_HOURS * HOUR).toISOString(), next_check_at: new Date(now.getTime() + INTERVENTION_SNOOZE_HOURS * HOUR).toISOString() }
    : state === 'resolved' ? { state, resolved_at: now.toISOString(), resolution: 'done_on_page', next_check_at: null }
    : { state, resolved_at: now.toISOString(), resolution: 'dismissed', next_check_at: null };
  const { error } = await admin().from('elaya_interventions').update(patch).eq('id', id).in('state', ['proposed', 'delivered', 'acknowledged', 'snoozed']);
  if (error) return { error: error.message };
  await appendEvent(id, state, note ? { note } : {}, by);
  return { error: null };
}

/** The founder's switch: the mode and the queendoms live delivery is on for (two settings rows). */
export async function setTeammateModeCore(mode: TeammateMode, queendomIds: string[]): Promise<{ error: string | null }> {
  const { error } = await admin().from('elaya_settings').upsert([
    { key: TEAMMATE_SETTING_KEYS.mode, value: mode },
    { key: TEAMMATE_SETTING_KEYS.queendoms, value: queendomIds },
  ], { onConflict: 'key' });
  return { error: error ? error.message : null };
}
