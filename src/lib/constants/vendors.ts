import { defineEnum } from "./define-enum";

// ─────────────────────────────────────────────
// Vendors — vocabulary (migrations 0183–0185).
// Every SQL CHECK in those migrations mirrors an id list here — extending one
// = a new migration that DROPs + re-ADDs the named constraint (the
// subscriptions 0163 rule). VENDOR_SERVICES is the ONE deliberate exception:
// it has no SQL CHECK, so growing it is a one-line edit, not a migration.
// ─────────────────────────────────────────────

// vendors.status — paused = do not suggest for now; blacklisted = never
// suggest. The ranker hard-excludes both; the details read says why.
const VENDOR_STATUS_DEF = defineEnum([
  { id: "active",      label: "Active" },
  { id: "paused",      label: "Paused" },
  { id: "blacklisted", label: "Blacklisted" },
]);
export const VENDOR_STATUSES = VENDOR_STATUS_DEF.values;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];
export const VENDOR_STATUS_LABELS  = VENDOR_STATUS_DEF.labels;
export const VENDOR_STATUS_OPTIONS = VENDOR_STATUS_DEF.options;
export const VENDOR_STATUS_ENUM    = VENDOR_STATUS_DEF.zodEnum;

// vendors.category_source — how the category on the spine was decided.
// All five values the Freshdesk extraction actually emits (the 0183 CHECK
// mirrors this list). `unresolved` is the honest 3,833-vendor "we could not
// tell"; `client-excluded` marks the handful of rows that turned out to be a
// CLIENT, not a supplier — kept, never suggested.
const VENDOR_CATEGORY_SOURCE_DEF = defineEnum([
  { id: "hand",            label: "Set by hand" },
  { id: "rule",            label: "Name rule" },
  { id: "ticket-category", label: "From ticket category" },
  { id: "unresolved",      label: "Unresolved" },
  { id: "client-excluded", label: "Client, not a vendor" },
]);
export const VENDOR_CATEGORY_SOURCES = VENDOR_CATEGORY_SOURCE_DEF.values;
export type VendorCategorySource = (typeof VENDOR_CATEGORY_SOURCES)[number];
export const VENDOR_CATEGORY_SOURCE_LABELS = VENDOR_CATEGORY_SOURCE_DEF.labels;
export const VENDOR_CATEGORY_SOURCE_ENUM   = VENDOR_CATEGORY_SOURCE_DEF.zodEnum;

// vendors.identity_status — the 0181 clients semantics: imports are born
// unverified; verified only after a human confirms the merged identity.
const VENDOR_IDENTITY_STATUS_DEF = defineEnum([
  { id: "unverified", label: "Unverified" },
  { id: "verified",   label: "Verified" },
]);
export const VENDOR_IDENTITY_STATUSES = VENDOR_IDENTITY_STATUS_DEF.values;
export type VendorIdentityStatus = (typeof VENDOR_IDENTITY_STATUSES)[number];
export const VENDOR_IDENTITY_STATUS_LABELS = VENDOR_IDENTITY_STATUS_DEF.labels;
export const VENDOR_IDENTITY_STATUS_ENUM   = VENDOR_IDENTITY_STATUS_DEF.zodEnum;

// ONE source vocabulary for BOTH vendors.sources[] and
// vendor_engagements.source (the two CHECKs mirror this list). `ticket` is
// reserved for the in-app ticketing Sia will bring.
const VENDOR_SOURCE_DEF = defineEnum([
  { id: "freshdesk", label: "Freshdesk archive" },
  { id: "sia",       label: "Sia (WhatsApp)" },
  { id: "manual",    label: "Entered by staff" },
  { id: "ticket",    label: "In-app ticket" },
]);
export const VENDOR_SOURCES = VENDOR_SOURCE_DEF.values;
export type VendorSource = (typeof VENDOR_SOURCES)[number];
export const VENDOR_SOURCE_LABELS = VENDOR_SOURCE_DEF.labels;
export const VENDOR_SOURCE_ENUM   = VENDOR_SOURCE_DEF.zodEnum;

// vendor_capabilities.stance — `declines` is how "this vendor does not want
// these tickets" is recorded; the ranker hard-excludes it.
const CAPABILITY_STANCE_DEF = defineEnum([
  { id: "offers",   label: "Offers" },
  { id: "declines", label: "Declines" },
]);
export const CAPABILITY_STANCES = CAPABILITY_STANCE_DEF.values;
export type CapabilityStance = (typeof CAPABILITY_STANCES)[number];
export const CAPABILITY_STANCE_LABELS = CAPABILITY_STANCE_DEF.labels;
export const CAPABILITY_STANCE_ENUM   = CAPABILITY_STANCE_DEF.zodEnum;

