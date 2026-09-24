// elaya-briefing.ts — THE twice-daily brief (rewritten 2026-09-24 to the founder's own spec).
//
// 10:00 IST: what happened from yesterday 6 pm to 10 am. 18:00 IST: from 10 am to 6 pm. Each brief is
// written from the RAW RECORD of its window, not from a snapshot: the Freshdesk tickets that came in
// and closed per queendom, the WhatsApp messages in the member and team groups (with who waited how
// long), the profiler's tone reads, the intake's feedback cards, birthdays and trips due, renewals,
// and Zoho's money movements. The writer (reasoning tier via the Elaya provider, maskPii on the
// input) puts it under her four headings first: going well, resolution gaps, anticipated falls that
// can still be saved, where service can be better; then requests, members, team, money, today.
//
// Delivery, per founder: their Elaya conversation (so "tell me more" has the brief in context),
// WhatsApp as free text when their 24-hour window is open, otherwise a one-line template ping with
// the "needs your eye" part, and always an in-app notification. Fails OPEN to plainBriefing() (numbers
// only) if the model is unavailable. Gated by `daily_briefing_enabled`. No `server-only` chain: it
// runs from Trigger.dev. No leads or deals in it by decision (the sales side is not onboarded yet).

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveLlmForJob } from '@/lib/elaya/registry';
import { maskPii } from '@/lib/elaya/pii';
import { getPiiMaskingDepth, getSessionExpiryHours } from '@/lib/services/llm-providers-service';
import { runElayaQuery, ELAYA_EXPORT_MAX_ROWS } from '@/lib/services/elaya-query-service';
import { getWaitingGroups, PULSE_WAITING_MIN_MINUTES, type WaitingGroup } from '@/lib/services/pulse-service';
import { getBooksOverview } from '@/lib/services/zoho-service';
import { sendElayaWhatsAppReply, sendElayaTemplatePing } from '@/lib/services/whatsapp-api';
import { createNotification } from '@/lib/services/notifications-service';
import { getOrCreateActiveConversation, insertAssistantMessage, waFreeTextWindowOpen } from '@/lib/services/elaya-service';
import { markdownToWhatsApp, splitWhatsAppText } from '@/lib/utils/whatsapp-format';
import { toISTMidnight, toIst } from '@/lib/utils/ist';
import { mapRows } from '@/lib/utils/rows';
import {
  BRIEFING_CHARS_BUDGET, BRIEFING_EVENING_HOUR, BRIEFING_INTERNAL_GROUP_LINES, BRIEFING_MAX_TOKENS, BRIEFING_MEMBER_GROUP_LINES,
  BRIEFING_MESSAGE_ROWS, BRIEFING_MORNING_HOUR, BRIEFING_NOTABLE_TICKETS, BRIEFING_OVERNIGHT_START_HOUR, BRIEFING_PING_CHARS,
  BRIEFING_PROMPT_VERSION, BRIEFING_RUN_KIND, BRIEFING_TICKET_ROWS, BRIEFING_TIMEOUT_MS, BRIEFING_TONE_ROWS, BRIEFING_WAITING_SHOWN,
  staffShortName,
} from '@/lib/constants/elaya-briefing';

const LOG = '[elaya-briefing]';
const WA_PART_CHARS = 4000;
export type BriefingSlot = 'morning' | 'evening';

// ── The window ───────────────────────────────────────────────────────────────

export function briefingWindow(slot: BriefingSlot, now = new Date()): { from: Date; to: Date; label: string; dayStart: Date } {
  const midnight = toISTMidnight(now);
  const h = (n: number) => new Date(midnight.getTime() + n * 3600_000);
  if (slot === 'morning') {
    return { from: h(BRIEFING_OVERNIGHT_START_HOUR - 24), to: h(BRIEFING_MORNING_HOUR), label: `yesterday ${BRIEFING_OVERNIGHT_START_HOUR - 12} pm to ${BRIEFING_MORNING_HOUR} am today`, dayStart: midnight };
  }
  return { from: h(BRIEFING_MORNING_HOUR), to: h(BRIEFING_EVENING_HOUR), label: `${BRIEFING_MORNING_HOUR} am to ${BRIEFING_EVENING_HOUR - 12} pm today`, dayStart: midnight };
}

// ── The record of the window ─────────────────────────────────────────────────

type Q = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

