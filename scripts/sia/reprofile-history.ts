/**
 * reprofile-history.ts — read the imported chat history into the member profiles
 * (migration 0249, docs/architecture/sia-resilience-plan.md section 9).
 *
 * After scripts/sia/import-chat-export.ts has filed a group's old chat, this reads those
 * conversations through THE profiler (runHistoryBackfill in member-profiler.ts): same vault, same
 * prompt, same writes. The live sweep's bookmark is never touched.
 *
 *   npx tsx --env-file=.env.local scripts/sia/reprofile-history.ts --estimate          (count + price, no model call)
 *   npx tsx --env-file=.env.local scripts/sia/reprofile-history.ts                     (dry run: reads, writes nothing)
 *   npx tsx --env-file=.env.local scripts/sia/reprofile-history.ts --apply [--assess]
 *        [--group <jid>] [--imports N] [--minutes N] [--cap-usd N]
 *
 * A DRY RUN STILL CALLS THE MODEL and costs what a real run costs; only `--estimate` is free.
 * `--assess` re-runs Serene's judgement for every member whose import finished in this run.
 * The run stops at the spend cap (settings row sia_history_reprofile_cap_usd, default 60) and
 * picks up where it stopped the next time.
 *
 * The report holds real names, so it is written OUTSIDE the repo (~/Desktop/serene-backups).
 */
import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { runHistoryBackfill, type WindowOutcome } from "../../src/lib/services/member-profiler";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => { const i = argv.indexOf(n); return i === -1 ? null : (argv[i + 1] ?? null); };
const num = (n: string, d: number) => { const v = Number(opt(n)); return Number.isFinite(v) && v > 0 ? v : d; };

const APPLY = flag("--apply");
const ESTIMATE = flag("--estimate");
const ASSESS = flag("--assess");
const GROUP = opt("--group") ?? undefined;
const MINUTES = num("--minutes", 20);
const IMPORTS = num("--imports", 50);
const CAP = opt("--cap-usd") ? Number(opt("--cap-usd")) : undefined;

async function main(): Promise<void> {
  const lines: string[] = [];
  const onWindow = (o: WindowOutcome) => {
    const w = o.written;
    const line = `${o.from_at.slice(0, 10)}  ${o.status.padEnd(6)} ${String(o.messages).padStart(4)} msgs  ${o.member_name}${w ? `  +${w.facts} facts, ${w.people} people, ${w.relations} relations, ${w.coming_up} coming up` : ""}${o.error ? `  (${o.error})` : ""}`;
    lines.push(line);
    console.log(line);
  };

  const r = await runHistoryBackfill({ apply: APPLY, estimate: ESTIMATE, deadlineMs: MINUTES * 60_000, groupJid: GROUP, maxImports: IMPORTS, capUsd: CAP, onWindow });

  const summary = [
    "",
    ESTIMATE ? "ESTIMATE (no model was called)" : APPLY ? "APPLIED" : "DRY RUN (the model was called; nothing was written)",
    `Imports walked     ${r.imports}${ESTIMATE ? "" : `, finished ${r.finished}`}`,
    `Conversations      ${r.windows}`,
    ESTIMATE ? `Would be read      ${r.windows - r.held}` : `Read               ${r.read}, thin ${r.thin}, failed ${r.failed}`,
    `Held (unresolved)  ${r.held}${r.held ? "   ← settle the names with the import's --map-file, then run again" : ""}`,
    ESTIMATE ? `Estimated cost     $${r.estimatedUsd?.toFixed(2)} (about ₹${Math.round((r.estimatedUsd ?? 0) * 84)})` : `Spent this run     $${r.spentUsd.toFixed(2)}`,
    `Spent before       $${r.spentBeforeUsd.toFixed(2)} of a $${r.capUsd} cap`,
    ESTIMATE ? "" : `Stopped because    ${r.stopped === "done" ? "there was nothing more to read" : r.stopped === "cap" ? "the spend cap was reached" : r.stopped === "deadline" ? "the time allowance ran out (run again to continue)" : "the model provider looks down"}`,
  ].filter(Boolean).join("\n");
  console.log(summary);

  if (APPLY && ASSESS && r.members.length) {
    const { assessMember } = await import("../../src/lib/services/member-assessment");
    console.log(`\nRe-judging ${r.members.length} member${r.members.length === 1 ? "" : "s"}…`);
    for (const id of r.members) {
      const a = await assessMember(id, { force: true }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
      console.log(`  ${id}  ${"error" in (a as object) ? "failed" : "judged"}`);
    }
  }

  const dir = join(homedir(), "Desktop", "serene-backups");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `history-reprofile-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`);
  writeFileSync(path, `${lines.join("\n")}\n${summary}\n`);
  console.log(`Report: ${path}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
