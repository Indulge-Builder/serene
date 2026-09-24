// pulse-service.ts — THE live pulse: one picture of the whole company right now.
//
// Company-wide on purpose (every domain, every queendom), so the CALLER decides who may see it:
// Elaya's get_live_pulse admits founder and admin, the daily briefing goes to founders. Built
// from three reads that already exist, no new business logic:
//   * one read-only query over the cleaned elaya_read views (0223) for the counters,
//   * getFreshdeskOverview() with no filters: the SAME numbers the /freshdesk strip shows,
//   * sia.groups_waiting_for_reply() (0224): linked member groups where the member had the last word.
// Every section fails soft to null: a slow Freshdesk read never costs the founder the whole pulse.
// No `server-only` import chain: it also runs from Trigger.dev (the briefing).

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { toISTMidnight } from "@/lib/utils/ist";
import { mapRows } from "@/lib/utils/rows";
import { runElayaQuery } from "@/lib/services/elaya-query-service";
import { getFreshdeskOverview } from "@/lib/services/freshdesk-service";
import { isOnlyAcknowledgement } from "@/lib/services/ticket-intake";

export const PULSE_WAITING_MIN_MINUTES = 30;
// 30 days, not 24 hours (2026-09-24): a member who has waited a week is the one who matters most,
// and the day ceiling kept dropping exactly those from the list ("the older gaps don't show here").
export const PULSE_WAITING_MAX_HOURS = 24 * 30;
const PULSE_WAITING_SHOWN = 8;

export type PulseWaiting = { member: string | null; group: string | null; waiting_minutes: number; last_text: string | null };

export type LivePulse = {
  at: string;
  today_starts_at: string;
  sales: {
    leads_new_today: number; leads_new_today_not_yet_contacted: number; leads_status_new_total: number;
    leads_new_by_domain: Record<string, number>; calls_today: number; deals_today: number; revenue_today_inr: number;
  } | null;
  work: { tasks_overdue: number; sia_tickets_open: number; ticket_suggestions_open: number } | null;
  members: {
    waiting_count: number; waiting: PulseWaiting[]; group_messages_today: number; groups_active_today: number;
    member_occasions_next_7_days: number; renewals_next_14_days: number;
  } | null;
  freshdesk: { open: number; created_today: number; resolved_today: number; escalated_open: number; last_sync_at: string | null } | null;
};

const n = (v: unknown) => Number(v ?? 0);

async function counters(todayStart: string) {
  // `todayStart` is an ISO string this file made from a Date: never user or model text.
  const r = await runElayaQuery(
    `with t as (select '${todayStart}'::timestamptz as d0)
     select
       (select count(*) from leads, t where created_at >= d0 and not archived) as leads_new_today,
       (select count(*) from leads, t where created_at >= d0 and status = 'new' and not archived) as leads_new_today_not_yet_contacted,
       (select count(*) from leads where status = 'new' and not archived) as leads_status_new_total,
       (select coalesce(jsonb_object_agg(domain, c), '{}'::jsonb) from (select domain, count(*) as c from leads, t where created_at >= d0 and not archived group by 1) x) as leads_new_by_domain,
       (select count(*) from lead_notes, t where call_outcome is not null and created_at >= d0) as calls_today,
       (select count(*) from deals, t where won_at >= d0 and not archived) as deals_today,
       (select coalesce(sum(deal_amount), 0) from deals, t where won_at >= d0 and not archived) as revenue_today_inr,
       (select count(*) from tasks where status in ('to_do', 'in_progress') and due_at < now()) as tasks_overdue,
       (select count(*) from sia_tickets where closed_at is null) as sia_tickets_open,
       (select count(*) from ticket_suggestions where status = 'open') as ticket_suggestions_open,
       (select count(*) from whatsapp_messages, t where sent_at >= d0) as group_messages_today,
       (select count(distinct group_id) from whatsapp_messages, t where sent_at >= d0) as groups_active_today,
       (select count(*) from member_coming_up where status in ('pending', 'surfaced') and due_at between now() and now() + interval '7 days') as member_occasions_next_7_days,
       (select count(*) from members where membership_status = 'Active' and membership_end between current_date and current_date + 14) as renewals_next_14_days`,
    1,
  );
  if (!r.ok) {
    console.error("[pulse-service] counters failed:", r.error);
    return null;
  }
  return r.rows[0] ?? null;
}

