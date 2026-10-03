/**
 * The prompt parity bench (2026-10-02). Free: no model, no database. Proves the two brains build
 * the SAME shared system block (persona.ts is generated from persona.py's rules and both fold the
 * one behaviour policy file), the same per-user block for the same inputs, and that the style
 * overlay resolves "no emojis" in code. Run after touching either persona, the policy JSON or the
 * persona constants:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/elaya/prompt-parity.ts
 */
import { spawnSync } from 'node:child_process';
import { buildElayaSystemBlocks } from '@/lib/elaya/persona';
import { buildPersonaPromptBlock } from '@/lib/constants/elaya-persona';
import { ELAYA_BEHAVIOUR_VERSION, ELAYA_FORBIDDEN_PHRASES, ELAYA_PROMPT_VERSION, buildBehaviourBlock } from '@/lib/constants/elaya-behaviour';
import type { StaffPrincipal } from '@/lib/elaya/principal';

const principal = {
  userId: '00000000-0000-0000-0000-000000000001', role: 'manager', domain: 'onboarding', displayName: 'Eval Manager',
  toolset: [], siaRole: null, queendomId: null,
} as unknown as StaffPrincipal;
const persona = { tone: 'direct', emojis: 'none', note: 'Call me Sam.' } as const;
const focus = 'Focus for this conversation: general — greetings, questions about Serene itself, and the user\'s day.';
const memory = '- [rule] Always state the time window.';
const notes = ['Investor meeting\nTuesday 4pm with Karan'];
const evidence = '- get_my_tasks({}) → {"tasks":[...]}';

const py = spawnSync('backend/.venv/bin/python', ['-c', [
  'import json, sys, types; sys.path.insert(0, "backend")',
  'from app.brain import persona as p, behaviour as b',
  'pr = types.SimpleNamespace(user_id="00000000-0000-0000-0000-000000000001", role="manager", domain="onboarding", display_name="Eval Manager", sia_role=None, queendom_id=None)',
  `sp = p.build_system_prompt(pr, ${JSON.stringify(focus)}, "whatsapp", persona=${JSON.stringify(persona)}, learned=None, notes=${JSON.stringify(notes)}, playbook=None, memory=${JSON.stringify(memory)}, known_issues="", evidence=${JSON.stringify(evidence)})`,
  'print(json.dumps({"shared": sp.shared, "user": sp.user, "behaviour": b.BEHAVIOUR_VERSION, "prompt": b.PROMPT_VERSION, "block": b.build_behaviour_block()}))',
].join('; ')], { encoding: 'utf8' });
if (py.status !== 0) { console.error('python side failed:', py.stderr); process.exit(2); }
const theirs = JSON.parse(py.stdout) as { shared: string; user: string; behaviour: string; prompt: string; block: string };
const ours = buildElayaSystemBlocks(principal, 'whatsapp', { personaCtx: { persona, learned: null }, notes, memory, knownIssues: '', specialistFocus: focus, evidence });

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed += 1; };
const firstDiff = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1; return `first difference at ${i}: ts "${a.slice(i, i + 60)}" vs py "${b.slice(i, i + 60)}"`; };
check('behaviour version agrees', theirs.behaviour === ELAYA_BEHAVIOUR_VERSION, `${theirs.behaviour} / ${ELAYA_BEHAVIOUR_VERSION}`);
check('prompt version agrees', theirs.prompt === ELAYA_PROMPT_VERSION, `${theirs.prompt} / ${ELAYA_PROMPT_VERSION}`);
check('behaviour block is byte-identical', theirs.block === buildBehaviourBlock(), theirs.block === buildBehaviourBlock() ? '' : firstDiff(buildBehaviourBlock(), theirs.block));
check('shared block is byte-identical', theirs.shared === ours.shared, theirs.shared === ours.shared ? `${ours.shared.length} chars` : firstDiff(ours.shared, theirs.shared));
check('user block is byte-identical', theirs.user === ours.user, theirs.user === ours.user ? `${ours.user.length} chars` : firstDiff(ours.user, theirs.user));
check('shared block names no user', !ours.shared.includes('Eval Manager'));
check('no-emoji preference resolves in code', buildPersonaPromptBlock({ emojis: 'none' }).includes('No emojis with this user'));
check('a default persona adds zero bytes', buildPersonaPromptBlock({ emojis: 'default', tone: 'warm' }) === '');
// behaviour-v2 quotes the generic-AI phrases as examples to avoid, so each occurrence must sit inside quotes.
check('forbidden phrases appear only as quoted examples', ELAYA_FORBIDDEN_PHRASES.every((p) => { const b = buildBehaviourBlock().toLowerCase(); let i = b.indexOf(p); while (i >= 0) { if (b[i - 1] !== '"') return false; i = b.indexOf(p, i + 1); } return true; }));
check('the user block carries the resolution order', ours.user.includes('How to resolve style for this person'));
console.log(failed ? `\n${failed} check(s) failed` : '\nall parity checks passed');
process.exit(failed ? 1 : 0);
