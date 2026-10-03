/**
 * The price table parity bench (2026-10-02). Free: no model, no database. The TypeScript table
 * (src/lib/constants/llm-pricing.ts) and the Python mirror (backend/app/llm/pricing.py) must be
 * the same table under the same version, and the cost formula must agree on a worked example;
 * the ledger rows both runtimes write are only comparable when they do. Run after touching either:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/elaya/pricing-parity.ts
 */
import { spawnSync } from 'node:child_process';
import { LLM_PRICES, LLM_PRICE_VERSION, costUsdFor } from '@/lib/constants/llm-pricing';

const py = spawnSync('backend/.venv/bin/python', ['-c', [
  'import json, sys; sys.path.insert(0, "backend")',
  'from app.llm import pricing as p',
  'print(json.dumps({"version": p.LLM_PRICE_VERSION, "table": p.table_as_json(), "sample": p.cost_usd_for("claude-sonnet-5", input_tokens=12000, output_tokens=800, cache_read_tokens=30000, cache_write_tokens=4000, cache_write_1h_tokens=1000)}))',
].join('; ')], { encoding: 'utf8' });
if (py.status !== 0) { console.error('python side failed:', py.stderr); process.exit(2); }
const theirs = JSON.parse(py.stdout) as { version: string; table: unknown; sample: number | null };

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed += 1; };
check('same price version', theirs.version === LLM_PRICE_VERSION, `${theirs.version} vs ${LLM_PRICE_VERSION}`);
check('same table', JSON.stringify(theirs.table) === JSON.stringify(LLM_PRICES), JSON.stringify(theirs.table) === JSON.stringify(LLM_PRICES) ? '' : `\n  py: ${JSON.stringify(theirs.table)}\n  ts: ${JSON.stringify(LLM_PRICES)}`);
const ours = costUsdFor('claude-sonnet-5', { inputTokens: 12000, outputTokens: 800, cacheReadTokens: 30000, cacheWriteTokens: 4000, cacheWrite1hTokens: 1000 });
check('same cost on a worked example', ours !== null && theirs.sample !== null && Math.abs(ours - theirs.sample) < 1e-9, `${ours} vs ${theirs.sample}`);
// The formula by hand: 12000*2 + 3000*2.5 + 1000*4 + 30000*0.2 + 800*10 = 24000+7500+4000+6000+8000 = 49500 per MTok → 0.0495
check('formula matches the hand sum', ours !== null && Math.abs(ours - 0.0495) < 1e-9, `${ours}`);
check('unknown model prices as null', costUsdFor('claude-opus-4-1', { inputTokens: 1, outputTokens: 1 }) === null);
console.log(failed ? `\n${failed} check(s) failed` : '\nall parity checks passed');
process.exit(failed ? 1 : 0);
