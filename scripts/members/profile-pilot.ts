/**
 * scripts/members/profile-pilot.ts — the member profiler's pilot (plan-sia-intelligence.md,
 * decision 4: "read twenty groups first, the founder checks the quality, then the full run is
 * approved or not").
 *
 * DRY RUN by default: it reads the newest finished conversations of the most recently active
 * member-linked groups, sends them through the vault and the reader exactly as the cloud task
 * would, and writes a plain report of what WOULD be filed — nothing enters a member's profile
 * and no cursor moves. Each window is still recorded in sia.extraction_runs (dry_run: true),
 * so the spend is auditable.
 *
 * The report holds real member names and quotes, so it is written OUTSIDE the repository.
 *
 *   npx tsx --env-file=.env.local scripts/members/profile-pilot.ts                 (20 groups, 2 conversations each)
 *   npx tsx --env-file=.env.local scripts/members/profile-pilot.ts --groups 3 --per-group 1
 *   npx tsx --env-file=.env.local scripts/members/profile-pilot.ts --days 45
 */
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { runProfilerSweep, type WindowOutcome } from "../../src/lib/services/member-profiler";
import { PROFILER_COST_PER_MTOK, PROFILER_PROMPT_VERSION } from "../../src/lib/constants/member-profiler";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  const v = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}
const GROUPS = arg("--groups", 20);
const PER_GROUP = arg("--per-group", 2);
const DAYS = arg("--days", 30);

function section(o: WindowOutcome): string {
  const head = `### ${o.member_name || o.member_id}  \n${o.from_at.slice(0, 16).replace("T", " ")} → ${o.to_at.slice(0, 16).replace("T", " ")} · ${o.messages} messages · ${o.status}${o.error ? ` · ${o.error}` : ""}`;
  if (!o.reading) return head + "\n";
  const r = o.reading; const L: string[] = [head, "", `**What happened:** ${r.summary || "(no summary)"}  \n**Tone:** ${r.tone}`];
  if (r.facts.length) { L.push("", "**Facts it would file**"); for (const f of r.facts) L.push(`- ${f.facet} / ${f.key}: **${f.value}** (${f.polarity}, confidence ${f.confidence}, messages ${f.evidence.join(",")})`); }
  if (r.people.length) { L.push("", "**People**"); for (const p of r.people) L.push(`- ${p.name} — ${p.relation}${p.note ? ` · ${p.note}` : ""}`); }
  if (r.relations.length) { L.push("", "**Relations**"); for (const x of r.relations) L.push(`- ${x.relation} ${x.kind}: ${x.label}`); }
  if (r.coming_up.length) { L.push("", "**Coming up**"); for (const c of r.coming_up) L.push(`- ${c.due_at} · ${c.kind}: ${c.title}${c.suggested_action ? ` → ${c.suggested_action}` : ""}`); }
  if (!r.facts.length && !r.people.length && !r.relations.length && !r.coming_up.length) L.push("", "_Nothing durable learned from this conversation._");
  return L.join("\n") + "\n";
}

async function main() {
  const startAt = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  console.log(`[pilot] dry run · ${GROUPS} groups · newest ${PER_GROUP} finished conversation(s) each · last ${DAYS} days · prompt ${PROFILER_PROMPT_VERSION}`);
  const t0 = Date.now();
  const sweep = await runProfilerSweep({
    apply: false, maxGroups: GROUPS, maxWindows: GROUPS * PER_GROUP, startAt, newestPerGroup: PER_GROUP,
    onWindow: (o) => console.log(`[pilot] ${o.status.padEnd(6)} ${(o.member_name || o.member_id).slice(0, 28).padEnd(28)} msgs=${String(o.messages).padStart(3)} facts=${o.reading?.facts.length ?? "-"} people=${o.reading?.people.length ?? "-"} coming_up=${o.reading?.coming_up.length ?? "-"}${o.error ? " error=" + o.error.slice(0, 80) : ""}`),
  });
  const read = sweep.outcomes.filter((o) => o.status === "read");
  const tin = read.reduce((n, o) => n + (o.tokens?.in ?? 0), 0), tout = read.reduce((n, o) => n + (o.tokens?.out ?? 0), 0);
  const cost = (tin * PROFILER_COST_PER_MTOK.input + tout * PROFILER_COST_PER_MTOK.output) / 1_000_000;
  const totals = { facts: read.reduce((n, o) => n + (o.reading?.facts.length ?? 0), 0), people: read.reduce((n, o) => n + (o.reading?.people.length ?? 0), 0), relations: read.reduce((n, o) => n + (o.reading?.relations.length ?? 0), 0), coming_up: read.reduce((n, o) => n + (o.reading?.coming_up.length ?? 0), 0) };

  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `profiler-pilot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  const body = [
    `# Member profiler pilot — dry run`,
    ``,
    `Nothing below was written to any member's profile. Prompt ${PROFILER_PROMPT_VERSION}.`,
    ``,
    `| | |`, `| --- | --- |`,
    `| Groups looked at | ${sweep.groups} |`,
    `| Conversations read | ${read.length} |`,
    `| Skipped as too thin | ${sweep.outcomes.filter((o) => o.status === "thin").length} |`,
    `| Failed | ${sweep.outcomes.filter((o) => o.status === "failed").length} |`,
    `| Would file | ${totals.facts} facts · ${totals.people} people · ${totals.relations} relations · ${totals.coming_up} coming up |`,
    `| Tokens | ${tin.toLocaleString()} in · ${tout.toLocaleString()} out |`,
    `| Estimated cost | about $${cost.toFixed(2)} |`,
    ``,
    ...sweep.outcomes.filter((o) => o.status !== "thin").map(section),
  ].join("\n");
  writeFileSync(file, body);
  console.log(`[pilot] ${read.length} read, ${totals.facts} facts, ${totals.people} people, ${totals.relations} relations, ${totals.coming_up} coming up · ${(tin + tout).toLocaleString()} tokens ≈ $${cost.toFixed(2)} · ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`[pilot] report: ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
