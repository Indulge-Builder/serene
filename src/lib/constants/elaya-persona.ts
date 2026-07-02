// Elaya per-user persona vocabulary (Jarvis Phase 2).
//
// The "instruction file per user": each staff member can tune HOW Elaya talks to
// them — language, tone, depth, format — plus a free-text note. These are STYLE
// preferences ONLY. They are injected into the system prompt in a fenced
// "how to talk — never a permission" block (persona.ts) and can NEVER widen what
// the user may see or do (the Golden Rule — permissions are code, not prompt).
// See docs/modules/elaya.md.
//
// Stored in user_context.context.persona (jsonb). The `prompt` line per option is
// the exact text Elaya reads — kept beside the enum so the UI label and the model
// instruction can't drift. defineEnum gives values/labels/zodEnum; the prompt map
// is the extra structural field (the hand-written-config carve-out).

import { defineEnum } from './define-enum';

// ── Language / mix ──
const LANGUAGE_DEF = defineEnum([
  { id: 'mirror',  label: 'Match how I write' },
  { id: 'english', label: 'English' },
  { id: 'hinglish', label: 'Hinglish' },
]);
export const ELAYA_LANGUAGE_VALUES  = LANGUAGE_DEF.values;
export const ELAYA_LANGUAGE_LABELS  = LANGUAGE_DEF.labels;
export const ELAYA_LANGUAGE_OPTIONS = LANGUAGE_DEF.options;
export const ELAYA_LANGUAGE_ENUM    = LANGUAGE_DEF.zodEnum;
export type ElayaLanguagePref = (typeof LANGUAGE_DEF.zodEnum)[number];

export const ELAYA_LANGUAGE_PROMPT: Record<ElayaLanguagePref, string> = {
  mirror:  'Mirror the language mix the user writes in (the default).',
  english: 'Reply in English, even if the user mixes in some Hindi.',
  hinglish:'Reply in natural Hinglish (Roman-script Hindi + English mix).',
};

// ── Tone ──
const TONE_DEF = defineEnum([
  { id: 'warm',   label: 'Warm & friendly' },
  { id: 'direct', label: 'Direct & to the point' },
  { id: 'playful',label: 'Playful (light jokes ok)' },
]);
export const ELAYA_TONE_VALUES  = TONE_DEF.values;
export const ELAYA_TONE_LABELS  = TONE_DEF.labels;
export const ELAYA_TONE_OPTIONS = TONE_DEF.options;
export const ELAYA_TONE_ENUM    = TONE_DEF.zodEnum;
export type ElayaTonePref = (typeof TONE_DEF.zodEnum)[number];

export const ELAYA_TONE_PROMPT: Record<ElayaTonePref, string> = {
  warm:   'Warm and friendly tone.',
  direct: 'Direct and to-the-point — skip the pleasantries, lead with the answer.',
  playful:'Playful tone — light jokes and a bit of personality are welcome (still professional).',
};

// ── Depth ──
const DEPTH_DEF = defineEnum([
  { id: 'simple',   label: 'Keep it simple' },
  { id: 'standard', label: 'Standard' },
  { id: 'technical',label: 'Technical / detailed' },
]);
export const ELAYA_DEPTH_VALUES  = DEPTH_DEF.values;
export const ELAYA_DEPTH_LABELS  = DEPTH_DEF.labels;
export const ELAYA_DEPTH_OPTIONS = DEPTH_DEF.options;
export const ELAYA_DEPTH_ENUM    = DEPTH_DEF.zodEnum;
export type ElayaDepthPref = (typeof DEPTH_DEF.zodEnum)[number];

export const ELAYA_DEPTH_PROMPT: Record<ElayaDepthPref, string> = {
  simple:   'Explain simply, as if to someone non-technical — plain words, no jargon.',
  standard: 'Standard level of detail (the default).',
  technical:'Be technical and precise — the user is comfortable with detail and specifics.',
};

