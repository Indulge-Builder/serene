/**
 * joker-board.ts — THE pure shapes and numbers of the Jokers' Recommendations & Engagement dashboard
 * (0248/0249, read by sia.joker_board 0251). Client-safe: the service returns JokerBoardRaw, the
 * dashboard parses it once and computes every widget in the browser.
 *
 * One opening = one item sent to one client's group. Its outcome is the client's latest stance:
 * Interested / Undecided / Not interested on a Recommendation, Replied on an Engagement, No reply
 * until the client answers (owner, 2026-09-24: no waiting state, no cut-off).
 */
import { JOKER_CATEGORY_LABELS, type JokerCategory, type JokerTag } from "@/lib/constants/joker-engagement";
import { addDays, dayLabel, hourLabel, istDay, WEEK_ROWS } from "@/lib/utils/client-activity";
import { IST_OFFSET_MS } from "@/lib/utils/ist";

export type JokerOutcome = "interested" | "undecided" | "not_interested" | "replied" | "not_replied";
export const OUTCOME_LABELS: Record<JokerOutcome, string> = {
  interested: "Interested", undecided: "Undecided", not_interested: "Not interested", replied: "Replied", not_replied: "No reply",
};
/** One colour per outcome. No reply is powder blue, never a grey (owner, 2026-09-28: a grey
 *  read as missing and vanished in the tooltip); Replied (Engagements) is lilac. */
export const OUTCOME_COLORS: Record<JokerOutcome, string> = {
  interested: "var(--neu-success)", undecided: "var(--neu-warning)", not_interested: "var(--neu-danger)",
  replied: "var(--neu-lilac)", not_replied: "var(--neu-powder)",
};

type RawItem = [string, string, string, string, string, string, JokerOutcome, string | null, string | null, string | null, string | null, string | null, string | null, string | null, string | null];
export type JokerBoardRaw = {
  today: string;
  texts: { k: string; kind: string | null; tag: JokerTag | null; cat: string | null; title: string | null }[];
  members: { mid: string; name: string | null }[];
  /** The Jokers by their accounts: every joker seat now, and whoever sent an item in the window. */
  jokers: { pid: string; name: string | null }[];
  items: RawItem[];
};

export type JokerItem = {
  id: string;
  gid: string;
  mid: string;
  client: string;
  /** The Joker's account (the phone on an item captured before accounts). */
  joker: string;
  jokerName: string;
  sentAt: string;
  day: string;
  hour: number;
  wd: number;
  outcome: JokerOutcome;
  qd: string;
  tag: JokerTag;
  kind: string | null;
  cat: string;
  title: string;
  replyId: string | null;
  replyTier: string | null;
  replyAt: string | null;
  said: string | null;
};

export const ENGAGEMENT_CATEGORY = "Engagement";
const NO_CATEGORY = "No category";
const NO_QUEENDOM = "No queendom";
const catLabel = (tag: JokerTag, cat: string | null) =>
  tag === "engagement" ? ENGAGEMENT_CATEGORY
    : cat ? (JOKER_CATEGORY_LABELS as Record<string, string>)[cat] ?? cat.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
    : NO_CATEGORY;

/** An eighth colour for the pastel family, mixed from two of its members (never a grey; owner,
 *  2026-09-28: "just don't use gray"): a dusty mauve. */
export const JOKER_MAUVE = "color-mix(in srgb, var(--neu-lilac) 55%, var(--neu-danger))";
const CATEGORY_PASTELS: Record<JokerCategory, string> = {
  experience: "var(--neu-teal)", event: "var(--neu-lilac)", restaurant: "var(--neu-butter)",
  retail: "var(--neu-peach)", travel: "var(--neu-powder)", news_info: "var(--neu-sage)",
};
const CATEGORY_COLORS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CATEGORY_PASTELS).map(([id, c]) => [(JOKER_CATEGORY_LABELS as Record<string, string>)[id], c])),
  [ENGAGEMENT_CATEGORY]: JOKER_MAUVE,
  [NO_CATEGORY]: "var(--neu-danger)",
};
const SPARE_COLORS = ["var(--neu-teal)", "var(--neu-peach)", "var(--neu-lilac)", "var(--neu-powder)", "var(--neu-sage)", "var(--neu-butter)"];
/** THE colour of a category, the same slice colour in every pie (owner, 2026-09-28: a colour per
 *  slice, not shades of one); a label outside the vocabulary takes a spare by its position. */
export const categoryColor = (label: string, index: number) => CATEGORY_COLORS[label] ?? SPARE_COLORS[index % SPARE_COLORS.length];

