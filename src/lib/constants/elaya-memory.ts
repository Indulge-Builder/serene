// elaya-memory.ts — THE vocabulary of Elaya's living memory of each user and of the improvement
// requests the team raises (migration 0237, 2026-09-25). The SQL CHECKs mirror these lists: a new
// value = one entry here + a CHECK migration.
import { defineEnum } from './define-enum';

// ── What Elaya may remember about a person ───────────────────────────────────
const KIND_DEF = defineEnum([
  { id: 'rule', label: 'Rule' },              // "never include leads in my brief"
  { id: 'correction', label: 'Correction' },  // "when I say overdue I mean past the Freshdesk due time"
  { id: 'style', label: 'Style' },            // "number first, then the why; no long messages"
  { id: 'preference', label: 'Preference' },  // "call me Ethan"; "reply in Hinglish"
  { id: 'interest', label: 'Interest' },      // "tracks renewals and Nadal uptake"
  { id: 'fact', label: 'Fact' },              // "owns the Onboarding domain"
]);
export const ELAYA_MEMORY_KINDS = KIND_DEF.values;
export const ELAYA_MEMORY_KIND_LABELS = KIND_DEF.labels;
export const ELAYA_MEMORY_KIND_OPTIONS = KIND_DEF.options;
export const ELAYA_MEMORY_KIND_ENUM = KIND_DEF.zodEnum;
export type ElayaMemoryKind = (typeof KIND_DEF.zodEnum)[number];
/** The order entries are folded into the prompt: what binds her first, what informs her last. */
export const ELAYA_MEMORY_KIND_RANK: Record<ElayaMemoryKind, number> = { rule: 0, correction: 1, style: 2, preference: 3, interest: 4, fact: 5 };

export const ELAYA_MEMORY_SOURCES = ['chat', 'self', 'admin'] as const;
export type ElayaMemorySource = (typeof ELAYA_MEMORY_SOURCES)[number];

/** A statement's length (the SQL CHECK), and the whole block's budget in the cached prompt prefix. */
export const ELAYA_MEMORY_STATEMENT_MAX = 400;
export const ELAYA_MEMORY_PROMPT_BUDGET_CHARS = 6000;
/** The after-turn reader (lib/elaya/memory.ts): how many recent messages it reads, its prompt version. */
export const ELAYA_MEMORY_READER_MESSAGES = 6;
export const ELAYA_MEMORY_READER_PROMPT_VERSION = 'memory-reader-v1';

// ── The improvement requests ─────────────────────────────────────────────────
const REQUEST_KIND_DEF = defineEnum([
  { id: 'wrong_data', label: 'Wrong data' },
  { id: 'time_frame', label: 'Wrong time frame' },
  { id: 'missing_tool', label: 'Cannot do it yet' },
  { id: 'wrong_answer', label: 'Wrong answer' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'other', label: 'Other' },
]);
export const ELAYA_REQUEST_KINDS = REQUEST_KIND_DEF.values;
export const ELAYA_REQUEST_KIND_LABELS = REQUEST_KIND_DEF.labels;
export const ELAYA_REQUEST_KIND_ENUM = REQUEST_KIND_DEF.zodEnum;
export type ElayaRequestKind = (typeof REQUEST_KIND_DEF.zodEnum)[number];

const REQUEST_STATUS_DEF = defineEnum([
  { id: 'open', label: 'Open' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'declined', label: 'Declined' },
  { id: 'playbook', label: 'Became a playbook' },
]);
export const ELAYA_REQUEST_STATUSES = REQUEST_STATUS_DEF.values;
export const ELAYA_REQUEST_STATUS_LABELS = REQUEST_STATUS_DEF.labels;
export const ELAYA_REQUEST_STATUS_ENUM = REQUEST_STATUS_DEF.zodEnum;
export const ELAYA_REQUEST_STATUS_OPTIONS_FOR_PANEL = REQUEST_STATUS_DEF.options;
export type ElayaRequestStatus = (typeof REQUEST_STATUS_DEF.zodEnum)[number];

/** Known issues folded into every prompt: open requests this recent, and fixed ones with a note this recent. */
export const ELAYA_KNOWN_ISSUES_OPEN_DAYS = 30;
export const ELAYA_KNOWN_ISSUES_FIXED_DAYS = 14;
export const ELAYA_KNOWN_ISSUES_MAX = 12;

export const ELAYA_REQUESTS_PATH = '/settings/elaya-requests';
