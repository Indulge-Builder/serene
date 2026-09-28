/**
 * client-activity.ts — THE pure shapes and day math of the Jokers' Activity dashboard (0250).
 * Client-safe (no DB, no server imports): the service returns these shapes, the dashboard computes
 * from them in the browser.
 *
 * One linked member group is one client entry (owner, 2026-09-28): a client with their own group
 * and a family group is two. Active = a client message or reaction in the last
 * CLIENT_ACTIVITY_SILENT_DAYS India days; Silent = none. There is no third state.
 */
import { CLIENT_ACTIVITY_SILENT_DAYS } from "@/lib/constants/joker-engagement";
import { IST_OFFSET_MS } from "@/lib/utils/ist";

/** One group (one client entry). `lc` / `lt`: the last time the client's side / our team wrote. */
export type ActivityGroup = {
  gid: string;
  mid: string;
  name: string;
  subject: string | null;
  qd: string | null;
  mem: string | null;
  lc: string | null;
  lt: string | null;
};
/** [group, India day, client messages, client reactions, [[hour, messages, reactions], …] (non-zero hours only)] */
export type ActivityDayRow = [string, string, number, number, [number, number, number][]];
export type ActivityBoard = { today: string; groups: ActivityGroup[]; days: ActivityDayRow[] };

/** One client's-side message behind a chart mark (sia.client_activity_messages). */
export type ActivityMessage = {
  groupJid: string;
  memberId: string;
  waMessageId: string;
  sentAt: string;
  senderName: string | null;
  type: string;
  body: string | null;
};

