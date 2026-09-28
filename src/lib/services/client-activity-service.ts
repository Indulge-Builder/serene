/**
 * client-activity-service.ts — THE Jokers' Activity reads and the recount (migration 0250).
 *
 *   getClientActivityBoard()       the dashboard's one read (sia.client_activity_board): every
 *                                  linked member group and the days its client's side was active
 *   getClientActivityMessages(q)   the client's side's own messages behind a chart mark
 *   refreshClientActivity(from,to) the recount: the team list, then those India days
 *
 * Counting only, no model. Admin client throughout: the CALLER gates (the /jokers pages and the
 * jokers actions ask hasJokersAccess; the recount runs from Trigger.dev). No `server-only` chain,
 * so the Trigger.dev task can import it.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIENT_ACTIVITY_LOAD_DAYS } from "@/lib/constants/joker-engagement";
import type { ActivityBoard, ActivityMessage } from "@/lib/utils/client-activity";

const LOG = "[client-activity]";

// The 0250 functions are not in the generated types until the next regen; one loose handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { rpc: (f: string, a?: Record<string, unknown>) => any };
const sia = (): Loose => createAdminClient().schema("sia") as unknown as Loose;

/** The dashboard's one read. Null when it failed (the page says so; never a fake empty board). */
export async function getClientActivityBoard(days = CLIENT_ACTIVITY_LOAD_DAYS): Promise<ActivityBoard | null> {
  const { data, error } = await sia().rpc("client_activity_board", { p_days: days });
  if (error || !data) {
    console.error(`${LOG} board read failed`, error?.message);
    return null;
  }
  return data as ActivityBoard;
}

export type ActivityMessagesQuery = {
  /** Inclusive India days. */
  from: string;
  to: string;
  groupJids: string[] | null;
  /** 0 = Sunday. */
  weekday: number | null;
  hour: number | null;
  search: string | null;
  limit: number;
  offset: number;
};

/** The client's side's own messages in a window, newest first, with the total for the pager. */
export async function getClientActivityMessages(q: ActivityMessagesQuery): Promise<{ rows: ActivityMessage[]; total: number } | null> {
  const fromTs = new Date(`${q.from}T00:00:00+05:30`).toISOString();
  const toTs = new Date(Date.parse(`${q.to}T00:00:00+05:30`) + 86_400_000).toISOString();
  const { data, error } = await sia().rpc("client_activity_messages", {
    p_from: fromTs, p_to: toTs, p_group_jids: q.groupJids, p_weekday: q.weekday, p_hour: q.hour,
    p_search: q.search, p_limit: q.limit, p_offset: q.offset,
  });
  if (error) {
    console.error(`${LOG} messages read failed`, error.message);
    return null;
  }
  const raw = (data ?? []) as { group_jid: string; member_id: string; wa_message_id: string; sent_at: string; sender_name: string | null; type: string; body: string | null; total: number }[];
  return {
    rows: raw.map((r) => ({ groupJid: r.group_jid, memberId: r.member_id, waMessageId: r.wa_message_id, sentAt: r.sent_at, senderName: r.sender_name, type: r.type, body: r.body })),
    total: raw.length ? Number(raw[0].total) : 0,
  };
}

/** The recount: refresh the team list, then recount the India days from..to (inclusive). */
export async function refreshClientActivity(from: string, to: string): Promise<{ teamNow: number; teamEnded: number; rows: number }> {
  const { data: team, error: te } = await sia().rpc("refresh_team_senders");
  if (te) throw new Error(`${LOG} team list refresh failed: ${te.message}`);
  const { data: rows, error: re } = await sia().rpc("refresh_client_activity", { p_from: from, p_to: to });
  if (re) throw new Error(`${LOG} recount ${from}..${to} failed: ${re.message}`);
  const t = ((team ?? []) as { team_now: number; ended: number }[])[0];
  return { teamNow: t?.team_now ?? 0, teamEnded: t?.ended ?? 0, rows: Number(rows ?? 0) };
}
