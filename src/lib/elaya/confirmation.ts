// Elaya confirmation classifier — THE pending-action gate's decision function.
//
// Phase 2 (agentic writes): a state-changing write (lead status, reassignment) is
// never executed in the turn it is proposed. It executes only on a LATER turn, when
// this function classifies the human's reply as an unambiguous affirmative. Everything
// that is not a clear "yes" cancels the pending action (the resolver marks it
// dismissed). The safety bias is structural: the DEFAULT branch is 'other'.
//
// This file is PURE — no I/O, no imports, no model call. The gate must be in code,
// not prompt instruction (sign-off invariant), and it must be unit-testable in
// isolation. It is fed ONLY the human's latest user-role message (never tool results,
// assistant prose, or lead-sourced text — that separation is the prompt-injection
// defence: lead text can never *be* the confirmation).
//
// Bias and scope (deliberate):
//   • Match on whole, tokenized words / short whole-string forms — never naive
//     substring `includes` (so "yesterday" never reads as "yes", "okesha" never as "ok").
//   • A reply that merely CONTAINS a yes-word inside a larger sentence is NOT an
//     affirmative ("yes but actually mark him won" → 'other' → cancel, act fresh).
//     Only a reply whose meaningful content IS a confirmation passes.
//   • English + the Hinglish/Hindi-in-Latin-script the team actually types (haan,
//     theek hai, kar do, …). Pure Devanagari is out of scope (the staff type Latin).

export type ConfirmationVerdict = 'affirmative' | 'other';

// Whole-message confirmations (after normalization). If the entire reply reduces to
// one of these — optionally with a leading filler like "ok" / "yes" — it's a yes.
// Multi-word phrases are matched as exact normalized strings; single words are matched
// as a token set so word order / trivial padding ("yes please", "please do") still pass.
const AFFIRMATIVE_PHRASES: ReadonlySet<string> = new Set([
  // English — phrases
  'yes please', 'please do', 'go ahead', 'go for it', 'do it', 'do that',
  'sounds good', 'go on', 'yes do it', 'yes do that', 'please go ahead',
  // Hinglish / Hindi-in-Latin — phrases
  'ji haan', 'ji han', 'theek hai', 'thik hai', 'thik h', 'theek h',
  'kar do', 'kardo', 'kar dijiye', 'kar dijie', 'kar de', 'karde',
  'ha kar do', 'haan kar do', 'ok kar do', 'bilkul karo', 'ji karo',
]);

// Single-token affirmatives. A reply passes if EVERY meaningful token is one of these
// (so "yes ok", "haan ji", "ok sure" pass; "yes but" does not — "but" isn't here).
const AFFIRMATIVE_TOKENS: ReadonlySet<string> = new Set([
  // English
  'yes', 'y', 'yep', 'yeah', 'yup', 'yes!', 'ok', 'okay', 'k', 'kk',
  'confirm', 'confirmed', 'sure', 'correct', 'right', 'agreed', 'approve',
  'approved', 'proceed', 'please',
  // Hinglish / Hindi-in-Latin
  'haan', 'han', 'haa', 'ha', 'hn', 'ji', 'bilkul', 'sahi', 'karo', 'theek', 'thik',
]);

// Tokens that are pure padding — ignored when deciding "is every meaningful token a yes".
// Kept tiny on purpose: anything not explicitly padding counts as meaningful, so an
// unexpected word forces 'other'.
const FILLER_TOKENS: ReadonlySet<string> = new Set(['the', 'it', 'that', 'this', 'pls', 'plz']);

/**
 * Normalize a reply for matching:
 *   • lowercase
 *   • strip everything that isn't a latin letter, digit, or single inner space
 *     (drops punctuation, emoji, and any non-latin script — which collapses an
 *     emoji-only or Devanagari-only message to '' → 'other')
 *   • collapse whitespace
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation/emoji/non-latin → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify the human's reply. Returns 'affirmative' ONLY for an unambiguous yes;
 * everything else (including empty, ambiguous, negative, or a reply that also carries
 * a new instruction) returns 'other'. The caller treats 'other' as "cancel the pending
 * action and process the message fresh" — never as an execution.
 */
export function classifyConfirmation(text: string): ConfirmationVerdict {
  const normalized = normalize(text);
  if (normalized.length === 0) return 'other';

  // 1. Whole-message phrase match (exact normalized string).
  if (AFFIRMATIVE_PHRASES.has(normalized)) return 'affirmative';

  // 2. Token-set match: every meaningful (non-filler) token must be an affirmative
  //    token, and there must be at least one. This passes "yes", "haan ji", "ok sure",
  //    "yes please" (please is an affirmative token) while rejecting any reply that
  //    introduces a non-yes word ("yes but …", "ok move him to won", "no").
  const tokens = normalized.split(' ').filter((t) => t.length > 0 && !FILLER_TOKENS.has(t));
  if (tokens.length === 0) return 'other';

  const everyTokenAffirmative = tokens.every((t) => AFFIRMATIVE_TOKENS.has(t));
  return everyTokenAffirmative ? 'affirmative' : 'other';
}