// vendor_agent_preferences.stance (0191) — one teammate's sticky note on a
// vendor. `preferred` lifts the vendor in THAT teammate's ranking and counts
// toward team sentiment; `avoid` removes it from their ranking and counts
// against. Distinct from CAPABILITY_STANCES, which is what the VENDOR does.
const PREFERENCE_STANCE_DEF = defineEnum([
  { id: "preferred", label: "Preferred" },
  { id: "avoid",     label: "Avoid" },
]);
export const PREFERENCE_STANCES = PREFERENCE_STANCE_DEF.values;
export type PreferenceStance = (typeof PREFERENCE_STANCES)[number];
export const PREFERENCE_STANCE_LABELS = PREFERENCE_STANCE_DEF.labels;
export const PREFERENCE_STANCE_ENUM   = PREFERENCE_STANCE_DEF.zodEnum;

// vendor_engagements.outcome — feeds the reliability signal. `unknown` is the
// default for an open job and for archive rows whose outcome never parsed.
const ENGAGEMENT_OUTCOME_DEF = defineEnum([
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "failed",    label: "Failed" },
  { id: "unknown",   label: "Unknown" },
]);
export const ENGAGEMENT_OUTCOMES = ENGAGEMENT_OUTCOME_DEF.values;
export type EngagementOutcome = (typeof ENGAGEMENT_OUTCOMES)[number];
export const ENGAGEMENT_OUTCOME_LABELS  = ENGAGEMENT_OUTCOME_DEF.labels;
export const ENGAGEMENT_OUTCOME_OPTIONS = ENGAGEMENT_OUTCOME_DEF.options;
export const ENGAGEMENT_OUTCOME_ENUM    = ENGAGEMENT_OUTCOME_DEF.zodEnum;

// ─────────────────────────────────────────────
// TWO category vocabularies. They are different questions and they do NOT
// join — conflating them is the bug this section exists to prevent.
//
//   VENDOR_CATEGORIES  — what a supplier IS.        → vendors.category
//   REQUEST_CATEGORIES — what a REQUEST was filed under.
//                        → vendor_capabilities.category
//                        → vendor_engagements.category
//
// Measured on the real archive: a vendor's own category equals the category of
// the tickets it served only ~29% of the time, and that is CORRECT, not drift.
// A five-star hotel (Hospitality) is booked through Travel tickets; a florist
// (Gifting & Florals) is used on Special Request tickets. Browsing asks the
// first question; the RANKER asks the second, because a request arrives as a
// ticket. Never filter one with the other's values.
//
// Both columns are free text by design (0183) — the loader slugifies whatever
// the extraction emitted, and the label helpers below fall back gracefully so
// a value that is not in these lists still renders as words, never as a raw
// slug and never as a crash.
// ─────────────────────────────────────────────

// vendors.category — the 11 supplier-identity categories the extraction
// assigns. `unclassified` is honest (4,082 vendors), never hidden.
const VENDOR_CATEGORY_DEF = defineEnum([
  { id: "dining",             label: "Dining" },
  { id: "retail",             label: "Retail" },
  { id: "hospitality",        label: "Hospitality" },
  { id: "experiences-events", label: "Experiences & Events" },
  { id: "travel-transport",   label: "Travel & Transport" },
  { id: "gifting-florals",    label: "Gifting & Florals" },
  { id: "health-wellness",    label: "Health & Wellness" },
  { id: "food-beverage",      label: "Food & Beverage" },
  { id: "services",           label: "Services" },
  { id: "logistics",          label: "Logistics" },
  { id: "unclassified",       label: "Unclassified" },
]);
export const VENDOR_CATEGORIES = VENDOR_CATEGORY_DEF.values;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];
export const VENDOR_CATEGORY_LABELS  = VENDOR_CATEGORY_DEF.labels;
export const VENDOR_CATEGORY_OPTIONS = VENDOR_CATEGORY_DEF.options;

