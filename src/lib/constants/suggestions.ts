// Suggestion-box / bug-report vocabulary (pure data). The suggestion channel:
// any staff member writes a message + attaches up to MAX_SUGGESTION_IMAGES
// screenshots; admin/founder triage in /admin/suggestions (open → resolved).
//
// Category + status derive from one defineEnum array each so values/labels/
// options/zodEnum can never drift (the lead-sources pattern).

import { defineEnum } from "./define-enum";

const SUGGESTION_CATEGORY_DEF = defineEnum([
  { id: "bug",   label: "Bug"   },
  { id: "idea",  label: "Idea"  },
  { id: "other", label: "Other" },
]);

export const SUGGESTION_CATEGORIES        = SUGGESTION_CATEGORY_DEF.values;
export const SUGGESTION_CATEGORY_LABELS   = SUGGESTION_CATEGORY_DEF.labels;
export const SUGGESTION_CATEGORY_OPTIONS  = SUGGESTION_CATEGORY_DEF.options;
export const SUGGESTION_CATEGORY_ENUM     = SUGGESTION_CATEGORY_DEF.zodEnum;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

const SUGGESTION_STATUS_DEF = defineEnum([
  { id: "open",     label: "Open"     },
  { id: "resolved", label: "Resolved" },
]);

export const SUGGESTION_STATUSES       = SUGGESTION_STATUS_DEF.values;
export const SUGGESTION_STATUS_LABELS  = SUGGESTION_STATUS_DEF.labels;
export const SUGGESTION_STATUS_OPTIONS = SUGGESTION_STATUS_DEF.options;
export const SUGGESTION_STATUS_ENUM    = SUGGESTION_STATUS_DEF.zodEnum;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** Max screenshots per report — enforced client-side, in Zod, and by a DB CHECK. */
export const MAX_SUGGESTION_IMAGES = 4;

/** Per-image cap (5 MB — screenshots run larger than the 2 MB avatar cap). */
export const MAX_SUGGESTION_IMAGE_BYTES = 5 * 1024 * 1024;

/** THE private Storage bucket holding suggestion screenshots (never public). */
export const SUGGESTIONS_BUCKET = "suggestions";
