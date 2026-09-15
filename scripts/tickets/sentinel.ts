/**
 * scripts/tickets/sentinel.ts — the sentinel pool from a laptop, until `pnpm trigger:deploy`
 * puts src/trigger/ticket-sentinel.ts in the cloud. Same core, one sweep a minute.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/tickets/sentinel.ts            (one sweep, then exit)
 *   npx tsx --env-file=.env.local scripts/tickets/sentinel.ts --loop [--minutes N]
 */
import { runSentinelSweep } from "../../src/lib/services/ticket-sentinel";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}
const LOOP = process.argv.includes("--loop");
const MINUTES = arg("--minutes", 24 * 60);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sweep(n: number) {
  const t0 = Date.now();
  try {
    const s = await runSentinelSweep({ deadlineMs: 50_000 });
    const detail = s.woken.map((w) => `${w.ticket_no}${w.fires.length ? ":" + w.fires.join("+") : ""}${w.read ? " read" : ""}${w.closed ? " closed" : ""}${w.error ? " ERR " + w.error.slice(0, 60) : ""}`).join(" ");
    console.log(`[sentinel ${new Date().toISOString().slice(11, 19)}Z #${n}] claimed=${s.claimed} fires=${s.fires} reads=${s.reads} closed=${s.closed} errors=${s.errors} ${detail} (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error(`[sentinel #${n}] sweep failed:`, e instanceof Error ? e.message : e);
  }
}

async function main() {
  if (!LOOP) { await sweep(1); return; }
  const started = Date.now();
  let n = 0;
  console.log(`[sentinel] looping every minute for ${MINUTES} minutes; Ctrl-C to stop`);
  while (Date.now() - started < MINUTES * 60_000) {
    n += 1;
    const t0 = Date.now();
    await sweep(n);
    const elapsed = Date.now() - t0;
    if (elapsed < 60_000) await sleep(60_000 - elapsed);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
