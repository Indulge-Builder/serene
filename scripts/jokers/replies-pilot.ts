/**
 * replies-pilot.ts — run the jokers' threads-and-replies step over real past chat and say how it did.
 * It reads the openings step 1 recorded, so run it where they exist (the local database after
 * capture-pilot --apply).
 *
 *   DRY RUN (default): judges and reports, writes NOTHING.
 *     npx tsx --env-file=.env.local scripts/jokers/replies-pilot.ts --since 2026-08-24 \
 *       --sheet-dir <folder with group1.csv … group5.csv> [--calls 200] [--apply]
 *
 *   --calls N  model calls (reading the member's words). Default 0: only what needs no model
 *              (emoji, and follow-ups tied to their thread) is judged.
 *   --apply    write the threads, replies and outcomes. LOCAL DATABASE ONLY.
 *   --fresh    (dry run) ignore every earlier reading and judge the window again from scratch.
 *   --lilian   only the groups Lilian writes in (her sheet is the check).
 *   --compare-json <file>  write every sheet item in the window beside what we read (for the side-by-side page).
 *   --yes-chats  only the groups of the items she marked "Yes" in the window (needs --sheet-dir);
 *              the report then shows, for each one we call Not replied, what was read in that chat.
 *
 * With --sheet-dir it compares each item Lilian logged with the outcome we give it: her "Yes"
 * means the member responded (not that they were interested), so the check is Yes ↔ replied.
 * The report quotes members' words and is written OUTSIDE the repo (~/Desktop/serene-backups).
 */
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { runJokerReplySweep, type ReplyJudgement } from "@/lib/services/joker-replies";
import { stripGreeting } from "@/lib/services/joker-capture-rules";
import { LILIAN, groupsForClients, matchItems, readSheet } from "./sheet";

const arg = (name: string): string | null => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] ?? null; };
const SINCE = arg("--since") ?? "2026-08-24";
const UNTIL = arg("--until");
const CALLS = Math.max(0, Number(arg("--calls") ?? 0) || 0);
const SHEET_DIR = arg("--sheet-dir");
const APPLY = process.argv.includes("--apply");
const FRESH = process.argv.includes("--fresh");
const LILIAN_ONLY = process.argv.includes("--lilian");
const YES_CHATS = process.argv.includes("--yes-chats");
const COMPARE_JSON = arg("--compare-json");

const host = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname; } catch { return ""; } })();
if (APPLY && !["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING --apply: "${host}" is not a local database.`);
  process.exit(1);
}
const say = (s: string) => console.log(`[replies-pilot] ${s}`);
const clip = (t: string, n = 110) => t.replace(/\s+/g, " ").slice(0, n);
const count = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };

