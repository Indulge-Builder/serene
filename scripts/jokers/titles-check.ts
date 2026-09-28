/**
 * titles-check.ts — one item, one title (owner, 2026-09-28): replays every recommendation text the
 * capture labelled, oldest first, through the title rules (sameItemTitle) and, where the words alone
 * cannot tell, the label call's same_as over the recent titles its words touch. Then it counts the
 * items that still sit under two titles, before and after, with a check independent of the rules.
 * A DRY RUN: the label call writes nothing. Local database.
 *
 *   npx tsx --env-file=.env.local scripts/jokers/titles-check.ts [--model] [--calls 200]
 *
 * Without --model only the free word rules run. The report goes OUTSIDE the repo (~/Desktop/serene-backups).
 */
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBroadSenders, openVault } from "@/lib/services/member-profiler";
import { callLabel, groupsFor, pageAll } from "@/lib/services/joker-capture";
import { cleanTitle, sameItemTitle, titleShortlist } from "@/lib/services/joker-capture-rules";
import { JOKER_COST_PER_MTOK, JOKER_TITLE_REUSE_DAYS, JOKER_TITLE_SHORTLIST } from "@/lib/constants/joker-engagement";

const MODEL = process.argv.includes("--model");
const CALLS = Number(process.argv[process.argv.indexOf("--calls") + 1]) || 200;
if (!/localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) { console.error("Local database only."); process.exit(1); }
const say = (s: string) => console.log(`[titles-check] ${s}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sia = createAdminClient().schema("sia") as unknown as { from: (t: string) => any };
const DAY = 86_400_000;

type Text = { template_key: string; title: string; body: string; first_seen_at: string; sample_chat_jid: string; sample_wa_message_id: string };

/** An independent duplicate check (not the rules): titles whose words mostly overlap, grouped. */
function clusters(titles: Map<string, number>): string[][] {
  const STOP = new Set("the a an of for to in on at by with and we we've weve got your you our is are this new from live 2026 edition".split(" "));
  const words = (t: string) => new Set(t.toLowerCase().replace(/[’']/g, "'").replace(/[^\w ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
  const list = [...titles.keys()]; const used = new Set<number>(); const out: string[][] = [];
  list.forEach((a, i) => { if (used.has(i)) return; const g = [a]; const wa = words(a);
    list.forEach((b, j) => { if (j <= i || used.has(j)) return; const wb = words(b); if (!wa.size || !wb.size) return;
      const inter = [...wa].filter((w) => wb.has(w)).length, small = Math.min(wa.size, wb.size);
      if ((inter / small >= 0.75 && inter >= 2) || (small === 1 && inter === 1 && Math.max(wa.size, wb.size) <= 3)) { g.push(b); used.add(j); } });
    if (g.length > 1) out.push(g); });
  return out;
}

(async () => {
  const texts = await pageAll<Text>((a, b) => sia.from("joker_texts").select("template_key, title, body, first_seen_at, sample_chat_jid, sample_wa_message_id")
    .eq("kind", "recommendation").eq("label_state", "labelled").order("first_seen_at", { ascending: true }).order("template_key", { ascending: true }).range(a, b));
  const ops = await pageAll<{ template_key: string }>((a, b) => sia.from("joker_openings").select("template_key").order("id").range(a, b));
  const sends = new Map<string, number>(); for (const o of ops) sends.set(o.template_key, (sends.get(o.template_key) ?? 0) + 1);
  say(`${texts.length} recommendation texts, ${ops.length} openings`);

  const groups = MODEL ? await groupsFor([...new Set(texts.map((t) => t.sample_chat_jid))]) : new Map();
  const broad = MODEL ? await getBroadSenders() : new Set<string>();
  const recent: { title: string; at: number }[] = [];
  const merges: string[] = [];
  let calls = 0, cost = 0, byRule = 0, byModel = 0;
  const before = new Map<string, number>(), after = new Map<string, number>();

  for (const t of texts) {
    const at = new Date(t.first_seen_at).getTime();
    const n = sends.get(t.template_key) ?? 0;
    before.set(t.title, (before.get(t.title) ?? 0) + n);
    const window = recent.filter((r) => r.at >= at - JOKER_TITLE_REUSE_DAYS * DAY).map((r) => r.title);
    const cand = cleanTitle(t.title) || t.title;
    let title = sameItemTitle(cand, window);
    if (title && title !== t.title) { byRule++; merges.push(`rule   · "${t.title}" → "${title}" (${n} sends)`); }
    if (!title && MODEL && calls < CALLS) {
      const short = titleShortlist(t.body, window, JOKER_TITLE_SHORTLIST);
      const g = groups.get(t.sample_chat_jid);
      if (short.length && g?.member_id) {
        const vault = await openVault(t.sample_chat_jid, g.member_id, [], broad, { persist: false });
        if (vault) {
          const o = await callLabel({ chat_jid: t.sample_chat_jid, wa_message_id: t.sample_wa_message_id, text: t.body, template_key: t.template_key, member_id: g.member_id }, vault, null, false, short);
          calls++;
          if (o.tokens) cost += (o.tokens.in * JOKER_COST_PER_MTOK.input + o.tokens.out * JOKER_COST_PER_MTOK.output) / 1e6;
          if (o.ok && o.reused) { title = o.title; byModel++; merges.push(`model  · "${t.title}" → "${title}" (${n} sends)`); }
        }
      }
    }
    title = title ?? cand;
    after.set(title, (after.get(title) ?? 0) + n);
    const i = recent.findIndex((r) => r.title === title); if (i >= 0) recent.splice(i, 1);
    recent.unshift({ title, at });
  }

  const show = (m: Map<string, number>) => { const c = clusters(m); const minority = c.reduce((s, g) => s + g.reduce((x, t) => x + (m.get(t) ?? 0), 0) - Math.max(...g.map((t) => m.get(t) ?? 0)), 0); return { c, minority }; };
  const b = show(before), a = show(after);
  say(`BEFORE: ${before.size} titles · ${b.c.length} items under 2+ titles · ${b.minority} sends under a minority title`);
  say(`AFTER:  ${after.size} titles · ${a.c.length} items under 2+ titles · ${a.minority} sends under a minority title`);
  say(`merged: ${byRule} by the word rules, ${byModel} by the label call${MODEL ? ` (${calls} calls, $${cost.toFixed(3)})` : ""}`);
  const lines = [`# One item, one title: replay of the month`, ``, `Before: ${before.size} titles, ${b.c.length} items under 2+ titles (${b.minority} sends). After: ${after.size} titles, ${a.c.length} (${a.minority} sends).`, ``,
    `## Merged`, ``, ...merges.map((m) => `- ${m}`), ``, `## Still under 2+ titles`, ``, ...a.c.map((g) => `- ${g.map((t) => `${t} (${after.get(t)})`).join(" | ")}`), ``];
  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `joker-titles-check-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  writeFileSync(file, lines.join("\n")); say(`report: ${file}`);
})().catch((e) => { console.error(e); process.exit(1); });
