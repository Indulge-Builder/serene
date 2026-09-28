/**
 * capture-pilot.ts — run the jokers' capture over real past chat and say how it did.
 *
 *   DRY RUN (the default): reads the mirror, decides every joker message, writes NOTHING anywhere.
 *   Safe against the live mirror:
 *     npx tsx --env-file=.env.local.prod-backup scripts/jokers/capture-pilot.ts \
 *       --since 2026-08-24 --sheet-dir <folder with group1.csv … group5.csv> [--label 50]
 *
 *   --label N   make up to N real model calls (title, category, kind) to see them and their cost.
 *               Nothing is recorded, not even the run ledger. Default 0: rules only, no spend.
 *   --apply     write the decisions (the back-fill). LOCAL DATABASE ONLY: refuses any other host.
 *
 * With --sheet-dir it checks the result against Lilian's Google Sheet (her book: the "Group 1..5"
 * tabs as CSV): every item she logged that we can find in WhatsApp should be an opening.
 *
 * The report quotes messages (greeting lines cut) and is written OUTSIDE the repo
 * (~/Desktop/serene-backups), never committed. The console prints numbers only.
 */
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { runJokerCaptureSweep, type CaptureDecision } from "@/lib/services/joker-capture";
import { stripGreeting } from "@/lib/services/joker-capture-rules";
import { IST, LILIAN, groupsForClients, matchItems, readSheet } from "./sheet";

const arg = (name: string): string | null => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] ?? null; };
const SINCE = arg("--since") ?? "2026-08-24";
const UNTIL = arg("--until");
const LABELS = Math.max(0, Number(arg("--label") ?? 0) || 0);
const SHEET_DIR = arg("--sheet-dir");
const APPLY = process.argv.includes("--apply");