/** India calendar day (YYYY-MM-DD) of an instant. */
export function istDay(at: string | Date): string {
  return new Date(new Date(at).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
/** India clock (HH:MM) of an instant. */
export function istClock(at: string | Date): string {
  return new Date(new Date(at).getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}
/** YYYY-MM-DD plus n days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
/** Whole days from a to b (b later = positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Days since the client's side last wrote or reacted, as of `today` (null = never, on record). */
export function daysSilent(group: ActivityGroup, today: string): number | null {
  return group.lc ? daysBetween(istDay(group.lc), today) : null;
}
/** Active = a client message or reaction in the last 14 days, as of `today`. */
export function isActiveGroup(group: ActivityGroup, today: string): boolean {
  const d = daysSilent(group, today);
  return d !== null && d < CLIENT_ACTIVITY_SILENT_DAYS;
}
/** "Last word: Our team": our team wrote after the client's side last did. */
export function teamSpokeLast(group: ActivityGroup): boolean {
  return !!group.lt && (!group.lc || Date.parse(group.lt) > Date.parse(group.lc));
}

// ─── The dashboard's numbers: board + filters → everything the page shows ─────

export const NO_QUEENDOM = "No queendom";
export const NO_STATUS = "No status";
/** India weekdays in the order the page shows them (Monday first); values are getUTCDay() numbers. */
export const WEEK_ROWS: { wd: number; label: string; full: string }[] = [
  { wd: 1, label: "Mon", full: "Monday" }, { wd: 2, label: "Tue", full: "Tuesday" }, { wd: 3, label: "Wed", full: "Wednesday" },
  { wd: 4, label: "Thu", full: "Thursday" }, { wd: 5, label: "Fri", full: "Friday" }, { wd: 6, label: "Sat", full: "Saturday" },
  { wd: 0, label: "Sun", full: "Sunday" },
];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayLabel = (day: string) => `${Number(day.slice(8, 10))} ${MON[Number(day.slice(5, 7)) - 1]}`;
export const hourLabel = (h: number) => (h === 0 ? "12 am" : h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`);

export type ActivityFilters = {
  /** Empty = every value. */
  qds: string[];
  mems: string[];
  /** Member ids. */
  clients: string[];
  /** Inclusive India days. */
  from: string;
  to: string;
};
export type GroupStat = {
  g: ActivityGroup;
  qd: string;
  mem: string;
  /** The period's client messages and reactions. */
  msgs: number;
  reacts: number;
  /** As of today: a message or reaction in the last 14 days. */
  active: boolean;
  silentDays: number | null;
  /** Client messages per day over the 14 days ending today (oldest first), for the mini bars. */
  last14: number[];
};
export type Slot = { key: string; label: string; msgs: number; gids: string[] };
export type ActivityView = {
  today: string;
  from: string;
  to: string;
  oneDay: boolean;
  groups: GroupStat[];
  active: GroupStat[];
  silent: GroupStat[];
  silentActiveMembers: number;
  msgs: number;
  reacts: number;
  /** Days of the period, or the 24 hours of a single day. */
  slots: Slot[];
  buckets: { label: string; gids: string[] }[];
  byQueendom: { qd: string; total: number; active: string[]; silent: string[]; msgs: number }[];
  mostActive: GroupStat[];
  /** Silent, Active members first, then the longest silent. */
  silentOrdered: GroupStat[];
  weekdays: { wd: number; label: string; avg: number; total: number; days: number }[];
  /** heat[row][hour] — rows are WEEK_ROWS. */
  heat: number[][];
};

export function computeActivity(board: ActivityBoard, f: ActivityFilters): ActivityView {
  const inList = (list: string[], v: string) => list.length === 0 || list.includes(v);
  const today = board.today;
  const oneDay = f.from === f.to;
  const groups = board.groups.filter((g) => inList(f.qds, g.qd ?? NO_QUEENDOM) && inList(f.mems, g.mem ?? NO_STATUS) && inList(f.clients, g.mid));
  const ids = new Set(groups.map((g) => g.gid));
  const rows = board.days.filter((d) => ids.has(d[0]));
  const inPeriod = rows.filter((d) => d[1] >= f.from && d[1] <= f.to);
  const last14From = addDays(today, -13);

  const stat = new Map<string, GroupStat>(groups.map((g) => {
    const silentDays = daysSilent(g, today);
    return [g.gid, { g, qd: g.qd ?? NO_QUEENDOM, mem: g.mem ?? NO_STATUS, msgs: 0, reacts: 0,
      active: silentDays !== null && silentDays < CLIENT_ACTIVITY_SILENT_DAYS, silentDays, last14: new Array(14).fill(0) }];
  }));
  for (const d of rows) if (d[1] >= last14From && d[1] <= today) stat.get(d[0])!.last14[daysBetween(last14From, d[1])] = d[2];
  for (const d of inPeriod) { const s = stat.get(d[0])!; s.msgs += d[2]; s.reacts += d[3]; }
  const all = [...stat.values()];
  const active = all.filter((s) => s.active), silent = all.filter((s) => !s.active);

  // The period as days, or one day as its 24 hours.
  const slots: Slot[] = [];
  if (oneDay) {
    for (let h = 0; h < 24; h++) {
      const gids = new Set<string>(); let msgs = 0;
      for (const d of inPeriod) for (const [hh, m, r] of d[4]) if (hh === h) { msgs += m; if (m + r > 0) gids.add(d[0]); }
      slots.push({ key: String(h), label: hourLabel(h), msgs, gids: [...gids] });
    }
  } else {
    for (let day = f.from; day <= f.to; day = addDays(day, 1)) {
      const ds = inPeriod.filter((d) => d[1] === day);
      slots.push({ key: day, label: dayLabel(day), msgs: ds.reduce((t, d) => t + d[2], 0), gids: ds.filter((d) => d[2] + d[3] > 0).map((d) => d[0]) });
    }
  }

  const bucket = (label: string, test: (s: GroupStat) => boolean) => ({ label, gids: silent.filter(test).map((s) => s.g.gid) });
  const buckets = [
    bucket("14–30 d", (s) => s.silentDays !== null && s.silentDays <= 30),
    bucket("31–60 d", (s) => s.silentDays !== null && s.silentDays > 30 && s.silentDays <= 60),
    bucket("61–90 d", (s) => s.silentDays !== null && s.silentDays > 60 && s.silentDays <= 90),
    bucket("91+ d", (s) => s.silentDays !== null && s.silentDays > 90),
    bucket("No word", (s) => s.silentDays === null),
  ];

  const qdNames = [...new Set(all.map((s) => s.qd))].sort((a, b) => Number(a === NO_QUEENDOM) - Number(b === NO_QUEENDOM) || a.localeCompare(b));
  const byQueendom = qdNames.map((qd) => {
    const qs = all.filter((s) => s.qd === qd);
    return { qd, total: qs.length, active: qs.filter((s) => s.active).map((s) => s.g.gid), silent: qs.filter((s) => !s.active).map((s) => s.g.gid), msgs: qs.reduce((t, s) => t + s.msgs, 0) };
  });

  const days: string[] = [];
  for (let day = f.from; day <= f.to; day = addDays(day, 1)) days.push(day);
  const weekdays = WEEK_ROWS.map(({ wd, label }) => {
    const n = days.filter((d) => weekdayOf(d) === wd).length;
    const total = inPeriod.filter((d) => weekdayOf(d[1]) === wd).reduce((t, d) => t + d[2], 0);
    return { wd, label, avg: n ? Math.round(total / n) : 0, total, days: n };
  });
  const heat = WEEK_ROWS.map(() => new Array(24).fill(0) as number[]);
  for (const d of inPeriod) { const row = WEEK_ROWS.findIndex((w) => w.wd === weekdayOf(d[1])); for (const [h, m] of d[4]) heat[row][h] += m; }

  const memRank = (s: GroupStat) => (s.mem === "Active" ? 0 : 1);
  return {
    today, from: f.from, to: f.to, oneDay, groups: all, active, silent,
    silentActiveMembers: silent.filter((s) => s.mem === "Active").length,
    msgs: inPeriod.reduce((t, d) => t + d[2], 0), reacts: inPeriod.reduce((t, d) => t + d[3], 0),
    slots, buckets, byQueendom,
    mostActive: all.filter((s) => s.msgs + s.reacts > 0).sort((a, b) => b.msgs - a.msgs || b.reacts - a.reacts).slice(0, 8),
    silentOrdered: silent.slice().sort((a, b) => memRank(a) - memRank(b) || (b.silentDays ?? -1) - (a.silentDays ?? -1)),
    weekdays, heat,
  };
}
