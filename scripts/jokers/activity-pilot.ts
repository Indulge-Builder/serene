/**
 * The Activity dashboard's bench (0250): recount one day on the LOCAL database and check it.
 *
 *   1. sia.refresh_team_senders()                      who is NOT the client's side, and why
 *   2. sia.refresh_client_activity(day - 20, day)      the daily counts, per group
 *   3. the numbers the dashboard would show for that day: active groups, client messages,
 *      reactions; Active (a message or reaction in the 14 days ending that day) vs Silent (none);
 *      by queendom and by membership
 *   4. the CHECK: for a sample of groups, every sender of that day and which side they were put
 *      on; and the people counted as the client's side who wrote in 2+ different groups (the
 *      likeliest staff member the checks missed)
 *
 * It writes only to the local database (the refresh functions) and refuses any other target.
 * The console prints numbers only; the report names clients and is written OUTSIDE the repo
 * (~/Desktop/serene-backups). Feed it with copy-chats-for-testing.ts --all-groups first.
 *
 * Run: npx tsx --env-file=.env.local scripts/jokers/activity-pilot.ts [--day YYYY-MM-DD] [--sample 8]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const argv = process.argv.slice(2);
const flag = (n: string): string | null => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? null) : null; };
const SAMPLE = Number(flag("--sample") ?? 8) || 8;
const ACTIVE_DAYS = 14;
const say = (s: string) => console.log(`  ${s}`);

const LOCAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const host = (() => { try { return new URL(LOCAL_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING TO RUN. This bench recounts (writes) on NEXT_PUBLIC_SUPABASE_URL, which points at "${host}". Local only.`);
  process.exit(1);
}
const db: SupabaseClient = createClient(LOCAL_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });

/** India date arithmetic on YYYY-MM-DD strings. */
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DAY = flag("--day") ?? addDays(istToday(), -1);
const FROM = addDays(DAY, -(ACTIVE_DAYS - 1));
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString();

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[]; out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

type Group = { group_jid: string; member_id: string; subject: string | null; is_active: boolean };
type Member = { id: string; full_name: string | null; queendom_id: string | null; membership_status: string | null };
type Daily = { group_jid: string; day: string; client_messages: number; client_reactions: number; client_senders: number; last_client_at: string | null; last_team_at: string | null };
type Team = { jid: string; reasons: string[]; team_until: string | null };
type Contact = { jid: string; lid: string | null; push_name: string | null; member_id: string | null };