async function q(sql: string, max = 300): Promise<Q[]> {
  const r = await runElayaQuery(sql, max, ELAYA_EXPORT_MAX_ROWS);
  if (!r.ok) {
    console.warn(`${LOG} query failed:`, r.error.slice(0, 200));
    return [];
  }
  return r.rows;
}

export type BriefingData = {
  window: { from: string; to: string; label: string };
  freshdesk: { by_queendom: Q[]; notable: Q[]; created: Q[] } | null;
  whatsapp: { groups_active: number; messages: number; groups: Q[]; transcript: string; waiting_now: WaitingGroup[] };
  members: { tone_counts: Q[]; tone_events: Q[]; feedback_cards: Q[] };
  ahead: { occasions: Q[]; renewals: Q[] };
  team: { staff_messages: Q[]; freshdesk_resolved: Q[]; sia_tickets: Q[] };
  money: Record<string, unknown> | null;
  /** One block per queendom: the founder's view of who is carrying what and where it hurts. */
  by_queendom: Q[];
  /** The internal team groups active in the window, busiest first (their lines are in the transcript). */
  internal_groups: Q[];
  /** What each number's time frame is, in words, so the writer never presents an all-time total as the window's. */
  meaning: Record<string, string>;
};

function transcriptFor(groups: Q[], lines: Q[], waits: Map<string, Q>): string {
  const byGroup = new Map<string, Q[]>();
  for (const l of lines) { const k = String(l.group_id); (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(l); }
  // Member groups by the member's own volume, then the internal groups by theirs: the busiest of
  // each kind is read first and neither kind is squeezed out by the other.
  const ordered = [...groups].sort((a, b) => (Number(b.kind === 'member') - Number(a.kind === 'member')) || (n(b.member_msgs) + n(b.staff_msgs)) - (n(a.member_msgs) + n(a.staff_msgs)));
  const out: string[] = [];
  let used = 0;
  for (const g of ordered) {
    const ls = byGroup.get(String(g.group_id)) ?? [];
    if (!ls.length) continue;
    const cap = g.kind === 'internal' ? BRIEFING_INTERNAL_GROUP_LINES : BRIEFING_MEMBER_GROUP_LINES;
    const w = waits.get(String(g.group_id));
    const internal = g.kind === 'internal';
    const head = `## ${g.group_name} [${internal ? 'internal team group' : g.kind === 'member' ? 'member' : 'member group not yet mapped to a member'}]${g.member ? ` member: ${g.member}` : ''}${g.queendom ? ` (${g.queendom})` : ''} · member ${n(g.member_msgs)} / staff ${n(g.staff_msgs)} msgs${!internal && w && n(w.max_wait_min) >= 30 ? ` · longest wait for a staff reply ${Math.round(n(w.max_wait_min))} min` : ''}`;
    const body = (ls.length > cap ? [...ls.slice(0, Math.ceil(cap / 2)), { at: '…', text: `(${ls.length - cap} messages skipped)` }, ...ls.slice(-Math.floor(cap / 2))] : ls)
      .map((l) => `${l.at} ${l.is_staff ? 'S' : 'M'} ${l.is_staff ? staffShortName(l.sender_name as string, l.sender_id as string) : (l.sender_name ?? '?')}: ${l.text ?? (l.type ? `[${l.type}]` : '')}`)
      .join('\n');
    const block = head + '\n' + body + '\n';
    if (used + block.length > BRIEFING_CHARS_BUDGET) { out.push(`(${ordered.length - out.length} more groups not shown for space)`); break; }
    out.push(block); used += block.length;
  }
  return out.join('\n');
}

export async function gatherBriefingData(slot: BriefingSlot, now = new Date()): Promise<BriefingData> {
  const w = briefingWindow(slot, now);
  const F = `'${w.from.toISOString()}'::timestamptz`, T = `'${w.to.toISOString()}'::timestamptz`, D = `'${w.dayStart.toISOString()}'::timestamptz`;
  const WIN = `with w as (select ${F} as f, ${T} as t)`;

  const [fdByQ, fdNotable, fdCreated, groups, waits, lines, toneCounts, toneEvents, feedback, occasions, renewals, staffMsgs, fdAgents, siaTix, waiting, memberQueendoms] = await Promise.all([
    q(`${WIN} select q.name as queendom, count(*) filter (where t.created_at >= w.f and t.created_at < w.t) as created_in_window, count(*) filter (where t.resolved_at >= w.f and t.resolved_at < w.t) as resolved_in_window, count(*) filter (where t.status not in (4,5)) as open_total_now, count(*) filter (where t.status not in (4,5) and t.is_escalated) as escalated_total_now, count(*) filter (where t.status not in (4,5) and t.due_by < now()) as overdue_total_now, count(*) filter (where t.status not in (4,5) and t.created_at >= w.f and t.created_at < w.t) as still_open_of_created from w cross join freshdesk_tickets t join queendoms q on q.freshdesk_group_id = t.group_id where t.created_at >= w.f or t.resolved_at >= w.f or t.status not in (4,5) group by 1 order by 2 desc`, 20),
    q(`${WIN} select t.ticket_id, q.name as queendom, t.requester_name as requester, left(t.subject, 120) as subject, t.priority, t.status_label as status, t.is_escalated, to_char(t.created_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') as created from w cross join freshdesk_tickets t join queendoms q on q.freshdesk_group_id = t.group_id where (t.created_at >= w.f and t.created_at < w.t and (t.priority >= 3 or t.is_escalated)) or exists (select 1 from freshdesk_ticket_changes c where c.ticket_id = t.ticket_id and c.changed_at >= w.f and c.changed_at < w.t and ((c.field = 'is_escalated' and lower(c.new_value) in ('true','t','1')) or (c.field = 'priority' and c.new_value in ('3','4')) or (c.field = 'status' and c.old_value in ('4','5') and c.new_value not in ('4','5')))) order by t.priority desc, t.created_at desc limit ${BRIEFING_NOTABLE_TICKETS}`, BRIEFING_NOTABLE_TICKETS),
    q(`${WIN} select q.name as queendom, t.requester_name as requester, left(t.subject, 90) as subject, t.priority, t.status_label as status from w cross join freshdesk_tickets t join queendoms q on q.freshdesk_group_id = t.group_id where t.created_at >= w.f and t.created_at < w.t order by t.created_at desc limit ${BRIEFING_TICKET_ROWS}`, BRIEFING_TICKET_ROWS),
    q(`${WIN}, msgs as (select m.group_id, m.sent_at, m.is_staff from whatsapp_messages m, w where m.sent_at >= w.f and m.sent_at < w.t and not m.deleted and m.type not in ('system','reaction','protocol')) select g.group_id, g.name as group_name, g.kind, mem.full_name as member, q.name as queendom, count(*) filter (where not msgs.is_staff) as member_msgs, count(*) filter (where msgs.is_staff) as staff_msgs from msgs join whatsapp_groups g on g.group_id = msgs.group_id left join members mem on mem.member_id = g.member_id left join queendoms q on q.queendom_id = mem.queendom_id group by 1,2,3,4,5 order by 6 desc limit 400`, 400),
    q(`${WIN}, msgs as (select m.group_id, m.sent_at, m.is_staff from whatsapp_messages m join whatsapp_groups g on g.group_id = m.group_id, w where g.kind = 'member' and m.sent_at >= w.f and m.sent_at < w.t and not m.deleted and m.type = 'text'), seq as (select group_id, sent_at, is_staff, lead(sent_at) over (partition by group_id order by sent_at) as next_at, lead(is_staff) over (partition by group_id order by sent_at) as next_is_staff from msgs) select group_id, round(max(extract(epoch from (next_at - sent_at))/60) filter (where next_is_staff)) as max_wait_min from seq where not is_staff group by 1`, 400),
    q(`${WIN} select m.group_id, to_char(m.sent_at at time zone 'Asia/Kolkata', 'DD HH24:MI') as at, m.is_staff, m.sender_id, m.sender_name, m.type, left(m.text, 220) as text from whatsapp_messages m, w where m.sent_at >= w.f and m.sent_at < w.t and not m.deleted and m.type not in ('system','reaction','protocol') order by m.group_id, m.sent_at limit ${BRIEFING_MESSAGE_ROWS}`, BRIEFING_MESSAGE_ROWS),
    q(`${WIN} select e.tone, count(*) as events from member_timeline e, w where e.occurred_at >= w.f and e.occurred_at < w.t and e.source = 'whatsapp_group' group by 1`, 10),
    q(`${WIN} select mem.full_name as member, q.name as queendom, e.tone, left(e.summary, 200) as summary, to_char(e.occurred_at at time zone 'Asia/Kolkata', 'DD HH24:MI') as at from member_timeline e join members mem on mem.member_id = e.member_id left join queendoms q on q.queendom_id = mem.queendom_id, w where e.occurred_at >= w.f and e.occurred_at < w.t and e.source = 'whatsapp_group' order by (e.tone <> 'neutral') desc, e.occurred_at desc limit ${BRIEFING_TONE_ROWS}`, BRIEFING_TONE_ROWS),
    q(`${WIN} select mem.full_name as member, q.name as queendom, s.kind, s.tone, left(s.summary, 160) as summary, s.status from ticket_suggestions s join members mem on mem.member_id = s.member_id left join queendoms q on q.queendom_id = mem.queendom_id, w where s.created_at >= w.f and s.created_at < w.t and s.tone in ('happy','frustrated','angry') order by s.created_at desc limit 40`, 40),
    q(`select mem.full_name as member, c.kind, left(c.title, 120) as title, to_char(c.due_at at time zone 'Asia/Kolkata', 'DD Mon') as due from member_coming_up c join members mem on mem.member_id = c.member_id where c.status in ('pending','surfaced') and c.kind in ('occasion','trip') and c.due_at >= ${D} and c.due_at < ${D} + interval '2 days' order by c.due_at limit 60`, 60),
    q(`select full_name as member, membership_end, membership_amount_inr from members where membership_status = 'Active' and membership_end between current_date and current_date + 7 order by 2`, 40),
    q(`${WIN} select m.sender_id, m.sender_name, count(*) as msgs, count(distinct m.group_id) as member_groups, string_agg(distinct q.name, ', ') as queendoms from whatsapp_messages m join whatsapp_groups g on g.group_id = m.group_id left join members mem on mem.member_id = g.member_id left join queendoms q on q.queendom_id = mem.queendom_id, w where g.kind = 'member' and m.is_staff and m.sent_at >= w.f and m.sent_at < w.t and not m.deleted group by 1, 2 order by 3 desc limit 30`, 30),
    q(`${WIN} select a.name as agent, count(*) as resolved from freshdesk_tickets t join freshdesk_agents a on a.agent_id = t.agent_id, w where t.resolved_at >= w.f and t.resolved_at < w.t group by 1 order by 2 desc limit 8`, 8),
    q(`${WIN} select coalesce(q.name, 'unassigned') as queendom, count(*) filter (where s.created_at >= w.f and s.created_at < w.t) as created, count(*) filter (where s.closed_at >= w.f and s.closed_at < w.t) as closed from sia_tickets s left join queendoms q on q.queendom_id = s.queendom_id, w where s.created_at >= w.f or s.closed_at >= w.f group by 1`, 10),
    getWaitingGroups(PULSE_WAITING_MIN_MINUTES, 24 * 30, BRIEFING_WAITING_SHOWN),
    q(`select mem.member_id, q.name as queendom from members mem join queendoms q on q.queendom_id = mem.queendom_id`, 2000),
  ]);

  let money: Record<string, unknown> | null = null;
  try {
    const b = await getBooksOverview();
    if (b) {
      const f = toIst(w.from);
      const fromDate = `${f.year}-${String(f.month + 1).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
      const inWindow = (d: string) => d >= fromDate;
      money = {
        receivables: { total_due: b.receivables.totalDue, overdue: b.receivables.overdue, due_today: b.receivables.dueToday },
        this_month: b.thisMonth,
        uncategorised_bank_feed: b.uncategorised,
        payments_received_in_window: b.recentPayments.filter((p) => inWindow(p.date)).slice(0, 12).map((p) => ({ date: p.date, customer: p.customer_name, amount: p.amount, mode: p.payment_mode })),
        invoices_raised_in_window: b.recentInvoices.filter((i) => inWindow(i.date)).slice(0, 12).map((i) => ({ date: i.date, customer: i.customer_name, total: i.total, status: i.status })),
        cash_in_banks: b.cash.banks,
      };
    }
  } catch (e) {
    console.warn(`${LOG} Zoho unavailable for the brief:`, e instanceof Error ? e.message : e);
  }

  // Staff are named as the team says it (staffShortName); a person with two WhatsApp ids is one row.
  const staffBy = new Map<string, { staff: string; msgs: number; member_groups: number; queendoms: Set<string> }>();
  for (const r of staffMsgs) {
    const name = staffShortName(r.sender_name as string, r.sender_id as string);
    const cur = staffBy.get(name) ?? { staff: name, msgs: 0, member_groups: 0, queendoms: new Set<string>() };
    cur.msgs += n(r.msgs); cur.member_groups += n(r.member_groups);
    for (const qn of String(r.queendoms ?? '').split(', ').filter(Boolean)) cur.queendoms.add(qn);
    staffBy.set(name, cur);
  }
  const staff: Q[] = [...staffBy.values()].sort((a, b) => b.msgs - a.msgs).slice(0, 12).map((x) => ({ staff: x.staff, msgs: x.msgs, member_groups: x.member_groups, queendoms: [...x.queendoms].join(', ') }));
  const internalGroups: Q[] = groups.filter((g) => g.kind === 'internal').map((g) => ({ group: g.group_name, messages: n(g.member_msgs) + n(g.staff_msgs) })).sort((a, b) => n(b.messages) - n(a.messages));
  const waitMap = new Map<string, Q>(waits.map((x) => [String(x.group_id), x]));
  const qOf = new Map<string, string>(memberQueendoms.map((x) => [String(x.member_id), String(x.queendom)]));
  const names = new Set<string>([...fdByQ.map((r) => String(r.queendom)), ...groups.map((g) => g.queendom).filter(Boolean).map(String), ...qOf.values()]);
  const by_queendom: Q[] = [...names].sort().map((name) => {
    const fd = fdByQ.find((r) => r.queendom === name);
    const gs = groups.filter((g) => g.queendom === name && g.kind === 'member');
    const slow = gs.map((g) => ({ g, w: waitMap.get(String(g.group_id)) })).filter((x) => x.w && n(x.w.max_wait_min) >= 60).sort((a, b) => n(b.w!.max_wait_min) - n(a.w!.max_wait_min)).slice(0, 5);
    const waitingHere = (waiting ?? []).filter((x) => x.member_id && qOf.get(x.member_id) === name);
    const tone = toneEvents.filter((e) => e.queendom === name);
    return {
      queendom: name,
      tickets: fd ? { created_in_window: n(fd.created_in_window), resolved_in_window: n(fd.resolved_in_window), still_open_of_created: n(fd.still_open_of_created), open_total_now: n(fd.open_total_now), overdue_total_now: n(fd.overdue_total_now), escalated_total_now: n(fd.escalated_total_now) } : null,
      member_groups_active: gs.length,
      member_messages: gs.reduce((a, g) => a + n(g.member_msgs), 0),
      staff_messages: gs.reduce((a, g) => a + n(g.staff_msgs), 0),
      members_waiting_now: waitingHere.map((x) => ({ member: x.member ?? x.subject, waiting_hours: Math.round(x.waiting_minutes / 6) / 10, last_text: x.last_text })),
      slowest_replies_in_window: slow.map((x) => ({ member: x.g.member ?? x.g.group_name, longest_wait_min: Math.round(n(x.w!.max_wait_min)) })),
      frustrated_or_angry: tone.filter((e) => e.tone === 'frustrated' || e.tone === 'angry').map((e) => ({ member: e.member, at: e.at, summary: e.summary })),
      praise: tone.filter((e) => e.tone === 'praise' || e.tone === 'happy').map((e) => ({ member: e.member, summary: e.summary })),
      staff_active: staff.filter((x) => String(x.queendoms ?? '').includes(name)).map((x) => ({ staff: x.staff, msgs: n(x.msgs) })),
    };
  });
  const meaning = {
    window: `Everything marked in_window happened between ${w.label} (IST).`,
    open_total_now: 'open_total_now, overdue_total_now, escalated_total_now are the whole backlog as of this moment, every ticket ever opened that is still open, NOT this window. overdue = an open ticket whose Freshdesk due time has passed.',
    still_open_of_created: 'still_open_of_created = of the tickets created in this window, how many are still open now.',
    resolved_in_window: 'resolved_in_window counts tickets closed in the window whenever they were created, so it can exceed created_in_window.',
    members_waiting_now: 'members_waiting_now = member groups where the member had the last word, as of this moment, up to 30 days back (a sign-off like ok or thanks is not waiting).',
    slowest_replies_in_window: 'the longest gap between a member message and the next staff reply, inside the window, member groups only.',
    internal_groups: 'Internal team groups (Queen\'s Council, the Revenue groups, Concierge team, Onboarding, Tech) are where the staff talk to each other: what was decided, planned, asked, flagged. People speak there only when something happens, so a quiet spell or a slow reply there is never a gap; report what was SAID there, under Internal team.',
    occasions: 'occasions and trips: due today or tomorrow.',
    renewals: 'renewals: memberships ending in the next 7 days.',
    money: 'money: received and invoiced in the window; receivables, overdue and cash are as of now.',
  };
  return {
    by_queendom,
    internal_groups: internalGroups,
    meaning,
    window: { from: w.from.toISOString(), to: w.to.toISOString(), label: w.label },
    freshdesk: fdByQ.length ? { by_queendom: fdByQ, notable: fdNotable, created: fdCreated } : null,
    whatsapp: { groups_active: groups.length, messages: lines.length, groups: groups.map(({ group_id: _g, ...rest }) => rest), transcript: transcriptFor(groups, lines, waitMap), waiting_now: waiting ?? [] },
    members: { tone_counts: toneCounts, tone_events: toneEvents, feedback_cards: feedback },
    ahead: { occasions, renewals },
    team: { staff_messages: staff, freshdesk_resolved: fdAgents, sia_tickets: siaTix },
    money,
  };
}

// ── The writing ──────────────────────────────────────────────────────────────

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

/** The brief with no model in it: numbers only. The fallback, and the in-app body's source. */
export function plainBriefing(d: BriefingData, slot: BriefingSlot, firstName: string): string {
  const lines = [`${slot === 'morning' ? 'Good morning' : 'Good evening'} ${firstName}. The record from ${d.window.label}.`];
  if (d.freshdesk) {
    const tot = d.freshdesk.by_queendom.reduce<{ c: number; r: number; e: number }>((a, r) => ({ c: a.c + n(r.created_in_window), r: a.r + n(r.resolved_in_window), e: a.e + n(r.escalated_total_now) }), { c: 0, r: 0, e: 0 });
    lines.push(`*Requests:* ${tot.c} Freshdesk tickets in, ${tot.r} resolved; ${tot.e} escalated and open. ${d.freshdesk.by_queendom.slice(0, 4).map((r) => `${r.queendom} ${n(r.created_in_window)} in / ${n(r.resolved_in_window)} out`).join(', ')}.`);
  }
  lines.push(`*Groups:* ${d.whatsapp.messages} messages across ${d.whatsapp.groups_active} groups.` + (d.whatsapp.waiting_now.length ? ` Waiting on us: ${d.whatsapp.waiting_now.slice(0, 5).map((x) => `${x.member ?? x.subject} (${Math.round(x.waiting_minutes / 60)}h)`).join(', ')}.` : ' Nobody waiting on us.'));
  const bad = d.members.tone_events.filter((e) => e.tone === 'frustrated' || e.tone === 'angry');
  const good = d.members.tone_events.filter((e) => e.tone === 'praise');
  if (bad.length || good.length) lines.push(`*Members:* ${bad.length} frustrated moments${bad.length ? ` (${[...new Set(bad.map((e) => e.member))].slice(0, 4).join(', ')})` : ''}, ${good.length} praise.`);
  if (d.money) lines.push(`*Money:* ${inr(n((d.money.receivables as Q).total_due))} receivable, ${inr(n((d.money.receivables as Q).overdue))} overdue.`);
  if (d.ahead.occasions.length || d.ahead.renewals.length) lines.push(`*Today:* ${d.ahead.occasions.length} occasions or trips, ${d.ahead.renewals.length} renewals in 7 days.`);
  lines.push('Ask me about any of these.');
  return lines.join('\n');
}

const SYSTEM = `You are Elaya, the presence inside Indulge's operating system, writing the co-founders' {slot} brief for WhatsApp. You are given the RAW RECORD of one window, {label} (IST): the Freshdesk tickets per queendom, the WhatsApp messages in the member concierge groups (S = our staff, M = the member) and the internal team groups, who is waiting on us, the tone reads, the feedback cards, what is due, the team's load, the money, and a by_queendom block. The record also carries a "meaning" object that says the time frame of every number: read it and obey it.

Who reads it: the top person of the company, on a phone, in one minute. They want to know what needs their attention today and what they can stop worrying about. They do not want the record read back to them.

THE ONE RULE: say only what matters. A line earns its place when the founder would act on it, call someone about it, or feel better for knowing it. Never write a line to fill a section. Never list for the sake of listing. When nothing in a section matters, leave the section out entirely (no "none recorded"). A quiet window gives a short brief; a heavy window gives a longer one, still only the lines that matter. Aim for the shortest brief that loses nothing important: usually 12 to 25 lines; never more than 40.

Format: line 1 "{greeting} {name}." then, in the same line or the next, one plain sentence saying the window and the shape of it (quiet, busy, one fire). Then sections, each a bold label on its own line, then short "-" lines, ONE fact per line, in this order, including only the ones with something to say:
**Needs you today** — the 1 to 5 things that can still be saved or must be decided: a member waiting too long (name, how long, what they asked), a same-day booking not confirmed, a member turning frustrated, a wrong booking, a deadline in the next hours. Say what to do in the same line. Most important first.
**Going well** — 1 to 3 lines: what closed cleanly, who delivered, a member's praise. Only real ones.
**By queendom** — one line per queendom (Ananyshree, Anishqa, Sanika), in this shape: "Ananyshree: 20 in, 38 resolved; 243 open right now (182 past due, all time); <the one thing its queen should fix today, or 'steady'>". Add a second line only when that queendom has a member waiting or unhappy. Nothing else.
**Where service can be better** — 1 to 3 patterns of THIS window, only when they are real and repeat: slow first reply in a member group, a first suggestion the member rejected, load sitting on one person, duplicate outreach. Skip when there is nothing clear.
**Team** — at most 4 lines: who carried the most (name: messages in member groups, tickets resolved) and anyone whose replies were slow. Not the whole roster.
**Internal team** — what the staff said to each other that the founder should know: a decision, a plan, a mistake owned, money or vendor matters. 1 to 5 lines naming the group and the people. Skip when it was routine chatter.
**Money** — only lines that changed or need action: money received (total and from whom), invoices raised, overdue receivables when they moved, the uncategorised bank feed when it is large. Skip a line that says the same as yesterday.
**Today** — occasions, trips starting, renewals due, one per line with the date. Only when there are some.
Last line: one short invitation to ask for detail.

Rules: every fact comes from the record given; never invent, estimate, or guess a mood the messages do not show; when you name a problem, name the group and quote or paraphrase the message that shows it, briefly; numbers exact; a number that is not of the window carries its time frame in words ("right now", "all time", "next 7 days"); internal team groups are NEVER reported for a gap, a wait or a slow reply (people speak there only when something happens); staff are named as given (first names are fine, that is how the team says it); use the members' names as given; a sign-off like "ok", "thanks", an emoji is not waiting; plain words, short sentences, no emojis, no exclamation marks, no headings other than the bold labels, no tables, no line over 30 words.`;

async function words(d: BriefingData, slot: BriefingSlot, tokens: { in: number; out: number }): Promise<string | null> {
  try {
    const depth = await getPiiMaskingDepth();
    const llm = await resolveLlmForJob('reasoning');
    const { transcript, ...rest } = d.whatsapp;
    const payload = { ...d, whatsapp: rest };
    const r = await llm.adapter.complete({
      model: llm.model,
      maxTokens: Math.min(llm.maxTokens, BRIEFING_MAX_TOKENS),
      effort: 'low',
      timeoutMs: BRIEFING_TIMEOUT_MS,
      system: SYSTEM.replace('{slot}', slot).replace('{label}', d.window.label).replace('{greeting}', slot === 'morning' ? 'Good morning' : 'Good evening'),
      messages: [{ role: 'user', content: `Address the founder as {name} exactly (it is replaced per founder).\n\nThe record (JSON):\n${JSON.stringify(maskPii(payload, depth))}\n\nThe group messages of the window (S = staff, M = member):\n${maskPii(transcript, depth)}` }],
    });
    tokens.in += r.usage.inputTokens;
    tokens.out += r.usage.outputTokens;
    const text = r.text.trim();
    return text.length >= 120 ? text : null;
  } catch (e) {
    console.warn(`${LOG} model wording failed, sending the plain brief:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** The "needs your eye" part as one line, for the template ping when the WhatsApp window is closed. */
function pingDigest(text: string): string {
  const flat = text.replace(/\*\*/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const start = flat.findIndex((l) => /^Needs you today/i.test(l));
  const end = flat.findIndex((l, i) => i > start && /^(Going well|By queendom|Where service|Team|Internal team|Money|Today)/i.test(l));
  const part = start >= 0 ? flat.slice(start, end > start ? end : start + 6) : flat.slice(1, 6);
  return (part.join(' · ') + ' · Full brief in Serene, Elaya.').slice(0, BRIEFING_PING_CHARS);
}

export type BriefingOutcome = { user_id: string; name: string; whatsapp: 'sent' | 'pinged' | 'failed' | 'no_phone'; in_app: boolean; conversation: boolean };

export async function runBriefingSweep(slot: BriefingSlot, opts: { dryRun?: boolean } = {}): Promise<{ text: string | null; outcomes: BriefingOutcome[] }> {
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('id, full_name, phone').eq('role', 'founder').eq('is_active', true);
  const founders = mapRows<{ id: string; full_name: string; phone: string | null }, { id: string; full_name: string; phone: string | null }>(data, (x) => x);
  if (founders.length === 0) return { text: null, outcomes: [] };

  const tokens = { in: 0, out: 0 };
  const startedAt = new Date().toISOString();
  const d = await gatherBriefingData(slot);
  const written = await words(d, slot, tokens);
  const { data: runRow } = await admin.schema('sia').from('extraction_runs').insert({
    kind: BRIEFING_RUN_KIND, prompt_version: BRIEFING_PROMPT_VERSION, started_at: startedAt,
    input_ref: { slot, window: d.window, messages: d.whatsapp.messages, groups: d.whatsapp.groups_active, tickets: d.freshdesk?.created.length ?? 0, dry_run: Boolean(opts.dryRun) },
  }).select('id').single();
  const runId = (runRow as { id: string } | null)?.id ?? null;

  const outcomes: BriefingOutcome[] = [];
  let sample: string | null = null;
  const expiryHours = await getSessionExpiryHours();
  for (const f of founders) {
    const first = f.full_name.split(' ')[0] ?? f.full_name;
    const greeting = slot === 'morning' ? 'Good morning' : 'Good evening';
    const raw = written ?? plainBriefing(d, slot, '{name}');
    // The writer sometimes drops the {name} placeholder; the founder is greeted by name regardless.
    const text = (raw.includes('{name}') ? raw : raw.replace(new RegExp(`^${greeting}[.,!]?`), `${greeting} {name}.`)).replace(/\{name\}/g, first);
    sample ??= text;
    if (opts.dryRun) { outcomes.push({ user_id: f.id, name: f.full_name, whatsapp: f.phone ? 'failed' : 'no_phone', in_app: false, conversation: false }); continue; }

    let whatsapp: BriefingOutcome['whatsapp'] = f.phone ? 'failed' : 'no_phone';
    if (f.phone) {
      if (await waFreeTextWindowOpen(f.id)) {
        const parts = splitWhatsAppText(markdownToWhatsApp(text), WA_PART_CHARS);
        let ok = true;
        for (const part of parts) ok = (await sendElayaWhatsAppReply(f.phone, part, f.id)) && ok;
        whatsapp = ok ? 'sent' : 'failed';
      } else {
        whatsapp = (await sendElayaTemplatePing(f.phone, f.id, first, slot === 'morning' ? "Elaya's morning brief" : "Elaya's evening brief", pingDigest(text))) ? 'pinged' : 'failed';
      }
    }
    // The brief lives in the founder's Elaya conversation too, so "tell me more" has it in context.
    let conversation = false;
    try {
      const convo = await getOrCreateActiveConversation(f.id, expiryHours, 'in_app');
      const row = await insertAssistantMessage({ conversationId: convo.id, content: text, toolCalls: [], meta: { brain: 'briefing', slot, window: d.window, promptVersion: written ? BRIEFING_PROMPT_VERSION : 'plain' }, channel: 'in_app' });
      conversation = Boolean(row);
    } catch (e) {
      console.warn(`${LOG} could not file the brief in the conversation:`, e instanceof Error ? e.message : e);
    }
    const { error } = await createNotification({
      recipient_id: f.id, type: 'system', action_url: '/elaya',
      title: slot === 'morning' ? "Elaya's morning brief" : "Elaya's evening brief",
      body: text.replace(/\*/g, '').split('\n').filter(Boolean).slice(1, 4).join(' ').slice(0, 240),
    });
    outcomes.push({ user_id: f.id, name: f.full_name, whatsapp, in_app: !error, conversation });
  }
  if (runId) {
    await admin.schema('sia').from('extraction_runs').update({ ok: Boolean(written), finished_at: new Date().toISOString(), tokens_in: tokens.in, tokens_out: tokens.out, output: { model_wrote: Boolean(written), outcomes } }).eq('id', runId);
  }
  console.log(LOG, slot, JSON.stringify(outcomes.map((o) => ({ whatsapp: o.whatsapp, in_app: o.in_app, conversation: o.conversation }))));
  return { text: sample, outcomes };
}
