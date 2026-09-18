/**
 * intake-pilot.ts — a DRY RUN of the ticket intake sweep over recent real chat. Nothing is
 * proposed, no bookmark moves. It answers "would these cards have been right?" before the
 * switch is on, and after any change to the prompt or the numbers.
 *
 *   npx tsx --env-file=.env.local scripts/tickets/intake-pilot.ts --hours 8 --groups 25 --bursts 60
 *
 * The report holds real names and messages, so it is written OUTSIDE the repo
 * (~/Desktop/serene-backups), never committed.
 */
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { runIntakeSweep, type BurstOutcome } from "@/lib/services/ticket-intake";

const num = (name: string, dflt: number) => { const i = process.argv.indexOf(name); const v = i === -1 ? NaN : Number(process.argv[i + 1]); return Number.isFinite(v) && v > 0 ? v : dflt; };
const HOURS = num("--hours", 8), GROUPS = num("--groups", 25), BURSTS = num("--bursts", 60);

(async () => {
  const since = new Date(Date.now() - HOURS * 3600_000).toISOString();
  console.log(`[intake-pilot] dry run · last ${HOURS}h · up to ${GROUPS} groups, ${BURSTS} model reads`);
  const started = Date.now();
  const { groups, outcomes } = await runIntakeSweep({
    apply: false, since, maxGroups: GROUPS, maxBursts: BURSTS,
    onBurst: (o: BurstOutcome) => console.log(`[intake-pilot] ${o.status.padEnd(8)} ${(o.verdict?.kind ?? o.why ?? o.error ?? "").padEnd(22)} ${o.verdict ? o.verdict.confidence.toFixed(2) : "    "}  ${o.member_name.slice(0, 26).padEnd(26)} msgs=${String(o.messages).padStart(2)}`),
  });
  const by = (f: (o: BurstOutcome) => boolean) => outcomes.filter(f).length;
  const kinds: Record<string, number> = {};
  for (const o of outcomes) if (o.verdict) kinds[o.verdict.kind] = (kinds[o.verdict.kind] ?? 0) + 1;
  const line = `${groups} groups · ${outcomes.length} bursts · settled without a model ${by((o) => o.status === "skipped")} · read ${by((o) => o.status === "read" || o.status === "proposed")} · would propose ${by((o) => o.status === "proposed")} · failed ${by((o) => o.status === "failed")} · ${Math.round((Date.now() - started) / 1000)}s`;
  console.log(`[intake-pilot] ${line}`); console.log("[intake-pilot] kinds:", kinds);

  const md = [`# Ticket intake pilot — dry run`, ``, `Nothing below was proposed to anyone. Last ${HOURS} hours.`, ``, line, ``, `Kinds: ${JSON.stringify(kinds)}`, ``];
  for (const o of outcomes.filter((x) => x.verdict)) {
    md.push(`### ${o.member_name} · ${o.from_at.slice(0, 16).replace("T", " ")} · ${o.status}`, ``, `**${o.verdict!.kind}** at ${o.verdict!.confidence.toFixed(2)} · tone ${o.verdict!.tone}${o.verdict!.more_requests ? " · more than one request" : ""}${o.verdict!.ticket_no ? ` · ticket ${o.verdict!.ticket_no}` : ""}  `, `${o.verdict!.summary}`, ``);
  }
  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `intake-pilot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  writeFileSync(file, md.join("\n")); console.log(`[intake-pilot] report: ${file}`);
})();