// vendor_capabilities.category / vendor_engagements.category — the 8 Freshdesk
// ticket categories. THE ranker's keyspace.
const REQUEST_CATEGORY_DEF = defineEnum([
  { id: "travel",                 label: "Travel" },
  { id: "dining",                 label: "Dining" },
  { id: "retail",                 label: "Retail" },
  { id: "gifting",                label: "Gifting" },
  { id: "events",                 label: "Events" },
  { id: "special-request",        label: "Special Request" },
  { id: "staff-hiring",           label: "Staff Hiring" },
  { id: "indulge-recommendations",label: "Indulge Recommendations" },
]);
export const REQUEST_CATEGORIES = REQUEST_CATEGORY_DEF.values;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];
export const REQUEST_CATEGORY_LABELS  = REQUEST_CATEGORY_DEF.labels;
export const REQUEST_CATEGORY_OPTIONS = REQUEST_CATEGORY_DEF.options;

/**
 * THE category / service key normaliser — "Travel & Transport" →
 * "travel-transport", "Hotel Booking" → "hotel-booking".
 *
 * Both category columns are free text (0183), so the SAME label reaching the DB
 * by two routes must produce the SAME key: the loader slugifies the extraction,
 * and vendor-schema.ts slugifies what a human types. Without one shared rule an
 * edit that retypes "Travel & Transport" silently forks a second category and
 * the vendor drops out of its own filter. Cities are NOT slugified — they are
 * displayed as words and only lower-cased.
 */
export function toVocabularyKey(value: string | null | undefined): string | null {
  const key = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key.length ? key : null;
}

/** Slug → words. Unknown values are title-cased, never shown raw (both columns are free text). */
const titleCase = (slug: string): string =>
  slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export function getVendorCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Unclassified";
  return VENDOR_CATEGORY_LABELS[category as VendorCategory] ?? titleCase(category);
}

/**
 * The category list a picker offers: the 11 built-ins PLUS anything already in
 * use in the database.
 *
 * `vendors.category` has no SQL CHECK — it is free text by design (0183) — so a
 * category someone adds by hand is as real as a built-in one and has to appear
 * in the list for the NEXT vendor. Passing the in-use values in (from
 * `getVendorCategories()`) is what makes an added category stick rather than
 * being a one-off nobody can pick again.
 */