async function waitingGroups(): Promise<{ count: number; shown: PulseWaiting[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0224 is not in the generated types until the next regen
  const sia = createAdminClient().schema("sia") as unknown as { rpc: (f: string, a: Record<string, unknown>) => any };
  const { data, error } = await sia.rpc("groups_waiting_for_reply", { p_min_minutes: PULSE_WAITING_MIN_MINUTES, p_max_hours: PULSE_WAITING_MAX_HOURS });
  if (error) {
    console.error("[pulse-service] waiting groups failed:", error.message);
    return null;
  }
  type Row = { subject: string | null; member_id: string | null; last_text: string | null; waiting_minutes: number };
  // "Ok", "Noted", "Thanks", an emoji: the member closed the chat, nobody is waiting. Intake's own rule (R-01).
  const rows = mapRows<Row, Row>(data, (x) => x).filter((x) => !isOnlyAcknowledgement([x.last_text ?? ""]));
  const ids = [...new Set(rows.map((x) => x.member_id).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ms } = await memberDb(createAdminClient()).from("members").select("id, full_name").in("id", ids);
    mapRows<{ id: string; full_name: string }, void>(ms, (m) => { names.set(m.id, m.full_name); });
  }
  return {
    count: rows.length,
    shown: rows.slice(0, PULSE_WAITING_SHOWN).map((x) => ({
      member: x.member_id ? (names.get(x.member_id) ?? null) : null,
      group: x.subject,
      waiting_minutes: n(x.waiting_minutes),
      last_text: x.last_text,
    })),
  };
}

export async function getLivePulse(): Promise<LivePulse> {
  const now = new Date();
  const todayStart = toISTMidnight(now).toISOString();
  const [c, waiting, fd] = await Promise.all([
    counters(todayStart),
    waitingGroups(),
    getFreshdeskOverview({ search: null, status: [], group: null, agent: null, category: null, priority: null, dateFrom: null, dateTo: null, member: null, page: 1 })
      .catch((e) => { console.error("[pulse-service] freshdesk failed:", e instanceof Error ? e.message : e); return null; }),
  ]);
  return {
    at: now.toISOString(),
    today_starts_at: todayStart,
    sales: c && {
      leads_new_today: n(c.leads_new_today), leads_new_today_not_yet_contacted: n(c.leads_new_today_not_yet_contacted), leads_status_new_total: n(c.leads_status_new_total),
      leads_new_by_domain: (c.leads_new_by_domain as Record<string, number> | null) ?? {},
      calls_today: n(c.calls_today), deals_today: n(c.deals_today), revenue_today_inr: n(c.revenue_today_inr),
    },
    work: c && { tasks_overdue: n(c.tasks_overdue), sia_tickets_open: n(c.sia_tickets_open), ticket_suggestions_open: n(c.ticket_suggestions_open) },
    members: c && {
      waiting_count: waiting?.count ?? 0, waiting: waiting?.shown ?? [],
      group_messages_today: n(c.group_messages_today), groups_active_today: n(c.groups_active_today),
      member_occasions_next_7_days: n(c.member_occasions_next_7_days), renewals_next_14_days: n(c.renewals_next_14_days),
    },
    freshdesk: fd && { open: fd.openTotal, created_today: fd.createdToday, resolved_today: fd.resolvedToday, escalated_open: fd.escalatedOpen, last_sync_at: fd.sync.lastPollAt },
  };
}