const host = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname; } catch { return ""; } })();
if (APPLY && !["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING --apply: "${host}" is not a local database. The pilot writes only to a local one; production is written by the switched-on job.`);
  process.exit(1);
}

const say = (s: string) => console.log(`[joker-pilot] ${s}`);
const snippet = (t: string, n = 90) => stripGreeting(t).replace(/\s+/g, " ").slice(0, n);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// ─── The run ─────────────────────────────────────────────────────────────────

(async () => {
  const since = new Date(`${SINCE}T00:00:00+05:30`).toISOString();
  const until = UNTIL ? new Date(`${UNTIL}T00:00:00+05:30`).toISOString() : undefined;
  say(`${APPLY ? "APPLY (local)" : "dry run, nothing written"} · ${host} · from ${SINCE}${UNTIL ? ` to ${UNTIL}` : ""} · model calls ${LABELS}`);
  const started = Date.now();
  const r = await runJokerCaptureSweep({ apply: APPLY, since, until, maxLabels: LABELS, onProgress: say });
  say(`done in ${Math.round((Date.now() - started) / 1000)}s · ${r.jokerIds} joker ids · ${r.fetched} messages in member groups · ${r.decided} decided`);

  const ds = r.decisions;
  const md: string[] = [`# Jokers' capture pilot`, ``, `${APPLY ? "Applied to the LOCAL database." : "Dry run: nothing was written anywhere."} From ${SINCE}${UNTIL ? ` to ${UNTIL}` : ""}. Rules ${"joker-rules-v1"}.`, ``];

  // Per joker.
  md.push(`## Per joker`, ``, `| Joker | Openings | per day (median) | Follow-ups | Pieces | Undecided (model) | Unlinked group |`, `|---|---|---|---|---|---|---|`);
  const jokersSeen = [...new Set(ds.map((d) => d.joker_name))].sort();
  for (const j of jokersSeen) {
    const mine = ds.filter((d) => d.joker_name === j);
    const open = mine.filter((d) => d.decision === "opening");
    const perDay = new Map<string, number>();
    for (const o of open) { const day = new Date(new Date(o.sent_at).getTime() + IST).toISOString().slice(0, 10); perDay.set(day, (perDay.get(day) ?? 0) + 1); }
    const days = Math.max(1, Math.round(((until ? new Date(until).getTime() : Date.now()) - new Date(since).getTime()) / 86_400_000));
    const counts = [...Array(days)].map((_, i) => perDay.get(new Date(new Date(since).getTime() + i * 86_400_000 + IST).toISOString().slice(0, 10)) ?? 0);
    const c = (x: string) => mine.filter((d) => d.decision === x).length;
    md.push(`| ${j} | ${open.length} | ${median(counts)} | ${c("follow_up")} | ${c("piece")} | ${c("undecided")} | ${c("unlinked")} |`);
    say(`${j.padEnd(20)} openings ${String(open.length).padStart(5)} · median/day ${median(counts)} · follow-ups ${c("follow_up")} · pieces ${c("piece")} · undecided ${c("undecided")} · unlinked ${c("unlinked")}`);
  }
  const reasons = new Map<string, number>();
  for (const d of ds) reasons.set(`${d.decision}: ${d.reason.replace(/\d+ chats/, "N chats")}`, (reasons.get(`${d.decision}: ${d.reason.replace(/\d+ chats/, "N chats")}`) ?? 0) + 1);
  md.push(``, `## Why`, ``, ...[...reasons].sort((a, b) => b[1] - a[1]).map(([x, n]) => `- ${n} × ${x}`), ``);
  const broadcast = ds.filter((d) => d.decision === "opening" && d.reach >= 3).length;
  say(`openings ${r.openings} (broadcast ${broadcast}, personal ${r.openings - broadcast}) · undecided ${r.undecided} would go to the model`);

  // Against Lilian's sheet.
  if (SHEET_DIR) {
    const { items, dropped } = readSheet(SHEET_DIR);
    const groupsOf = await groupsForClients(items.map((i) => i.client));
    const lil = ds.filter((d) => d.joker_phone === LILIAN && d.decision !== "piece");
    type Cand = CaptureDecision & { at: number };
    const byChat = new Map<string, Cand[]>();
    for (const d of lil) byChat.set(d.chat_jid, [...(byChat.get(d.chat_jid) ?? []), { ...d, at: new Date(d.sent_at).getTime() }]);
    const inWindow = items.filter((i) => i.date >= new Date(since).getTime() - 36 * 3600_000 && (!until || i.date <= new Date(until).getTime()));
    const matchedAll = matchItems(inWindow, groupsOf, byChat, (c) => c.decision === "opening");
    const noGroup = matchedAll.filter((x) => x.noGroup).length;
    const res = matchedAll.filter((x) => !x.noGroup);
    const found = res.filter((x) => x.hit);
    const asOpening = found.filter((x) => x.hit!.decision === "opening");
    const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
    say(`SHEET: ${items.length} items (${dropped} misaligned cells skipped) · ${inWindow.length} in the window · ${noGroup} with no linked group · found in WhatsApp ${found.length} · of those OPENING ${asOpening.length} (${pct(asOpening.length, found.length)})`);
    md.push(`## Against Lilian's sheet`, ``,
      `${items.length} items logged (${dropped} misaligned cells skipped); ${inWindow.length} in the window; ${noGroup} for clients with no linked group.`, ``,
      `Found in WhatsApp (her message within 36 hours, half the item's words in it): **${found.length}**. Of those, decided as an opening: **${asOpening.length} (${pct(asOpening.length, found.length)})**.`, ``,
      `| Sheet type | Found | Opening |`, `|---|---|---|`);
    const types = [...new Set(found.map((x) => x.item.type))].sort();
    for (const t of types) { const f = found.filter((x) => x.item.type === t); md.push(`| ${t} | ${f.length} | ${f.filter((x) => x.hit!.decision === "opening").length} |`); }
    md.push(``, `### Found but not an opening`, ``);
    for (const x of found.filter((y) => y.hit!.decision !== "opening")) md.push(`- **${x.item.label}** (${x.item.type}) → ${x.hit!.decision}: ${x.hit!.reason} — "${snippet(x.hit!.text)}"`);
    // Her openings in these clients' groups that the sheet never logged.
    const sheetChats = new Set([...groupsOf.values()].flat());
    const matched = new Set(found.map((x) => x.hit!.wa_message_id));
    const extras = lil.filter((d) => d.decision === "opening" && sheetChats.has(d.chat_jid) && !matched.has(d.wa_message_id));
    say(`SHEET: Lilian's openings in the sheet clients' groups that the sheet never logged: ${extras.length}`);
    md.push(``, `### Her openings the sheet never logged: ${extras.length}`, ``, ...extras.slice(0, 60).map((d) => `- ${d.sent_at.slice(0, 10)} · ${d.reason} — "${snippet(d.text)}"`), ``);
  }

  // The model calls, if any.
  if (r.calls.made) {
    say(`model: ${r.calls.made} calls · ${r.calls.failed} failed · ${r.calls.tokens_in} tokens in / ${r.calls.tokens_out} out · $${r.calls.cost_usd.toFixed(4)} (≈ $${(r.calls.cost_usd / r.calls.made).toFixed(4)} a call)`);
    md.push(`## Labels (${r.calls.made} calls, $${r.calls.cost_usd.toFixed(4)})`, ``, `| Kind | Category | Title |`, `|---|---|---|`, ...r.labels.map((l) => `| ${l.kind} | ${l.category ?? "-"} | ${l.title.replace(/\|/g, "/")} |`), ``);
    const modelDecided = ds.filter((d) => d.decided_by === "model");
    if (modelDecided.length) md.push(`### Decided by the model`, ``, ...modelDecided.map((d) => `- ${d.decision} · ${d.reason} — "${snippet(d.text)}"`), ``);
    if (r.errors.length) md.push(`Errors: ${[...new Set(r.errors)].slice(0, 10).join(" · ")}`, ``);
  }

  // A sample of openings and of follow-ups, to read by eye.
  const sample = (xs: CaptureDecision[], n: number) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);
  md.push(`## A sample to read`, ``, `### Openings`, ``, ...sample(ds.filter((d) => d.decision === "opening" && d.reach < 3), 40).map((d) => `- ${d.joker_name} · ${d.reason} — "${snippet(d.text)}"`),
    ``, `### Follow-ups`, ``, ...sample(ds.filter((d) => d.decision === "follow_up"), 40).map((d) => `- ${d.joker_name} · ${d.reason} — "${snippet(d.text)}"`),
    ``, `### Undecided (would go to the model)`, ``, ...sample(ds.filter((d) => d.decision === "undecided"), 40).map((d) => `- ${d.joker_name} · ${d.reason} — "${snippet(d.text)}"`), ``);

  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `joker-capture-pilot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  writeFileSync(file, md.join("\n")); say(`report: ${file}`);
})().catch((e) => { console.error(e); process.exit(1); });