(async () => {
  const since = new Date(`${SINCE}T00:00:00+05:30`).toISOString();
  const until = UNTIL ? new Date(`${UNTIL}T00:00:00+05:30`).toISOString() : undefined;
  say(`${APPLY ? "APPLY (local)" : "dry run, nothing written"} · ${host} · from ${SINCE} · model calls ${CALLS}`);
  const t0 = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient().schema("sia") as unknown as { from: (t: string) => any };
  let onlyChats: string[] | undefined;
  if (LILIAN_ONLY) {
    const mine: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("joker_openings").select("chat_jid").eq("joker_phone", LILIAN).order("id").range(from, from + 999);
      const rows = (data ?? []) as { chat_jid: string }[]; mine.push(...rows.map((x) => x.chat_jid));
      if (rows.length < 1000) break;
    }
    onlyChats = [...new Set(mine)];
    say(`only Lilian's ${onlyChats.length} groups (Active and Expired)`);
  }
  if (YES_CHATS && SHEET_DIR) {
    const { items } = readSheet(SHEET_DIR);
    const groupsOf = await groupsForClients(items.map((i) => i.client));
    const { data: ops } = await db.from("joker_openings").select("id, chat_jid, sent_at, template_key").eq("joker_phone", LILIAN).gte("sent_at", since).limit(1000);
    const byChat = new Map<string, { id: string; chat_jid: string; at: number; text: string }[]>();
    const tk = new Map<string, string>();
    const keys = [...new Set(((ops ?? []) as { template_key: string }[]).map((o) => o.template_key))];
    for (let i = 0; i < keys.length; i += 150) { const { data } = await db.from("joker_texts").select("template_key, body").in("template_key", keys.slice(i, i + 150)); for (const t of (data ?? []) as { template_key: string; body: string }[]) tk.set(t.template_key, t.body); }
    for (const o of (ops ?? []) as { id: string; chat_jid: string; sent_at: string; template_key: string }[]) byChat.set(o.chat_jid, [...(byChat.get(o.chat_jid) ?? []), { id: o.id, chat_jid: o.chat_jid, at: new Date(o.sent_at).getTime(), text: tk.get(o.template_key) ?? "" }]);
    const yes = items.filter((i) => i.yes && i.date >= new Date(since).getTime() && (!until || i.date < new Date(until).getTime()));
    onlyChats = [...new Set(matchItems(yes, groupsOf, byChat).filter((x) => x.hit).map((x) => x.hit!.chat_jid))];
    say(`only the ${onlyChats.length} groups of her "Yes" items in the window`);
  }
  const r = await runJokerReplySweep({ apply: APPLY, since, until, maxCalls: CALLS, onProgress: say, onlyChats, fresh: FRESH || undefined });
  say(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
  const days = ((until ? new Date(until).getTime() : Date.now()) - new Date(since).getTime()) / 86_400_000;
  const perCall = r.calls.made ? r.calls.cost_usd / r.calls.made : null;
  say(`READINGS: ${r.wanted} in ${days.toFixed(1)} days = ${(r.wanted / days).toFixed(0)} a day${perCall ? ` · at $${perCall.toFixed(5)} each ≈ $${((r.wanted / days) * 30 * perCall).toFixed(2)} a month for these groups` : ""}`);

  const md: string[] = [`# Jokers' replies pilot`, ``, `${APPLY ? "Applied to the LOCAL database." : "Dry run: nothing was written."} From ${SINCE}. ${r.openings} openings in ${r.chats} chats.`, ``];
  const linked = r.links.filter((l) => l.opening_id).length;
  say(`follow-ups: ${r.links.length} looked at, ${linked} tied to an opening`);
  md.push(`## Follow-ups tied to their opening: ${linked} of ${r.links.length}`, ``, ...count(r.links, (l) => l.reason).map(([x, n]) => `- ${n} × ${x}`), ``);

  const counted = r.judged.filter((j) => j.opening_id && j.counted && !j.withdrawn_at);
  say(`member signals judged: ${r.judged.length} · counted replies ${counted.length} · by tier ${JSON.stringify(Object.fromEntries(count(counted, (j) => j.tier)))} · stance ${JSON.stringify(Object.fromEntries(count(counted, (j) => j.stance ?? "-")))}`);
  md.push(`## Member signals judged: ${r.judged.length}`, ``, `| Tier | Stance | Counted | n |`, `|---|---|---|---|`,
    ...count(r.judged, (j) => `${j.tier}|${j.stance ?? "-"}|${j.counted && j.opening_id ? "yes" : "no"}`).map(([x, n]) => `| ${x.split("|").join(" | ")} | ${n} |`), ``);
  const statusCounts = count(r.outcomes, (o) => o.reply_status);
  say(`outcomes set this run: ${JSON.stringify(Object.fromEntries(statusCounts))}`);
  if (r.calls.made || r.calls.reused) say(`model: ${r.calls.made} calls · ${r.calls.reused} earlier readings reused (free) · ${r.calls.failed} failed · $${r.calls.cost_usd.toFixed(4)}${r.calls.made ? ` (≈ $${(r.calls.cost_usd / r.calls.made).toFixed(4)} a call)` : ""}`);
  md.push(`## Outcomes set: ${JSON.stringify(Object.fromEntries(statusCounts))}`, ``, `Model: ${r.calls.made} calls, ${r.calls.failed} failed, $${r.calls.cost_usd.toFixed(4)}.`, ``);

  // Against Lilian's sheet: her "Yes" = the member responded.
  if (SHEET_DIR) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sia = createAdminClient().schema("sia") as unknown as { from: (t: string) => any };
    const { items } = readSheet(SHEET_DIR);
    const groupsOf = await groupsForClients(items.map((i) => i.client));
    const { data: ops } = await sia.from("joker_openings").select("id, chat_jid, sent_at, template_key, reply_status").eq("joker_phone", LILIAN).gte("sent_at", since).limit(5000);
    const openings = (ops ?? []) as unknown as { id: string; chat_jid: string; sent_at: string; template_key: string; reply_status: string }[];
    const bodies = new Map<string, string>();
    const keys = [...new Set(openings.map((o) => o.template_key))];
    for (let i = 0; i < keys.length; i += 150) {
      const { data } = await sia.from("joker_texts").select("template_key, body").in("template_key", keys.slice(i, i + 150));
      for (const t of (data ?? []) as unknown as { template_key: string; body: string }[]) bodies.set(t.template_key, t.body);
    }
    const outcome = new Map(r.outcomes.map((o) => [o.opening_id, o.reply_status]));
    // The title of every item a reading was tied to, for the misses list.
    const titleOf = new Map<string, string>();
    const tied = [...new Set(r.judged.map((j) => j.opening_id).filter((x): x is string => !!x))];
    for (let i = 0; i < tied.length; i += 150) {
      const { data: od } = await sia.from("joker_openings").select("id, template_key").in("id", tied.slice(i, i + 150));
      const ok = (od ?? []) as { id: string; template_key: string }[];
      const { data: td } = await sia.from("joker_texts").select("template_key, title").in("template_key", [...new Set(ok.map((o) => o.template_key))]);
      const t = new Map(((td ?? []) as { template_key: string; title: string | null }[]).map((x) => [x.template_key, x.title ?? "?"]));
      for (const o of ok) titleOf.set(o.id, clip(t.get(o.template_key) ?? "?", 40));
    }
    // A fresh run knows only what it judged itself: an item it did not touch is Not replied.
    const cands = openings.map((o) => ({ id: o.id, chat_jid: o.chat_jid, at: new Date(o.sent_at).getTime(), text: bodies.get(o.template_key) ?? "", status: APPLY ? o.reply_status : outcome.get(o.id) ?? (FRESH ? "not_replied" : o.reply_status) }));
    const byChat = new Map<string, typeof cands>();
    for (const c of cands) byChat.set(c.chat_jid, [...(byChat.get(c.chat_jid) ?? []), c]);
    const replied = (s: string) => s !== "not_replied";
    const matched = matchItems(items.filter((i) => i.date >= new Date(since).getTime() && (!until || i.date < new Date(until).getTime())), groupsOf, byChat);
    const res = matched.filter((x) => x.hit);
    if (COMPARE_JSON) {
      const chatsOf = [...new Set(res.map((x) => x.hit!.chat_jid))];
      const subject = new Map<string, string>();
      for (let i = 0; i < chatsOf.length; i += 150) { const { data } = await sia.from("wag_groups").select("group_jid, subject").in("group_jid", chatsOf.slice(i, i + 150)); for (const g of (data ?? []) as { group_jid: string; subject: string | null }[]) subject.set(g.group_jid, g.subject ?? ""); }
      const rows = matched.map((x) => {
        const h = x.hit;
        const replies = h ? r.judged.filter((j) => j.opening_id === h.id && j.counted && !j.withdrawn_at).sort((a, b) => a.sent_at.localeCompare(b.sent_at))
          .map((j) => ({ at: j.sent_at, source: j.source, tier: j.tier, stance: j.stance, text: j.source === "reaction" ? j.emoji ?? "" : clip(j.text, 240), reason: clip(j.reason, 160) })) : [];
        const other = h && !replied(h.status) ? r.judged.filter((j) => j.chat_jid === h.chat_jid && j.source === "message" && new Date(j.sent_at).getTime() >= h.at && j.decided_by !== "pending")
          .slice(0, 5).map((j) => ({ at: j.sent_at, answered: j.opening_id ? titleOf.get(j.opening_id) ?? "another item" : null, text: clip(j.text, 160) })) : [];
        return { client: x.item.client, sheet_date: new Date(x.item.date).toISOString(), type: x.item.type, label: x.item.label, sheet_yes: x.item.yes,
          no_group: x.noGroup, chat_jid: h?.chat_jid ?? null, group: h ? subject.get(h.chat_jid) ?? "" : null, sent_at: h ? new Date(h.at).toISOString() : null,
          item_text: h ? clip(stripGreeting(h.text), 200) : null, ours: h?.status ?? null, replies, other };
      });
      writeFileSync(COMPARE_JSON, JSON.stringify({ since: SINCE, until: UNTIL, rows }, null, 1));
      say(`compare rows written: ${rows.length} → ${COMPARE_JSON}`);
    }
    const cell = (yes: boolean, ours: boolean) => res.filter((x) => x.item.yes === yes && replied(x.hit!.status) === ours).length;
    const yesN = res.filter((x) => x.item.yes).length; const blankN = res.length - yesN;
    say(`SHEET: ${res.length} of her items matched to an opening · "Yes" ${yesN}: we say replied ${cell(true, true)}, not replied ${cell(true, false)} · blank ${blankN}: we say replied ${cell(false, true)}, not replied ${cell(false, false)}`);
    const yesStatus = count(res.filter((x) => x.item.yes), (x) => x.hit!.status);
    say(`SHEET: our outcome on her "Yes" items: ${JSON.stringify(Object.fromEntries(yesStatus))}`);
    md.push(`## Against Lilian's sheet (her "Yes" = the member responded)`, ``,
      `| Sheet | We say replied | We say not replied |`, `|---|---|---|`,
      `| Yes (${yesN}) | ${cell(true, true)} | ${cell(true, false)} |`, `| blank (${blankN}) | ${cell(false, true)} | ${cell(false, false)} |`, ``,
      `Our outcome on her "Yes" items: ${JSON.stringify(Object.fromEntries(yesStatus))}`, ``,
      `### Her "Yes", we say not replied (a call or DM, or a reply we missed)`, ``,
      ...res.filter((x) => x.item.yes && !replied(x.hit!.status)).slice(0, 40).flatMap((x) => [`- ${x.item.label} (${x.item.type}) — "${clip(stripGreeting(x.hit!.text), 80)}"`,
        ...r.judged.filter((j) => j.chat_jid === x.hit!.chat_jid && j.source === "message" && new Date(j.sent_at).getTime() >= x.hit!.at)
          .map((j) => `    - ${j.sent_at.slice(5, 16)} ${j.tier} → ${j.opening_id ? titleOf.get(j.opening_id) ?? "?" : "no item"} ${j.stance ?? ""} [${j.decided_by}] "${clip(j.text, 90)}"`)]),
      ``, `### Blank on her sheet, we say replied`, ``,
      ...res.filter((x) => !x.item.yes && replied(x.hit!.status)).slice(0, 40).map((x) => `- ${x.item.label} → ${x.hit!.status}`), ``);
  }

  // How long after the item each counted reply came (the owner's two-week question).
  const openIds = [...new Set(counted.map((j) => j.opening_id!))];
  const sentAt = new Map<string, number>();
  for (let i = 0; i < openIds.length; i += 150) {
    const { data } = await db.from("joker_openings").select("id, sent_at").in("id", openIds.slice(i, i + 150));
    for (const o of (data ?? []) as { id: string; sent_at: string }[]) sentAt.set(o.id, new Date(o.sent_at).getTime());
  }
  const ageH = (j: ReplyJudgement) => (new Date(j.sent_at).getTime() - (sentAt.get(j.opening_id!) ?? 0)) / 3_600_000;
  const band = (h: number) => (h < 1 ? "under 1 hour" : h < 24 ? "1-24 hours" : h < 72 ? "1-3 days" : h < 168 ? "3-7 days" : "over 7 days");
  const late = counted.filter((j) => j.source === "message" && ageH(j) >= 24);
  say(`AFTER THE ITEM: ${JSON.stringify(Object.fromEntries(count(counted.filter((j) => j.source === "message"), (j) => band(ageH(j)))))} (messages; emoji not counted here)`);
  md.push(`## How long after the item each typed or quoted reply came`, ``, ...count(counted.filter((j) => j.source === "message"), (j) => band(ageH(j))).map(([x, n]) => `- ${x}: ${n}`), ``);

  // Samples to read by eye.
  const show = (xs: ReplyJudgement[], n: number) => xs.slice(0, n).map((j) => `- ${j.tier} · ${j.stance ?? "-"}${j.counted ? "" : " (not counted)"} · ${j.reason} — "${clip(j.source === "reaction" ? `(${j.emoji})` : j.text)}"`);
  md.push(`## Replies to read`, ``, `### Counted, Not interested`, ``, ...show(counted.filter((j) => j.stance === "not_interested"), 40),
    ``, `### Counted, Interested`, ``, ...show(counted.filter((j) => j.stance === "interested"), 40),
    ``, `### Read, answers no opening`, ``, ...show(r.judged.filter((j) => j.decided_by === "model" && !j.opening_id), 40),
    ``, `### Typed, a day or more after the item it answers`, ``, ...show(late, 60), ``);
  if (r.errors.length) md.push(`Errors: ${[...new Set(r.errors)].slice(0, 10).join(" · ")}`, ``);

  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `joker-replies-pilot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  writeFileSync(file, md.join("\n")); say(`report: ${file}`);
})().catch((e) => { console.error(e); process.exit(1); });
