// member-travel.ts — THE "who is travelling" read (2026-10-03). One bounded composition, per scope,
// of the three places a trip shows up, so the question is ONE call and never a keyword hunt:
//   1. trips on record  — member_anticipations of kind `trip` the profiler or the team filed, with
//                         the member's own words as evidence (the dates usually sit in the title);
//   2. travel tickets   — Freshdesk tickets in the Travel category touched in the window (flight,
//                         hotel booking, car transfer, airport assistance, visa, experiences);
//   3. chat signals     — the member groups scanned ONCE with the travel vocabulary below over a
//                         short window, grouped by member, member-side lines first.
// It ranks, it never decides: every row carries its evidence with dates and who said it, and the
// coverage block says how far the scan reached (the archive's newest message, whether the cap was
// hit, the watcher's state), so the answer can state what it rests on. The scope is ALREADY decided
// by the caller (sia-access.ts: every queendom, or the seat's); never a model-supplied scope.
// Caller: elaya-data.findTravellingMembersFor (the tool). Runs on the admin client; the caller gates.
//
// Why: on 2026-09-28 "who is travelling right now" took four turns and 193k input tokens of
// keyword searches, missed members on each pass, and still mis-read one. The questions it answers:
// "who is travelling right now", "who is away this week", "who was travelling on the 28th",
// "where is everyone", "who is out of the country".

import { createAdminClient } from '@/lib/supabase/admin';
import { memberDb } from '@/lib/supabase/schemas';
import { mapRows } from '@/lib/utils/rows';
import { IST_OFFSET_MS } from '@/lib/utils/ist';
import { searchSiaMessages, getSiaSenderRoles, getSiaWatcherStatus } from '@/lib/services/sia-service';
import { listFreshdeskTicketsByCategory, getFreshdeskSyncHealth } from '@/lib/services/freshdesk-service';
import { queendomNames } from '@/lib/services/member-occasions';
import type { SiaViewerScope } from '@/lib/services/sia-access';

/**
 * The travel vocabulary, as the 'simple' full-text config sees it: no stemming, so every form is
 * spelled out; a quoted entry is a phrase. Kept narrow on purpose: a word that mostly means
 * something else on the concierge floor (transfer, terminal, pick up) is left out, a snippet
 * shows the model what a hit really said.
 */
export const TRAVEL_SIGNAL_TERMS: readonly string[] = [
  'flight', 'flights', 'flying', 'flew', 'landed', 'landing', 'airport', 'boarding', '"boarding pass"', 'lounge',
  '"check in"', '"checked in"', '"check out"', '"checked out"', 'hotel', 'resort', 'villa', 'visa', 'itinerary',
  'trip', 'travel', 'travelling', 'traveling', '"we are in"', '"we\'re in"', '"i am in"', '"i\'m in"', 'reached', 'arrived',
  'arriving', 'departure', 'departing', 'layover', 'immigration', 'passport', 'forex', '"sim card"', 'esim', 'roaming',
  'cruise', '"safe travels"', '"happy journey"', '"bon voyage"', '"back in"', '"back home"', '"return flight"', 'returning',
  'pnr', '"web check"', 'eticket', '"e ticket"', 'jet', 'chopper', 'helicopter', 'yacht',
];
export const TRAVEL_SIGNAL_QUERY = TRAVEL_SIGNAL_TERMS.join(' OR ');

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const TRIP_LOOKBACK_DAYS = 21;
const TRIP_LOOKAHEAD_DAYS = 2;
const FRESHDESK_WINDOW_FACTOR = 2; // tickets touched in twice the chat window
const SIGNAL_ROWS_CAP = 1500;
const FRESHDESK_ROWS_CAP = 400;
const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 50;
/** Beyond the detailed rows: this many names carry their why, the rest are names only. */
const MORE_WITH_WHY = 24;
const LATEST_PER_MEMBER = 2;
const TRIPS_PER_MEMBER = 2;
const TICKETS_PER_MEMBER = 2;
const UNLINKED_TICKETS_SHOWN = 8;
const FRESH_HOURS = 48;
const MEMBER_PAGE = 1000;
const BROADCAST_MIN_GROUPS = 3;
const TEAM_ONLY_MIN_LINES = 3;
const STAFF_ROLES = new Set(['staff', 'genie', 'bishop', 'queen', 'joker', 'joker_head', 'founder', 'admin']);
/** The Freshdesk Travel sub-categories that mean a journey (the mirror's labels, lower-cased). */
const TRAVEL_TICKET_KINDS = new Set(['flight', 'hotel booking', 'car transfer', 'airport assistance', 'visa']);

