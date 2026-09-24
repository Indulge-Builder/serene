// elaya-metrics.ts — THE verified layer for Elaya's ask-the-database tool (2026-09-24).
//
// Text-to-SQL is far more reliable when the model is handed the business's own metric
// definitions and a worked query for each (the 2026 benchmarks: about 40% correct on a bare
// schema, 85 to 98% with a semantic layer). These are the questions the founders actually ask,
// each with ONE meaning and ONE query that has been run against the cleaned `elaya_read` views
// and returns what the page would. describe_database folds them in; the model copies or adapts
// them instead of reinventing "waiting on us" or "response time" every turn (and getting a
// different number each time). Add a metric here when a founder's question has been answered
// two different ways; never a query that has not been run.

export type ElayaMetric = {
  /** Snake-case name the model can cite ("how I worked it out: waiting_on_us"). */
  name: string;
  /** The one-sentence business meaning, in the founders' words. */
  meaning: string;
  /** The query, over the `elaya_read` views only, exactly as query_database accepts it. */
  sql: string;
};

export const ELAYA_VERIFIED_METRICS: readonly ElayaMetric[] = [
  {
    name: 'active_members_by_queendom',
    meaning: 'Active members = membership_status exactly "Active", counted per queendom.',
    sql: "select q.name as queendom, count(*) as active_members from members m left join queendoms q on q.queendom_id = m.queendom_id where m.membership_status = 'Active' group by 1 order by 2 desc",
  },
  {
    name: 'members_waiting_on_us',
    meaning:
      'A member is waiting on us when the LAST real message in their concierge group is theirs (not staff), at least 30 minutes ago, with no upper bound (a week-old silence still counts). Oldest first. Drop sign-offs like "ok", "thanks", an emoji when judging.',
    sql: "with last as (select distinct on (m.group_id) m.group_id, m.is_staff, m.sent_at, left(m.text, 120) as text from whatsapp_messages m where m.sent_at > now() - interval '30 days' and not m.deleted and m.type not in ('system','reaction','protocol') order by m.group_id, m.sent_at desc) select mem.full_name as member, q.name as queendom, round(extract(epoch from (now() - l.sent_at))/3600, 1) as waiting_hours, l.text as last_message from last l join whatsapp_groups g on g.group_id = l.group_id join members mem on mem.member_id = g.member_id left join queendoms q on q.queendom_id = mem.queendom_id where g.kind = 'member' and not l.is_staff and l.sent_at < now() - interval '30 minutes' order by l.sent_at asc",
  },
  {
    name: 'response_time_by_queendom',
    meaning:
      'Response time = minutes from a member text message to the next staff message in the same group (only pairs where staff replied next). Median and p90 per queendom over a window (14 days here; change the interval).',
    sql: "with msgs as (select m.group_id, m.sent_at, m.is_staff, q.name as queendom from whatsapp_messages m join whatsapp_groups g on g.group_id = m.group_id join members mem on mem.member_id = g.member_id left join queendoms q on q.queendom_id = mem.queendom_id where g.kind = 'member' and m.sent_at > now() - interval '14 days' and not m.deleted and m.type = 'text'), seq as (select group_id, queendom, sent_at, is_staff, lead(sent_at) over (partition by group_id order by sent_at) as next_at, lead(is_staff) over (partition by group_id order by sent_at) as next_is_staff from msgs) select queendom, count(*) filter (where next_is_staff) as answered_asks, round(percentile_cont(0.5) within group (order by extract(epoch from (next_at - sent_at))/60) filter (where next_is_staff)::numeric, 1) as median_reply_minutes, round(percentile_cont(0.9) within group (order by extract(epoch from (next_at - sent_at))/60) filter (where next_is_staff)::numeric, 1) as p90_reply_minutes from seq where not is_staff group by 1 order by 1",
  },
  {
    name: 'freshdesk_by_queendom',
    meaning:
      'Freshdesk tickets per queendom (the queendom is the Freshdesk group): created and resolved in a window, open now, escalated and open. Open = status not in (4, 5).',
    sql: "select coalesce(q.name, g.name, 'other') as queendom, count(*) filter (where t.created_at >= now() - interval '7 days') as created_7d, count(*) filter (where t.resolved_at >= now() - interval '7 days') as resolved_7d, count(*) filter (where t.status not in (4,5)) as open_now, count(*) filter (where t.status not in (4,5) and t.is_escalated) as escalated_open from freshdesk_tickets t left join freshdesk_groups g on g.group_id = t.group_id left join queendoms q on q.freshdesk_group_id = t.group_id where t.created_at >= now() - interval '7 days' or t.resolved_at >= now() - interval '7 days' or t.status not in (4,5) group by 1 order by 2 desc",
  },
  {
    name: 'members_frustrated',
    meaning:
      'Members with frustrated or angry tone events from their WhatsApp group in the last 30 days (member_timeline, source whatsapp_group), worst first, with praise alongside.',
    sql: "select mem.full_name as member, count(*) filter (where e.tone in ('frustrated','angry')) as frustrated_events, count(*) filter (where e.tone = 'praise') as praise_events, max(e.occurred_at) as last_event from member_timeline e join members mem on mem.member_id = e.member_id where e.occurred_at > now() - interval '30 days' and e.source = 'whatsapp_group' group by 1 having count(*) filter (where e.tone in ('frustrated','angry')) > 0 order by 2 desc",
  },
  {
    name: 'renewals_with_usage',
    meaning:
      'Members whose membership ends in the next 60 days, with how many messages THEY sent in their group in the last 90 days (zero = paying and not using).',
    sql: "select mem.full_name as member, mem.membership_end, mem.membership_amount_inr, q.name as queendom, count(m.message_id) filter (where not m.is_staff and m.sent_at > now() - interval '90 days') as member_messages_90d from members mem left join queendoms q on q.queendom_id = mem.queendom_id left join whatsapp_groups g on g.member_id = mem.member_id and g.kind = 'member' left join whatsapp_messages m on m.group_id = g.group_id and m.sent_at > now() - interval '90 days' where mem.membership_status = 'Active' and mem.membership_end between current_date and current_date + 60 group by 1,2,3,4 order by mem.membership_end",
  },
];

/** The metrics as ONE compact text block for the catalog (describe_database). */
export function verifiedMetricsBlock(): string {
  return ELAYA_VERIFIED_METRICS.map((m) => `${m.name}: ${m.meaning}\n  SQL: ${m.sql}`).join('\n');
}