export function vendorCategoryOptions(inUse: readonly string[] = []): { id: string; label: string }[] {
  const seen = new Set<string>(VENDOR_CATEGORIES);
  const extra = inUse
    .filter((c) => c && !seen.has(c))
    .map((c) => ({ id: c, label: getVendorCategoryLabel(c) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Built-ins keep their authored order; anything added sits after them, so the
  // familiar list does not reshuffle as custom categories accumulate.
  return [...VENDOR_CATEGORY_OPTIONS, ...extra];
}

export function getRequestCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Uncategorised";
  return REQUEST_CATEGORY_LABELS[category as RequestCategory] ?? titleCase(category);
}

// The finer service inside a REQUEST category (vendor_capabilities.service /
// vendor_engagements.service). NULL = the whole category — 8 of the 11 request
// categories are only ever used whole, which is why this list is short.
// These are the REAL Freshdesk sub-categories, verified against all 26,079
// capability rows; NO SQL CHECK mirrors them (see the file header), so a new
// one that appears in the data is a one-line edit here.
const VENDOR_SERVICE_DEF = defineEnum([
  // travel
  { id: "experiences",      label: "Experiences" },
  { id: "hotel-booking",    label: "Hotel booking" },
  { id: "car-transfer",     label: "Car transfer" },
  { id: "itinerary",        label: "Itinerary" },
  { id: "flights",          label: "Flights" },
  { id: "airport-protocol", label: "Airport protocol" },
  { id: "visa",             label: "Visa" },
  // retail
  { id: "general",          label: "General" },
  { id: "bag",              label: "Bag" },
  { id: "watch",            label: "Watch" },
]);
export const VENDOR_SERVICES = VENDOR_SERVICE_DEF.values;
export type VendorService = (typeof VENDOR_SERVICES)[number];
export const VENDOR_SERVICE_LABELS  = VENDOR_SERVICE_DEF.labels;
export const VENDOR_SERVICE_OPTIONS = VENDOR_SERVICE_DEF.options;
export const VENDOR_SERVICE_ENUM    = VENDOR_SERVICE_DEF.zodEnum;

/** Which services live under a request category — drives the Find panel's parse. */
export const SERVICES_BY_REQUEST_CATEGORY: Partial<Record<RequestCategory, VendorService[]>> = {
  travel: ["experiences", "hotel-booking", "car-transfer", "itinerary", "flights", "airport-protocol", "visa"],
  retail: ["general", "bag", "watch"],
};

export function getServiceLabel(service: string | null | undefined): string {
  if (!service) return "";
  return VENDOR_SERVICE_LABELS[service as VendorService] ?? titleCase(service);
}

// ─────────────────────────────────────────────
// Reviews — the four MANUAL dimensions (none exist in Freshdesk). Columns on
// vendor_reviews, not a jsonb bag; adding one is a column migration.
// ─────────────────────────────────────────────
export const REVIEW_DIMENSIONS = ["speed", "quality", "pricing", "reliability"] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];
export const REVIEW_DIMENSION_LABELS: Record<ReviewDimension, string> = {
  speed:       "Speed",
  quality:     "Quality",
  pricing:     "Pricing",
  reliability: "Reliability",
};
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

// ─────────────────────────────────────────────
// Scoring — computed per read, never stored (utils/vendor-score.ts).
//
// REVIEWS are the human verdict and work like Google's: many agents each rate
// the same vendor on the four dimensions, the score uses the average across
// all of them, and an agent who rates again after a LATER job adds another
// review rather than replacing their first (only a re-rating of the SAME job
// supersedes). That is the `DISTINCT ON (vendor, reviewer, engagement)` in
// get_vendor_score_inputs. Reviews carry 3.5 — the 1.0 that used to belong to
// a retired per-agent preferred/avoid signal folded into them, because the
// rating IS the opinion now.
//
// Weights sum to 10 so a vendor with every signal maxed scores exactly 10; a
// component with NO data (no decided outcomes / no reviews / no preferences)
// is DROPPED and the remaining weights renormalise — never a fake neutral.
// These move to a config table (the revival_policies pattern) the day someone
// wants to tune them without a deploy.
// ─────────────────────────────────────────────
export const SCORE_WEIGHTS = {
  volume:      2.5, // how often we have used them (in the category / city when asked)
  recency:     1.5, // still an active relationship
  reliability: 2.5, // completed over completed + failed + cancelled
  reviews:     2.5, // avg of the four manual dimensions, across every reviewer
  sentiment:   1.0, // preferred minus avoid, over the teammates who spoke (0191)
} as const;
export type ScoreComponent = keyof typeof SCORE_WEIGHTS;

/** Engagements are windowed to this rolling span; reviews are all-time. */
export const SCORE_WINDOW_MONTHS = 12;
/** Volume saturates here — the 21st job no longer moves the score. */
export const VOLUME_SATURATION = 20;
export const SCORE_MAX = 10;
/**
 * Added to the asking teammate's OWN ranking value for a vendor they marked
 * `preferred` (0191). On the 0–10 scale: enough to lift a preferred vendor over
 * an otherwise-equal one, not enough to put an unused vendor above a proven
 * one. An `avoid` needs no number — it removes the vendor from that answer.
 */
export const PREFERRED_BOOST = 1;

export const RANK_DEFAULT_LIMIT = 5;
export const RANK_MAX_LIMIT = 20;
/** /vendors list page size. Fixed — no page-size selector (the leads rule). */
export const VENDOR_LIST_PAGE_SIZE = 30;
/** Invoices shown on the vendor page before "View all". */
export const VENDOR_INVOICE_PREVIEW = 5;
/** Teammates shown in "Used most by". */
export const VENDOR_TOP_AGENTS = 3;
export const VENDOR_NOTE_MAX_LENGTH = 4000;

export const VENDOR_SEARCH_DEFAULT_LIMIT = 20;
export const VENDOR_SEARCH_MAX_LIMIT = 50;
export const VENDOR_DETAIL_RECENT_ROWS = 20;

// Input bounds (Zod mirrors).
export const VENDOR_MAX_ALIASES = 20;
export const VENDOR_MAX_CONTACTS = 20;
export const VENDOR_MAX_CONTACT_PHONES = 10;
export const VENDOR_MAX_CONTACT_EMAILS = 10;
export const CAPABILITY_MAX_CITIES = 30;
export const ENGAGEMENT_MAX_INVOICES = 20;

/** The private bucket (0184); rows store PATHS, reads mint signed urls. */
export const VENDOR_INVOICE_BUCKET = "vendor-invoices";
export const VENDOR_INVOICE_SIGNED_URL_TTL = 60 * 60; // 1 hour

/** The route revalidated on every vendor write (lands with the Sia UI). */
export const VENDORS_PATH = "/vendors";
