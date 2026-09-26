// Member twin types (migration 0194). Row types come from the generated Database; the page
// shapes are composed here. Vocabulary: constants/member-facets.ts + constants/sia-roles.ts.

import type { Database } from "@/lib/types/database";
import type { AssessmentRisk, MemberSort } from "@/lib/constants/member-assessment";
import type { MemberFacet, FactPolarity, FactSource, MemberTier } from "@/lib/constants/member-facets";
import type { SiaRole } from "@/lib/constants/sia-roles";

export type MemberRow = Database["member"]["Tables"]["members"]["Row"];
export type MemberPersonRow = Database["member"]["Tables"]["member_people"]["Row"];
export type MemberFactRow = Database["member"]["Tables"]["member_facts"]["Row"];
export type MemberRelationRow = Database["member"]["Tables"]["member_relations"]["Row"];
export type MemberEventRow = Database["member"]["Tables"]["member_events"]["Row"];
export type MemberSnapshotRow = Database["member"]["Tables"]["member_snapshot"]["Row"];
export type MemberHealthEventRow = Database["member"]["Tables"]["member_health_events"]["Row"];
export type MemberHealthPolicyRow = Database["member"]["Tables"]["member_health_policy"]["Row"];
export type MemberAnticipationRow = Database["member"]["Tables"]["member_anticipations"]["Row"];
export type QueendomRow = Database["sia"]["Tables"]["queendoms"]["Row"];

export type QueendomSummary = { id: string; name: string; slug: string };

export type MemberListFilters = {
  search: string | null;
  queendom: string | null;        // queendom id
  tier: MemberTier | null;
  status: string | null;          // membership_status
  health: "low" | "mid" | "high" | null;
  unlinked: "whatsapp" | "freshdesk" | "zoho" | "app" | "queendom" | null;
  /** The order (0241): active = Active first then the pulse (default); score = Serene's judgement; name. */
  sort: MemberSort;
  page: number;
};

export type MemberListItem = {
  id: string;
  full_name: string;
  primary_phone: string | null;
  queendom: QueendomSummary | null;
  tier: MemberTier | null;
  membership_status: string | null;
  membership_end: string | null;
  health_score: number | null;
  open_tickets: number;
  last_contact_at: string | null;
  /** The pulse (0241): 0..100 from recency, messages and requests; null until the hourly job has run. */
  activity_score: number | null;
  /** Serene's judgement (0241), when one exists. */
  assessment: { score: number; risk: AssessmentRisk; verdict: string; assessed_at: string } | null;
  linked: { whatsapp: boolean; freshdesk: boolean; zoho: boolean; app: boolean };
};

/** The pulse as member.compute_member_pulse writes it into member_snapshot.data->pulse (0241). */
export type MemberPulse = {
  activity_score: number;
  last_contact_at: string | null;
  last_member_message_at: string | null;
  last_ticket_at: string | null;
  member_messages_30d: number;
  staff_messages_30d: number;
  tickets_90d: number;
  tickets_all: number;
  open_tickets: number;
  escalated_90d: number;
  computed_at: string;
};

/** Serene's judgement of a member (0241), in member_snapshot.data->assessment. */
export type MemberAssessment = {
  score: number;
  engagement: number;
  satisfaction: number;
  value: number;
  risk: AssessmentRisk;
  verdict: string;
  strengths: string[];
  concerns: string[];
  actions: string[];
  confidence: number;
  assessed_at: string;
  run_id: string | null;
  prompt_version: string;
  inputs: { facts: number; events: number; tickets: number; health: number; window_days: number };
};

export type MemberHealth = {
  score: number;
  trend30d: number;
  /** Serene's latest judgement, the baseline the score rests on (0241); null before the first judgement. */
  base: { score: number; at: string; verdict: string; risk: AssessmentRisk } | null;
  reasons: { label: string; delta: number; observed_at: string }[];
  events: (MemberHealthEventRow & { label: string })[];
};

/** A fact as the dossier shows it: the current winner plus who said it and when. */
export type MemberFactView = {
  id: string;
  facet: MemberFacet;
  key: string;
  value: string;
  value_json: unknown | null;
  polarity: FactPolarity;
  source: FactSource;
  confidence: number;
  observed_at: string;
  created_by_name: string | null;
  superseded: boolean;
  /** Every source that says the same thing (the shown row's first); one line on the card, all of them in the tooltip. */
  sources: FactSource[];
  /** The other current rows saying the same thing; "correct" supersedes them too. */
  duplicate_ids: string[];
};

/** What the Observation box gets back: the note as saved and the cards the twin filed. */
export type MemberObservationResult = {
  note: MemberFactRow;
  facts: MemberFactRow[];
  relations: { kind: string; label: string; relation: string }[];
  /** True when the model read the sentence; false when only the note was saved. */
  read: boolean;
  corrected: boolean;
};

/** A mirrored Freshdesk ticket at dossier density. */
export type MemberTicketSummary = {
  id: number;
  subject: string;
  status: number;
  status_label: string | null;
  priority: number;
  category: string | null;
  sub_category: string | null;
  agent_name: string | null;
  fd_created_at: string;
  fd_updated_at: string;
  resolved_at: string | null;
  is_escalated: boolean;
};

export type MemberGroupSummary = {
  group_jid: string;
  subject: string | null;
  member_count: number | null;
  last_message_at: string | null;
  message_count: number;
};

export type MemberTeam = {
  queen: { id: string; full_name: string } | null;
  bishop: { id: string; full_name: string } | null;
  joker: { id: string; full_name: string } | null;
  genies: { id: string; full_name: string; sia_role: SiaRole | null }[];
};

export type MemberDetail = {
  member: MemberRow;
  queendom: QueendomSummary | null;
  team: MemberTeam;
  people: MemberPersonRow[];
  facts: MemberFactView[];
  notes: MemberFactView[];
  health: MemberHealth;
  tickets: { open: MemberTicketSummary[]; recent: MemberTicketSummary[]; total: number };
  group: MemberGroupSummary | null;
  events: MemberEventRow[];
  relations: MemberRelationRow[];
  snapshot: MemberSnapshotRow | null;
  anticipations: MemberAnticipationRow[];
};

export type MemberPickerHit = { id: string; full_name: string; primary_phone: string | null; queendom_name: string | null };

// ─── The vault (0236) ────────────────────────────────────────────────────────

export type MemberVaultKind = "card" | "aadhaar" | "passport" | "pan" | "driving_licence" | "other_id" | "other";

/** One vault item as the card shows it: never the secret. */
export type MemberVaultItem = {
  id: string;
  member_id: string;
  kind: MemberVaultKind;
  label: string;
  hint: string | null;
  expires_on: string | null;
  source: "manual" | "freshdesk_note";
  created_by: string | null;
  created_at: string;
};