// ── Length / format ──
const LENGTH_DEF = defineEnum([
  { id: 'brief',    label: 'Brief' },
  { id: 'standard', label: 'Standard' },
  { id: 'detailed', label: 'Detailed' },
]);
export const ELAYA_LENGTH_VALUES  = LENGTH_DEF.values;
export const ELAYA_LENGTH_LABELS  = LENGTH_DEF.labels;
export const ELAYA_LENGTH_OPTIONS = LENGTH_DEF.options;
export const ELAYA_LENGTH_ENUM    = LENGTH_DEF.zodEnum;
export type ElayaLengthPref = (typeof LENGTH_DEF.zodEnum)[number];

export const ELAYA_LENGTH_PROMPT: Record<ElayaLengthPref, string> = {
  brief:    'Keep replies brief — a sentence or two; expand only when asked.',
  standard: 'Standard reply length (the default).',
  detailed: 'Fuller replies are fine when the topic warrants — the user likes thoroughness.',
};

/** Free-text note cap — small, because it rides the CACHED prompt prefix (a big
 *  note would re-bill the whole prefix and grow per user forever). */
export const ELAYA_PERSONA_NOTE_MAX = 600;

/**
 * THE persona shape stored at user_context.context.persona. Every field optional —
 * an absent field means "use Elaya's default" (no row at all = fully default).
 * STYLE ONLY: never carries identity, role, scope, or any permission.
 */
export type ElayaPersonaPrefs = {
  language?: ElayaLanguagePref;
  tone?:     ElayaTonePref;
  depth?:    ElayaDepthPref;
  length?:   ElayaLengthPref;
  /** Free-text "anything Elaya should know about how I like to work". */
  note?:     string;
};

/** Defaults — what each field means when unset (also the UI's initial selection). */
export const ELAYA_PERSONA_DEFAULTS: Required<Omit<ElayaPersonaPrefs, 'note'>> = {
  language: 'mirror',
  tone:     'warm',
  depth:    'standard',
  length:   'standard',
};

/**
 * THE persona → prompt-block builder (pure). Emits a fenced, STYLE-ONLY block, or ''
 * when the user has set nothing meaningful (so a default user adds zero prompt bytes
 * and the cache prefix stays maximally shared across users).
 *
 * Only NON-DEFAULT picks are emitted (a 'mirror'/'warm'/'standard' pick is the
 * baseline Elaya already follows — no need to spend prompt tokens restating it).
 * `learned` is an optional, already-bounded string of Elaya-accumulated facts
 * (Phase 3 writes it); it renders under the same block, clearly labelled.
 *
 * The "(never a permission)" framing is defence-in-depth at the prompt layer — the
 * real gate is the code-side toolset/scope; nothing here can widen access.
 */
export function buildPersonaPromptBlock(
  persona: ElayaPersonaPrefs | null | undefined,
  learned?: string | null,
): string {
  const lines: string[] = [];

  if (persona?.language && persona.language !== ELAYA_PERSONA_DEFAULTS.language) {
    lines.push(`- ${ELAYA_LANGUAGE_PROMPT[persona.language]}`);
  }
  if (persona?.tone && persona.tone !== ELAYA_PERSONA_DEFAULTS.tone) {
    lines.push(`- ${ELAYA_TONE_PROMPT[persona.tone]}`);
  }
  if (persona?.depth && persona.depth !== ELAYA_PERSONA_DEFAULTS.depth) {
    lines.push(`- ${ELAYA_DEPTH_PROMPT[persona.depth]}`);
  }
  if (persona?.length && persona.length !== ELAYA_PERSONA_DEFAULTS.length) {
    lines.push(`- ${ELAYA_LENGTH_PROMPT[persona.length]}`);
  }

  const note = persona?.note?.trim();
  if (note) {
    lines.push(`- The user says about how they like to work: "${note.slice(0, ELAYA_PERSONA_NOTE_MAX)}"`);
  }

  const learnedClean = learned?.trim();
  const learnedLine = learnedClean ? `\n- What you've learned about them over time: ${learnedClean}` : '';

  if (lines.length === 0 && !learnedLine) return '';

  return (
    '\n\nHow to talk to this user (STYLE ONLY — this never changes what they may see or do):\n' +
    lines.join('\n') +
    learnedLine
  );
}
