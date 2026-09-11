// Vendors row types — hand-declared until `supabase gen types typescript` is
// re-run after migrations 0183–0185 are applied (the subscription.ts posture).
// Shapes mirror the migrations EXACTLY. Types only — no runtime values.
// The vocabulary (statuses, stances, outcomes, services, dimensions, weights)
// lives in constants/vendors.ts.
import type {
  ReviewDimension,
  VendorStatus,
  VendorCategorySource,
  VendorIdentityStatus,
  VendorSource,
  CapabilityStance,
  PreferenceStance,
  EngagementOutcome,
  ScoreComponent,
} from "@/lib/constants/vendors";

/** One entry of vendors.contacts[] — a null name is the vendor's general line. */
export type VendorContact = {
  name: string | null;
  phones: string[];   // E.164
  emails: string[];
};

/** public.vendors row (migration 0183). */
export type VendorRow = {
  id: string;
  name: string;
  name_key: string;               // GENERATED lower(btrim(name)) — the dedup identity
  aliases: string[];
  category: string | null;        // SERVICE_CATEGORY slug where mapped, else the raw label
  subcategory: string | null;
  category_source: VendorCategorySource | null;
  status: VendorStatus;
  contacts: VendorContact[];
  primary_phone: string | null;   // E.164
  home_city: string | null;
  identity_status: VendorIdentityStatus;
  freshdesk_ref: string | null;
  sources: VendorSource[];
  import_raw: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** public.vendor_capabilities row (migration 0183). Editable config. */
export type VendorCapabilityRow = {
  id: string;
  vendor_id: string;
  category: string;
  service: string | null;         // null = the whole category
  stance: CapabilityStance;
  cities: string[];               // lower-cased; [] = anywhere
  note: string | null;
  set_by: string | null;
  created_at: string;
  updated_at: string;
};

/** public.vendor_engagements row (migration 0185). Append-only. */
export type VendorEngagementRow = {
  id: string;
  vendor_id: string;
  client_id: string | null;
  lead_id: string | null;
  agent_id: string | null;
  agent_name_raw: string | null;
  /**
   * The ticket subject — the sentence someone actually typed. Added to 0185
   * after the type was written, which is why it was missing here: it is THE
   * discriminator inside a flat category (a florist and a nightclub can both
   * sit under Special Request) and what find_vendors_by_history searches.
   */
  title: string | null;
  category: string;
  service: string | null;
  city: string | null;
  source: VendorSource;
  source_ref: string;
  started_at: string;
  closed_at: string | null;
  outcome: EngagementOutcome;
  amount_inr: number | null;
  invoice_paths: string[];        // bucket paths, never urls
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/** public.vendor_reviews row (migration 0185). Append-only. */
export type VendorReviewRow = {
  id: string;
  vendor_id: string;
  engagement_id: string | null;   // null = general review
  reviewer_id: string;
  speed: number | null;           // 1–5
  quality: number | null;
  pricing: number | null;
  reliability: number | null;
  comment: string | null;
  created_at: string;
};

/** public.vendor_notes row (migration 0186). Append-only, newest first. */
export type VendorNoteRow = {
  id: string;
  vendor_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

/** A note with its author's name resolved (the WithAuthor shape). */
export type VendorNoteWithAuthor = VendorNoteRow & { author: { full_name: string } | null };

/**
 * public.vendor_agent_preferences row (migration 0191). EDITABLE — one stance
 * per (vendor, agent); the note is the sticky note.
 */
export type VendorAgentPreferenceRow = {
  id: string;
  vendor_id: string;
  agent_id: string;
  stance: PreferenceStance;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** A preference with its teammate's name resolved. */
export type VendorAgentPreferenceWithAgent = VendorAgentPreferenceRow & { agent_name: string | null };

/** How often a category / a teammate appears in this vendor s history. */
export type VendorCategoryUsage = { category: string; count: number };

/** How often one teammate has used this vendor — the "used most by" row. */
export type VendorAgentUsage = {
  agentId: string;
  name: string;
  count: number;
};

/** One invoice, flattened out of the job it was filed against. */
export type VendorInvoice = {
  engagementId: string;
  /** The vendor's own reference (Freshdesk ticket id / manual ref). */
  ref: string;
  path: string;
  date: string;
  category: string;
  city: string | null;
  amountInr: number | null;
};

/** One row of get_vendor_score_inputs (migration 0185), camel-cased at the Q-18 boundary. */
export type VendorScoreInputs = {
  vendorId: string;
  /** All-time engagement count, unwindowed — the "times used" the UI shows. */
  totalUsed: number;
  engagementCount: number;        // windowed (SCORE_WINDOW_MONTHS)
  categoryCount: number;          // 0 unless a category was asked for
  cityCount: number;              // 0 unless a city was asked for
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  lastStartedAt: string | null;   // null = nothing in the window
  reviewCount: number;            // all-time, latest per (reviewer, engagement)
  avgSpeed: number | null;
  avgQuality: number | null;
  avgPricing: number | null;
  avgReliability: number | null;
  /** Teammates who marked `preferred` / `avoid` (0191) — the sentiment component. */
  preferredCount: number;
  avoidCount: number;
};

/** The computed score — 0–10 plus the reasons a human can read back. */
export type VendorScore = {
  /**
   * The 0–10 verdict, or NULL when nobody has judged this vendor yet.
   *
   * Usage alone is NOT a score. Until a review or a decided job outcome
   * exists, the only quality signals are volume and recency —
   * "we call them a lot" is not "they are good", and showing 9.9 for a vendor
   * no one has ever rated invents a quality verdict out of call frequency.
   * A preferred / avoid mark shapes the RANKING and the reasons, not the verdict.
   * Times-used is displayed beside the ring and says the usage part honestly.
   */
  score: number | null;                           // 0–10, one decimal
  /**
   * The always-present 0–10 ORDERING value over whatever signals exist —
   * history included. The ranker sorts on this (history is genuinely the best
   * available match signal, which is the whole premise of the module); only
   * the DISPLAYED verdict waits for human judgement.
   */
  ranking: number;
  reasons: string[];
  /** Per-component 0–1 signal, null when the component had no data and was dropped. */
  breakdown: Record<ScoreComponent, number | null>;
};

/** One line of rankVendorsForRequest's answer. */
export type RankedVendor = {
  vendor: VendorRow;
  /** null until someone has judged this vendor — see VendorScore.score. */
  score: number | null;
  reasons: string[];
  /** Cautions that did NOT exclude the vendor (recent failures, teammates avoid it, unverified). */
  flags: string[];
};

/** One row of the /vendors list — the spine plus the two derived numbers. */
export type VendorListItem = {
  vendor: VendorRow;
  timesUsed: number;
  /** null when the vendor has never been used — render "—", never a fake 0. */
  score: number | null;
};

/** The vendor page read — everything the three cards need, in one shape. */
export type VendorDetail = {
  vendor: VendorRow;
  capabilities: VendorCapabilityRow[];
  engagements: VendorEngagementRow[];             // newest first, bounded
  reviews: (VendorReviewRow & { reviewer_name: string | null })[];
  notes: VendorNoteWithAuthor[];
  /** Every teammate's stance on this vendor, newest first (0191). */
  preferences: VendorAgentPreferenceWithAgent[];
  invoices: VendorInvoice[];
  topAgents: VendorAgentUsage[];
  /** Ticket categories this vendor has actually been used for, with counts. */
  categoriesUsed: VendorCategoryUsage[];
  /** Per-dimension averages + counts, for the star rows. */
  ratings: { dimension: ReviewDimension; average: number | null; count: number }[];
  reviewerCount: number;
  timesUsed: number;
  score: VendorScore;
};