async function main() {
  say(`local recount for ${DAY}; Active = a client message or reaction ${FROM} … ${DAY}`);
  const { data: t, error: te } = await db.schema("sia").rpc("refresh_team_senders");
  if (te) throw new Error(`refresh_team_senders: ${te.message}`);
  const { data: n, error: ne } = await db.schema("sia").rpc("refresh_client_activity", { p_from: addDays(DAY, -20), p_to: DAY });
  if (ne) throw new Error(`refresh_client_activity: ${ne.message}`);
  say(`team list: ${JSON.stringify(t)} · daily rows written: ${n}`);

  const [groups, members, queendoms, daily, team] = await Promise.all([
    all<Group>((a, b) => db.schema("sia").from("wag_groups").select("group_jid, member_id, subject, is_active").eq("group_kind", "member").not("member_id", "is", null).order("group_jid").range(a, b)),
    all<Member>((a, b) => db.schema("member").from("members").select("id, full_name, queendom_id, membership_status").order("id").range(a, b)),
    all<{ id: string; name: string | null; slug: string }>((a, b) => db.schema("sia").from("queendoms").select("id, name, slug").range(a, b)),
    all<Daily>((a, b) => db.schema("sia").from("client_activity_daily").select("group_jid, day, client_messages, client_reactions, client_senders, last_client_at, last_team_at").gte("day", FROM).lte("day", DAY).order("group_jid").order("day").range(a, b)),
    all<Team>((a, b) => db.schema("sia").from("team_senders").select("jid, reasons, team_until").order("jid").range(a, b)),
  ]);
  const M = new Map(members.map((m) => [m.id, m]));
  const Q = new Map(queendoms.map((q) => [q.id, q.name ?? q.slug]));
  const base = groups.filter((g) => g.is_active);
  const qOf = (g: Group) => Q.get(M.get(g.member_id)?.queendom_id ?? "") ?? "No queendom";
  const memOf = (g: Group) => M.get(g.member_id)?.membership_status ?? "Unknown";
  const byGroup = new Map<string, Daily[]>();
  for (const d of daily) byGroup.set(d.group_jid, [...(byGroup.get(d.group_jid) ?? []), d]);
  const onDay = (g: Group) => (byGroup.get(g.group_jid) ?? []).find((d) => d.day === DAY);
  const active = (g: Group) => (byGroup.get(g.group_jid) ?? []).some((d) => d.client_messages + d.client_reactions > 0);

  // The day's numbers.
  const dayRows = base.map(onDay).filter((d): d is Daily => !!d);
  const dayActive = dayRows.filter((d) => d.client_messages + d.client_reactions > 0);
  const msgs = dayRows.reduce((s, d) => s + d.client_messages, 0), reacts = dayRows.reduce((s, d) => s + d.client_reactions, 0);
  const teamOnly = dayRows.filter((d) => d.client_messages + d.client_reactions === 0 && d.last_team_at).length;
  const act = base.filter(active), sil = base.filter((g) => !active(g));
  const lastWordUs = sil.filter((g) => { const rows = byGroup.get(g.group_jid) ?? []; const lt = rows.map((r) => r.last_team_at).filter(Boolean).sort().pop(); const lc = rows.map((r) => r.last_client_at).filter(Boolean).sort().pop(); return lt && (!lc || lt > lc); }).length;

  const tally = (xs: Group[], key: (g: Group) => string) => { const m = new Map<string, { active: number; silent: number }>(); for (const g of xs) { const k = key(g); const v = m.get(k) ?? { active: 0, silent: 0 }; if (active(g)) v.active++; else v.silent++; m.set(k, v); } return [...m].sort((a, b) => a[0].localeCompare(b[0])); };
  const reasons = new Map<string, number>(); for (const r of team.filter((x) => !x.team_until)) for (const k of r.reasons) reasons.set(k, (reasons.get(k) ?? 0) + 1);

  say("");
  say(`linked member groups: ${groups.length} (${base.length} the watcher is still in; ${groups.length - base.length} left out)`);
  say(`${DAY}: ${dayActive.length} groups where the client's side wrote or reacted · ${msgs} client messages · ${reacts} reactions · ${teamOnly} groups where only our team wrote`);
  say(`as of ${DAY}: Active ${act.length} + Silent ${sil.length} = ${base.length} groups · silent where our team wrote last: ${lastWordUs}`);
  for (const [k, v] of tally(base, qOf)) say(`  ${k.padEnd(14)} active ${String(v.active).padStart(4)} · silent ${String(v.silent).padStart(4)} · total ${v.active + v.silent}`);
  for (const [k, v] of tally(base, memOf)) say(`  ${k.padEnd(14)} active ${String(v.active).padStart(4)} · silent ${String(v.silent).padStart(4)}`);
  say(`team ids now: ${team.filter((x) => !x.team_until).length} · by reason: ${[...reasons].map(([k, v]) => `${k} ${v}`).join(", ")}`);

  // THE CHECK: every sender of the day in a sample of groups, and which side they were put on.
  const T = new Map(team.map((x) => [x.jid, x]));
  const dayMsgs = await all<{ chat_jid: string; sender_jid: string; from_me: boolean; type: string; edit_of_wa_message_id: string | null; wa_timestamp: string }>((a, b) =>
    db.schema("sia").from("wag_messages").select("chat_jid, sender_jid, from_me, type, edit_of_wa_message_id, wa_timestamp").gte("wa_timestamp", istStart(DAY)).lt("wa_timestamp", istStart(addDays(DAY, 1))).order("wa_timestamp").order("id").range(a, b));
  const senderIds = [...new Set(dayMsgs.map((m) => m.sender_jid))];
  const contacts: Contact[] = [];
  for (let i = 0; i < senderIds.length; i += 100) {
    const part = senderIds.slice(i, i + 100);
    const [{ data: x }, { data: y }] = await Promise.all([
      db.schema("sia").from("wag_contacts").select("jid, lid, push_name, member_id").in("jid", part),
      db.schema("sia").from("wag_contacts").select("jid, lid, push_name, member_id").in("lid", part),
    ]);
    contacts.push(...((x ?? []) as Contact[]), ...((y ?? []) as Contact[]));
  }
  const rowsFor = (id: string) => contacts.filter((c) => c.jid === id || c.lid === id);
  const nameOf = (id: string) => rowsFor(id).map((c) => c.push_name).find(Boolean) ?? "(no name)";
  const G = new Map(groups.map((g) => [g.group_jid, g]));
  const sideOf = (m: (typeof dayMsgs)[number]): string => {
    if (["system", "album", "unknown"].includes(m.type) || m.edit_of_wa_message_id) return `not counted (${m.edit_of_wa_message_id ? "edit" : m.type})`;
    if (m.from_me) return "team: our own number";
    const g = G.get(m.chat_jid);
    if (g && rowsFor(m.sender_jid).some((c) => c.member_id === g.member_id)) return "CLIENT: the member's own number";
    const t = T.get(m.sender_jid);
    if (t && (!t.team_until || m.wa_timestamp < t.team_until)) return `team: ${t.reasons.join(" + ")}`;
    return "CLIENT: family / assistant / another number";
  };
  const inBase = new Set(base.map((g) => g.group_jid));
  const counted = dayMsgs.filter((m) => inBase.has(m.chat_jid));
  const picks = dayActive.filter((_, i) => i % Math.max(1, Math.floor(dayActive.length / SAMPLE)) === 0).slice(0, SAMPLE);

  // Client's-side senders who are not the member and wrote in 2+ groups that day.
  const other = new Map<string, Set<string>>();
  for (const m of counted) if (sideOf(m).startsWith("CLIENT: family")) other.set(m.sender_jid, new Set([...(other.get(m.sender_jid) ?? []), m.chat_jid]));
  const suspects = [...other].filter(([, gs]) => gs.size >= 2).sort((a, b) => b[1].size - a[1].size);
  const sideTotals = new Map<string, number>(); for (const m of counted) { const k = sideOf(m).split(":")[0].split(" (")[0]; sideTotals.set(k, (sideTotals.get(k) ?? 0) + 1); }
  say(`${DAY} messages by side: ${[...sideTotals].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  say(`client's-side senders (not the member) who wrote in 2+ groups that day: ${suspects.length}`);

  // The report (names): outside the repo.
  const md: string[] = [`# Activity check · ${DAY}`, "", `Local recount. Active = a client message or reaction ${FROM} … ${DAY}; Silent = none.`, "",
    `- Linked member groups: **${groups.length}** (${base.length} the watcher is still in)`,
    `- ${DAY}: **${dayActive.length}** groups where the client's side wrote or reacted · **${msgs}** client messages · **${reacts}** reactions · ${teamOnly} groups where only our team wrote`,
    `- As of ${DAY}: **Active ${act.length}** + **Silent ${sil.length}** = ${base.length} · silent where our team wrote last: ${lastWordUs}`,
    `- Team ids: ${team.filter((x) => !x.team_until).length} (${[...reasons].map(([k, v]) => `${k} ${v}`).join(", ")})`, "",
    "## By queendom", "", "| Queendom | Active | Silent | Total |", "|---|---|---|---|", ...tally(base, qOf).map(([k, v]) => `| ${k} | ${v.active} | ${v.silent} | ${v.active + v.silent} |`), "",
    "## By membership", "", "| Membership | Active | Silent |", "|---|---|---|", ...tally(base, memOf).map(([k, v]) => `| ${k} | ${v.active} | ${v.silent} |`), "",
    `## Most active on ${DAY}`, "", "| Client | Group | Queendom | Messages | Reactions | People on the client's side |", "|---|---|---|---|---|---|",
    ...dayActive.slice().sort((a, b) => b.client_messages - a.client_messages).slice(0, 15).map((d) => { const g = G.get(d.group_jid)!; return `| ${M.get(g.member_id)?.full_name ?? "?"} | ${g.subject ?? ""} | ${qOf(g)} | ${d.client_messages} | ${d.client_reactions} | ${d.client_senders} |`; }), "",
    "## Check 1: who was put on which side (sample groups)", "",
    ...picks.flatMap((d) => { const g = G.get(d.group_jid)!; const per = new Map<string, { n: number; side: string }>();
      for (const m of counted.filter((x) => x.chat_jid === d.group_jid)) { const k = m.from_me ? "(our own number)" : `${nameOf(m.sender_jid)} · ${m.sender_jid.split("@")[1] === "lid" ? "hidden id" : m.sender_jid.split("@")[0].slice(-4)}`; const v = per.get(k) ?? { n: 0, side: sideOf(m) }; v.n++; per.set(k, v); }
      return [`### ${M.get(g.member_id)?.full_name ?? "?"} · ${g.subject ?? ""} (${qOf(g)})`, "", "| Sender | Messages | Side |", "|---|---|---|", ...[...per].map(([k, v]) => `| ${k} | ${v.n} | ${v.side} |`), ""]; }),
    "## Check 2: counted as the client's side, not the member, in 2+ groups that day", "",
    "These are the likeliest team members the checks missed (no Serene account linked, no tag, no \"Indulge\" in the name).", "",
    "| Name | Groups that day |", "|---|---|", ...suspects.slice(0, 40).map(([id, gs]) => `| ${nameOf(id)} | ${gs.size} |`), "",
    `## Silent (no word ${FROM} … ${DAY}), Active members first`, "", "| Client | Group | Queendom | Membership |", "|---|---|---|---|",
    ...sil.slice().sort((a, b) => (memOf(a) === "Active" ? 0 : 1) - (memOf(b) === "Active" ? 0 : 1)).slice(0, 60).map((g) => `| ${M.get(g.member_id)?.full_name ?? "?"} | ${g.subject ?? ""} | ${qOf(g)} | ${memOf(g)} |`),
  ];
  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `activity-check-${DAY}.md`);
  writeFileSync(file, md.join("\n")); say(`report: ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
