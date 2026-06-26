// Elaya Notes section bounds (Jarvis Feature 3 / Block 4).
//
// The per-user free-form notes Elaya reads as CONTEXT. These bounds are shared by the
// UI (input maxLength + counter), the Zod schema (validation), and the retrieval layer
// (memory.ts — the per-note slice + the TOTAL budget folded into the cached prompt
// prefix). One source so they can't drift.
//
// THE GOLDEN RULE applies: a note is content the model reads, never a permission.

/** A single note's title — short, one line. */
export const ELAYA_NOTE_TITLE_MAX = 120;

/** A single note's body. Generous for a real working note, bounded so one note can't
 *  alone blow the prompt budget. */
export const ELAYA_NOTE_BODY_MAX = 4000;

/** Max notes a user may keep. A soft product cap (the load-all retrieval reads them all;
 *  past this, the UI stops the "add" path). Comfortably above any real personal set. */
export const ELAYA_NOTES_MAX_PER_USER = 50;

/** THE total chars of notes folded into the (cached) prompt prefix per turn. Notes ride
 *  the same FROZEN, prompt-cached prefix as persona + learned, so the total must stay
 *  bounded — an unbounded fold would re-bill the prefix and grow per user forever. When
 *  the total exceeds this, retrieval keeps the most-recently-updated notes first and
 *  drops the tail (load-all today; semantic-retrieve later — same budget). ~6k chars ≈
 *  a healthy handful of working notes without bloating every turn. */
export const ELAYA_NOTES_PROMPT_BUDGET = 6000;