const clip = (v: string | null | undefined, n: number) => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};
const istDay = (iso: string) => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
const istStamp = (iso: string) => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') + ' IST';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "28 Sep 14:03" — the row stamps; as_of carries the year once. */
const shortStamp = (iso: string) => { const d = new Date(Date.parse(iso) + IST_OFFSET_MS); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const shortDay = (day: string) => { const d = new Date(`${day}T00:00:00Z`); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

export type TravellingMembersOptions = { as_of?: string | null; days?: number | null; limit?: number | null; queendom?: string | null; status?: string | null };

type Signal = { at: string; who: 'member' | 'staff' | 'other'; name: string | null; text: string };
type TripRow = { title: string; starts: string; days_since_start: number; evidence: string | null };
type TicketRow = { ticket: number; kind: string | null; status: string | null; subject: string; updated: string };

export type TravellingMemberRow = {
  member_id: string;
  member: string;
  queendom: string | null;
  why: string;
  last_at: string | null;
  lines: number;
  member_lines: number;
  latest: Signal[];
  trips: TripRow[];
  tickets: TicketRow[];
};

/**
 * THE composer. `scope` is the viewer's sia-access answer (every queendom, or the seat's lists);
 * `opts.queendom` narrows an all-queendoms scope by name; `opts.as_of` replays the read as of a past
 * moment ("who was travelling on the 28th"); `opts.days` is the chat window (default 7, at most 30).
 */
export async function findTravellingMembersInScope(scope: SiaViewerScope, opts: TravellingMembersOptions = {}, names?: Map<string, string>) {
  const admin = createAdminClient();
  const qNames = names ?? (await queendomNames());
  const asOfMs = opts.as_of && !Number.isNaN(Date.parse(opts.as_of)) ? Date.parse(opts.as_of) : Date.now();
  const asOf = new Date(asOfMs);
  const asOfIso = asOf.toISOString();
  const isPast = Date.now() - asOfMs > 6 * 3_600_000;
  const days = Math.min(Math.max(Math.round(opts.days ?? DEFAULT_DAYS), 1), MAX_DAYS);
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const status = (opts.status?.trim() || 'Active');

  // The scope → the queendoms whose members are read (null = every queendom).
  let queendomIds: string[] | null = scope.kind === 'all' ? null : scope.queendomIds;
  const fdGroupIds: number[] | null = scope.kind === 'all' ? null : scope.freshdeskGroupIds;
  let narrowed: string | null = null;
  if (opts.queendom) {
    const needle = opts.queendom.toLowerCase().replace(/'s queendom|queendom/g, '').trim();
    const hit = [...qNames.entries()].find(([, n]) => n.toLowerCase().includes(needle))?.[0] ?? null;
    if (!hit) return { ok: true as const, members: [], total: 0, note: `No queendom named "${opts.queendom}". Known: ${[...qNames.values()].join(', ')}.` };
    if (queendomIds && !queendomIds.includes(hit)) return { ok: true as const, members: [], total: 0, note: `${qNames.get(hit)} is outside this user's seat; they see only ${queendomIds.map((q) => qNames.get(q) ?? q).join(', ')}.` };
    queendomIds = [hit];
    narrowed = qNames.get(hit) ?? null;
  }

  // 1. The members in scope, with the WhatsApp group each one has (the 0217 mirror column).
  type M = { id: string; full_name: string; queendom_id: string | null; tier: string | null; membership_status: string | null; wa_group_jid: string | null };
  const members: M[] = [];
  for (let from = 0; ; from += MEMBER_PAGE) {
    let q = memberDb(admin).from('members').select('id, full_name, queendom_id, tier, membership_status, wa_group_jid').order('id').range(from, from + MEMBER_PAGE - 1);
    if (queendomIds) q = q.in('queendom_id', queendomIds);
    if (status.toLowerCase() !== 'any') q = q.ilike('membership_status', status);
    const { data, error } = await q;
    if (error) return { ok: false as const, error: 'the member list could not be read just now' };
    const page = mapRows<M, M>(data, (r) => r);
    members.push(...page);
    if (page.length < MEMBER_PAGE) break;
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const byGroup = new Map<string, M>();
  for (const m of members) if (m.wa_group_jid) byGroup.set(m.wa_group_jid, m);
  const ids = members.map((m) => m.id);
  const groupJids = [...byGroup.keys()];

  // 2. The three reads, side by side.
  const chatFrom = new Date(asOfMs - days * 86_400_000).toISOString();
  const tripFrom = new Date(asOfMs - TRIP_LOOKBACK_DAYS * 86_400_000).toISOString();
  const tripTo = new Date(asOfMs + TRIP_LOOKAHEAD_DAYS * 86_400_000).toISOString();
  const fdFrom = new Date(asOfMs - days * FRESHDESK_WINDOW_FACTOR * 86_400_000).toISOString();

  const readTrips = async () => {
    type A = { member_id: string; title: string; due_at: string; suggested_action: string | null; evidence: { quote?: string } | null; created_at: string };
    const out: A[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await memberDb(admin).from('member_anticipations')
        .select('member_id, title, due_at, suggested_action, evidence, created_at')
        .in('member_id', ids.slice(i, i + 150)).eq('kind', 'trip').in('status', ['pending', 'surfaced'])
        .gte('due_at', tripFrom).lte('due_at', tripTo).order('due_at', { ascending: false });
      if (error) return null;
      out.push(...mapRows<A, A>(data, (r) => r));
    }
    return out;
  };

  const [signals, trips, fd, fdHealth, watcher] = await Promise.all([
    groupJids.length ? searchSiaMessages(TRAVEL_SIGNAL_QUERY, undefined, undefined, { groupJids, since: chatFrom, until: asOfIso, limit: SIGNAL_ROWS_CAP }) : Promise.resolve([]),
    ids.length ? readTrips() : Promise.resolve([]),
    listFreshdeskTicketsByCategory({ groupIds: fdGroupIds, category: 'Travel', since: fdFrom, until: isPast ? asOfIso : null, limit: FRESHDESK_ROWS_CAP }),
    getFreshdeskSyncHealth().catch(() => null),
    isPast ? Promise.resolve(null) : getSiaWatcherStatus().catch(() => null),
  ]);

  // Who said each line: the member's own words weigh more than the team's planning. In a member's
  // own group everyone who is not staff is member-side (the member, family, their office): the
  // contact's staff link, a seat role, the watcher itself, or an "at Indulge" push name says staff;
  // participant_role alone says nothing ('unknown' for 94% of contacts).
  const roles = signals.length ? await getSiaSenderRoles(signals.map((s) => s.sender_jid)) : new Map<string, { role: string; is_staff: boolean; member_id: string | null }>();
  const whoOf = (s: { sender_jid: string; from_me: boolean; sender_name: string | null }): Signal['who'] => {
    if (s.from_me) return 'staff';
    const r = roles.get(s.sender_jid);
    if (r?.is_staff || (r && STAFF_ROLES.has(r.role))) return 'staff';
    if (/\bat indulge\b/i.test(s.sender_name ?? '')) return 'staff';
    return 'member';
  };
  // A line the team posted word-for-word in several groups is a broadcast (a festival, a sale),
  // not a signal about any one member: drop it.
  const textCount = new Map<string, number>();
  for (const sg of signals) { const k = (sg.text ?? '').slice(0, 80); textCount.set(k, (textCount.get(k) ?? 0) + 1); }
  const isBroadcast = (text: string | null) => (textCount.get((text ?? '').slice(0, 80)) ?? 0) >= BROADCAST_MIN_GROUPS;

  // 3. Fold everything onto the member.
  type Acc = { m: M; signals: Signal[]; trips: TripRow[]; tickets: TicketRow[] };
  const acc = new Map<string, Acc>();
  const get = (m: M) => { let a = acc.get(m.id); if (!a) { a = { m, signals: [], trips: [], tickets: [] }; acc.set(m.id, a); } return a; };
  let newestSeen: string | null = null;
  let broadcastsDropped = 0;
  for (const s of signals) {
    const m = byGroup.get(s.group_jid);
    if (!m || !s.text) continue;
    if (!newestSeen || s.wa_timestamp > newestSeen) newestSeen = s.wa_timestamp;
    if (isBroadcast(s.text)) { broadcastsDropped += 1; continue; }
    get(m).signals.push({ at: s.wa_timestamp, who: whoOf(s), name: s.sender_name, text: clip(s.text, 80) });
  }
  for (const t of trips ?? []) {
    const m = byId.get(t.member_id);
    if (!m) continue;
    get(m).trips.push({
      title: clip(t.title, 64), starts: istDay(t.due_at), days_since_start: Math.round((asOfMs - Date.parse(t.due_at)) / 86_400_000),
      evidence: t.evidence?.quote ? clip(t.evidence.quote, 72) : null,
    });
  }
  const unlinked: { ticket: number; requester: string | null; subject: string; status: string | null; updated: string }[] = [];
  for (const t of fd?.tickets ?? []) {
    // "Experiences" is mostly a class, a trainer, a dermatologist: not a journey.
    if (t.sub_category && !TRAVEL_TICKET_KINDS.has(t.sub_category.toLowerCase())) continue;
    const m = t.member_id ? byId.get(t.member_id) : undefined;
    const row: TicketRow = { ticket: t.id, kind: t.sub_category, status: t.status_label, subject: clip(t.subject, 54), updated: t.fd_updated_at ? istDay(t.fd_updated_at) : '' };
    if (m) get(m).tickets.push(row);
    else if (!t.member_id && unlinked.length < UNLINKED_TICKETS_SHOWN) unlinked.push({ ticket: t.id, requester: t.requester_name, subject: row.subject, status: row.status, updated: row.updated });
  }

  // 4. Rank: the member's own fresh words first, then the team's, then what is on record.
  const freshFrom = asOfMs - FRESH_HOURS * 3_600_000;
  const scored = [...acc.values()].map((a) => {
    a.signals.sort((x, y) => y.at.localeCompare(x.at));
    const memberFresh = a.signals.filter((s) => s.who === 'member' && Date.parse(s.at) >= freshFrom).length;
    const staffFresh = a.signals.filter((s) => s.who !== 'member' && Date.parse(s.at) >= freshFrom).length;
    const memberSide = a.signals.filter((s) => s.who === 'member').length;
    const tripNow = a.trips.some((t) => t.days_since_start >= -TRIP_LOOKAHEAD_DAYS && t.days_since_start <= TRIP_LOOKBACK_DAYS);
    const ticketFresh = a.tickets.some((t) => t.updated && Date.parse(t.updated) >= asOfMs - 7 * 86_400_000);
    // The member's own words first, fresh ones most; then a trip on record; then the team's lines.
    const score = memberFresh * 3 + memberSide * 2 + staffFresh + Math.min(a.signals.length, 20) * 0.5 + (tripNow ? 4 : 0) + (ticketFresh ? 2 : 0);
    const parts: string[] = [];
    if (memberSide) parts.push(`${memberSide} member line${memberSide === 1 ? '' : 's'}${memberFresh ? ` (${memberFresh} fresh)` : ''}`);
    if (a.signals.length - memberSide) parts.push(`${a.signals.length - memberSide} team`);
    if (a.trips.length) parts.push(`trip${a.trips.length === 1 ? '' : 's'} ${[...new Set(a.trips.map((t) => shortDay(t.starts)))].slice(0, 3).join('/')}`);
    if (a.tickets.length) parts.push(`${a.tickets.length} ticket${a.tickets.length === 1 ? '' : 's'}`);
    const latest = [...a.signals.filter((s) => s.who === 'member'), ...a.signals.filter((s) => s.who !== 'member')].slice(0, LATEST_PER_MEMBER).sort((x, y) => y.at.localeCompare(x.at));
    const row: TravellingMemberRow = {
      member_id: a.m.id, member: a.m.full_name, queendom: a.m.queendom_id ? (qNames.get(a.m.queendom_id) ?? null) : null,
      why: parts.join('; '), last_at: a.signals[0] ? shortStamp(a.signals[0].at) : null, lines: a.signals.length, member_lines: memberSide,
      latest: latest.map((s) => ({ ...s, at: shortStamp(s.at) })),
      trips: a.trips.slice(0, TRIPS_PER_MEMBER).map((t) => ({ ...t, starts: shortDay(t.starts) })),
      tickets: a.tickets.slice(0, TICKETS_PER_MEMBER).map((t) => ({ ...t, updated: t.updated ? shortDay(t.updated) : '' })),
    };
    return { score, row, sortAt: a.signals[0]?.at ?? '' };
  }).sort((x, y) => y.score - x.score || y.sortAt.localeCompare(x.sortAt));

  // Listed = something that can place the member: their own line, a trip on record, a travel
  // ticket, or the team talking travel repeatedly. Team-only passing mentions are named, not lost.
  const listed = scored.filter((s) => s.row.member_lines > 0 || s.row.trips.length > 0 || s.row.tickets.length > 0 || s.row.lines >= TEAM_ONLY_MIN_LINES);
  const passing = scored.filter((s) => !listed.includes(s)).map((s) => s.row.member);
  const rows = listed.map((s) => s.row);
  // Beyond the detailed rows every remaining name still reaches the answer, with its one-line why.
  const more = rows.slice(limit).map((r, i) => (i < MORE_WITH_WHY ? `${r.member}: ${r.why}; last ${r.last_at ?? '-'}` : r.member));
  const scopeName = queendomIds ? (narrowed ?? queendomIds.map((q) => qNames.get(q) ?? q).join(', ')) : 'all queendoms';
  return {
    ok: true as const,
    as_of: istStamp(asOfIso),
    scope: scopeName,
    status,
    members_in_scope: members.length,
    members_listed: Math.min(rows.length, limit),
    total_with_signals: rows.length,
    members: rows.slice(0, limit),
    more_with_signals: more,
    team_mention_only: passing,
    unlinked_travel_tickets: unlinked,
    coverage: {
      chats: {
        window: `${istDay(chatFrom)} to ${istDay(asOfIso)} (${days} days)`,
        groups_scanned: groupJids.length,
        members_without_group: members.length - groupJids.length,
        signal_rows: signals.length,
        broadcast_lines_dropped: broadcastsDropped,
        capped: signals.length >= SIGNAL_ROWS_CAP,
        newest_message_seen: newestSeen ? istStamp(newestSeen) : null,
        watcher: watcher ? { state: watcher.state, connected: watcher.connected, last_beat_at: watcher.beat_at } : isPast ? 'not relevant for a past date' : 'unknown',
      },
      trips_on_record: { window: `trips starting ${istDay(tripFrom)} to ${istDay(tripTo)}`, rows: trips ? trips.length : null },
      freshdesk: { window: `Travel tickets touched since ${istDay(fdFrom)}`, rows: fd ? fd.tickets.length : null, total: fd ? fd.totalCount : null, last_sync_at: fdHealth?.lastPollAt ?? null, last_sync_ok: fdHealth?.lastPollOk ?? null },
    },
    warnings: [
      ...(trips === null ? ['the trips on record could not be read'] : []),
      ...(fd === null ? ['the Freshdesk mirror could not be read'] : []),
      ...(signals.length >= SIGNAL_ROWS_CAP ? [`the chat scan hit its cap of ${SIGNAL_ROWS_CAP} lines: lines older than ${newestSeen ? 'the oldest shown' : 'the cap'} inside the window were not read; narrow with a smaller days or a queendom`] : []),
      ...(watcher && !watcher.connected ? [`the WhatsApp watcher is ${watcher.state}: the chat signals end at ${newestSeen ? istStamp(newestSeen) : 'the last message it saw'}`] : []),
    ],
    how_to_read: [
      'Ranked by evidence, not decided: say where a member is and until when ONLY from the lines, trips and tickets shown, with their dates. Signals with no destination in them = "travel chatter, destination not stated".',
      'Dates live in a trip title or its evidence and in ticket subjects; with no end date anywhere say "no return date on record", never guess.',
      'Home logistics (a delivery to the house, an appointment in the home city) do not prove a member is home: the team runs the house while members travel. Only a dated line about being back does.',
      'Conflicting signals (a trip on record that spans today, a line that sounds home-side): give both with dates and ask the genie; never pick one silently.',
      'A trip may name family travelling together; each may be a member in their own right with their own row.',
      'The scan is words, not judgement ("hotel" can be a restaurant, "trip" a day out): read the snippet. Member lines first; a member with only team lines is weaker evidence.',
      'more_with_signals = the names ranked below the detailed rows, each with its why: name them when the list is cut; raise limit or call get_member_360 for one that matters. team_mention_only = a passing travel word from the team only: name them only if asked for everyone, never as travelling.',
      `Lines shown: ${LATEST_PER_MEMBER} per member over ${days} days, trips and tickets ${TRIPS_PER_MEMBER} each. For one member's full thread use get_member_360 or get_member_recent_messages.`,
    ],
  };
}