export function parseJokerBoard(raw: JokerBoardRaw): { today: string; items: JokerItem[]; jokers: { id: string; name: string }[] } {
  const texts = new Map(raw.texts.map((t) => [t.k, t]));
  const names = new Map(raw.members.map((m) => [m.mid, m.name ?? "Client"]));
  const jokerNames = new Map((raw.jokers ?? []).map((j) => [j.pid, j.name ?? "Joker"]));
  const items = raw.items.map(([id, key, gid, mid, phone, sentAt, outcome, , qd, replyId, , replyTier, replyAt, said, pid]) => {
    const t = texts.get(key);
    const tag: JokerTag = t?.tag ?? "recommendation";
    const local = new Date(Date.parse(sentAt) + IST_OFFSET_MS);
    const joker = pid ?? phone;
    return {
      id, gid, mid, client: names.get(mid) ?? "Client", joker, jokerName: (pid && jokerNames.get(pid)) || phone,
      sentAt, day: istDay(sentAt), hour: local.getUTCHours(), wd: local.getUTCDay(), outcome, qd: qd ?? NO_QUEENDOM,
      tag, kind: t?.kind ?? null, cat: catLabel(tag, t?.cat ?? null), title: t?.title ?? "Untitled",
      replyId, replyTier, replyAt, said,
    };
  });
  // The Joker filter: every Joker account, plus any sender the accounts do not cover.
  const jokers = new Map<string, string>([...jokerNames]);
  for (const i of items) if (!jokers.has(i.joker)) jokers.set(i.joker, i.jokerName);
  return { today: raw.today, items, jokers: [...jokers].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export type BoardFilters = {
  /** Recommendations, Engagements, or both (never none). */
  tags: JokerTag[];
  /** Category labels; empty = every one. Applies to Recommendations only. */
  cats: string[];
  jokers: string[];
  qds: string[];
  clients: string[];
  /** Outcomes to keep; empty = every one (owner, 2026-09-28: the Outcome filter). */
  outcomes: JokerOutcome[];
  from: string;
  to: string;
};
export type SplitBy = "title" | "category" | "joker";

/** The "Sent" split names every group with at least SPLIT_MIN_ITEMS items, up to SPLIT_MAX (one per
 *  colour of the pastel family); only the small ones are combined into Others (owner, 2026-09-28: a
 *  big item such as Navratri must never hide in Others). */
export const SPLIT_MAX = 7;
export const SPLIT_MIN_ITEMS = 5;
export const SPLIT_OTHERS = "Others";
const SPLIT_NOUNS: Record<SplitBy, [string, string]> = { title: ["title", "titles"], category: ["category", "categories"], joker: ["joker", "jokers"] };

export type Seg = { key: string; label: string; ids: string[] };
export type StackCol = { key: string; label: string; segs: Seg[] };

/** The outcomes a view shows, in order (No reply last). */
export function outcomesFor(tags: JokerTag[]): JokerOutcome[] {
  const rec = tags.includes("recommendation"), eng = tags.includes("engagement");
  return [...(rec ? (["interested", "undecided", "not_interested"] as JokerOutcome[]) : []), ...(eng ? (["replied"] as JokerOutcome[]) : []), "not_replied"];
}

export function computeBoard(all: JokerItem[], today: string, f: BoardFilters, split: SplitBy) {
  const inList = (list: string[], v: string) => list.length === 0 || list.includes(v);
  const base = all.filter((i) => f.tags.includes(i.tag) && (i.tag === "engagement" || inList(f.cats, i.cat)) && inList(f.jokers, i.joker) && inList(f.qds, i.qd) && inList(f.clients, i.mid) && inList(f.outcomes, i.outcome));
  const rows = base.filter((i) => i.day >= f.from && i.day <= f.to);
  const outs = outcomesFor(f.tags);
  const ids = (xs: JokerItem[]) => xs.map((x) => x.id);
  const byOutcome = (xs: JokerItem[], label = ""): Seg[] => outs.map((o) => ({ key: o, label: `${label}${OUTCOME_LABELS[o]}`, ids: ids(xs.filter((x) => x.outcome === o)) }));
  const group = (xs: JokerItem[], key: (i: JokerItem) => string) => {
    const m = new Map<string, JokerItem[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return [...m].sort((a, b) => b[1].length - a[1].length);
  };
  const days: string[] = [];
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) days.push(d);

  // Sent per day, split by title / category / joker: every group big enough to name, then Others.
  const splitKey = (i: JokerItem) => (split === "title" ? i.title : split === "category" ? i.cat : i.jokerName);
  const ranked = group(rows, splitKey);
  const tops = ranked.filter(([, v]) => v.length >= SPLIT_MIN_ITEMS).slice(0, SPLIT_MAX).map(([k]) => k);
  const combined = ranked.length - tops.length;
  const splitGroups = combined ? [...tops, SPLIT_OTHERS] : tops;
  const [one, many] = SPLIT_NOUNS[split];
  /** How a group reads in the legend and the tooltip ("Others · 9 titles"). */
  const splitLabel = (g: string) => (g === SPLIT_OTHERS && combined ? `${SPLIT_OTHERS} · ${combined} ${combined === 1 ? one : many}` : g);
  const sgOf = (i: JokerItem) => (tops.includes(splitKey(i)) ? splitKey(i) : SPLIT_OTHERS);
  const sentPerDay: StackCol[] = days.map((d) => {
    const ds = rows.filter((i) => i.day === d);
    return { key: d, label: dayLabel(d), segs: splitGroups.map((g) => ({ key: g, label: `${dayLabel(d)} · ${splitLabel(g)}`, ids: ids(ds.filter((i) => sgOf(i) === g)) })) };
  });

  const todays = base.filter((i) => i.day === today);
  const interested = rows.filter((i) => i.outcome === "interested");
  const repliedRows = rows.filter((i) => i.outcome !== "not_replied");

  const pie = (xs: JokerItem[]) => group(xs, (i) => i.cat).map(([k, v]) => ({ key: k, label: k, ids: ids(v) }));
  const weekday = WEEK_ROWS.map((w) => {
    const xs = rows.filter((i) => i.wd === w.wd);
    const rate = xs.length ? Math.round((100 * xs.filter((i) => i.outcome !== "not_replied").length) / xs.length) : 0;
    return { key: String(w.wd), label: w.label, full: w.full, sent: xs.length, rate, ids: ids(xs) };
  });
  const heat = WEEK_ROWS.map((w) => Array.from({ length: 24 }, (_, h) => {
    const xs = rows.filter((i) => i.wd === w.wd && i.hour === h);
    return { sent: xs.length, replied: xs.filter((i) => i.outcome !== "not_replied").length, ids: ids(xs) };
  }));

  return {
    base, rows, outs,
    total: rows.length,
    /** Shares as ratios (0..1), printed by formatPercent: 1 of 242 reads "0.4%", never a rounded "0%". */
    repliedShare: rows.length ? repliedRows.length / rows.length : 0,
    tiles: outs.map((o) => { const xs = rows.filter((i) => i.outcome === o); return { key: o, label: OUTCOME_LABELS[o], n: xs.length, share: rows.length ? xs.length / rows.length : 0, ids: ids(xs) }; }),
    splitGroups, splitLabels: splitGroups.map(splitLabel), sentPerDay,
    response: outs.map((o) => ({ key: o, label: OUTCOME_LABELS[o], ids: ids(rows.filter((i) => i.outcome === o)) })),
    sentToday: group(todays, (i) => i.title).slice(0, 8).map(([k, v]) => ({ key: k, label: k, ids: ids(v) })),
    clients: group(repliedRows, (i) => i.client).slice(0, 10).map(([k, v]) => ({ key: k, label: k, segs: byOutcome(v, `${k} · `) })),
    byTitle: group(rows, (i) => i.title).slice(0, 12).map(([k, v]) => ({ key: k, label: k, segs: byOutcome(v, `${k} · `) })),
    byDate: days.map((d) => ({ key: d, label: dayLabel(d), segs: byOutcome(rows.filter((i) => i.day === d), `${dayLabel(d)} · `) })),
    pieSent: pie(rows),
    pieInterested: pie(interested),
    topInterest: group(interested, (i) => i.title).slice(0, 10).map(([k, v]) => ({ key: k, label: k, ids: ids(v) })),
    interestToday: group(todays.filter((i) => i.outcome === "interested"), (i) => i.title).slice(0, 6).map(([k, v]) => ({ key: k, label: k, ids: ids(v) })),
    weekday, heat,
  };
}
export type BoardView = ReturnType<typeof computeBoard>;

/** "4 min after", "2 d after": how long after the item the client answered. */
export function answeredAfter(sentAt: string, replyAt: string | null): string {
  if (!replyAt) return "";
  const min = Math.max(0, Math.round((Date.parse(replyAt) - Date.parse(sentAt)) / 60_000));
  return min < 60 ? `${min} min after` : min < 24 * 60 ? `${Math.round(min / 60)} h after` : `${Math.round(min / 1440)} d after`;
}
export { hourLabel };
