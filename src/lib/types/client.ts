// Client twin types (migration 0194). Row types come from the generated Database; the page
// shapes are composed here. Vocabulary: constants/client-facets.ts + constants/sia-roles.ts.

import type { Database } from "@/lib/types/database";
import type { ClientFacet, FactPolarity, FactSource, ClientTier } from "@/lib/constants/client-facets";
import type { SiaRole } from "@/lib/constants/sia-roles";

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type ClientPersonRow = Database["public"]["Tables"]["client_people"]["Row"];
export type ClientFactRow = Database["public"]["Tables"]["client_facts"]["Row"];
export type ClientRelationRow = Database["public"]["Tables"]["client_relations"]["Row"];
export type ClientEventRow = Database["public"]["Tables"]["client_events"]["Row"];
export type ClientSnapshotRow = Database["public"]["Tables"]["client_snapshot"]["Row"];
export type ClientHealthEventRow = Database["public"]["Tables"]["client_health_events"]["Row"];
export type ClientHealthPolicyRow = Database["public"]["Tables"]["client_health_policy"]["Row"];
export type ClientAnticipationRow = Database["public"]["Tables"]["client_anticipations"]["Row"];
export type QueendomRow = Database["sia"]["Tables"]["queendoms"]["Row"];

export type QueendomSummary = { id: string; name: string; slug: string };

export type ClientListFilters = {
  search: string | null;
  queendom: string | null;        // queendom id
  tier: ClientTier | null;
  status: string | null;          // membership_status
  health: "low" | "mid" | "high" | null;
  unlinked: "whatsapp" | "freshdesk" | "zoho" | "app" | null;
  page: number;
};

export type ClientListItem = {
  id: string;
  full_name: string;
  primary_phone: string | null;
  queendom: QueendomSummary | null;
  tier: ClientTier | null;
  membership_status: string | null;
  membership_end: string | null;
  health_score: number | null;
  open_tickets: number;
  last_contact_at: string | null;
  linked: { whatsapp: boolean; freshdesk: boolean; zoho: boolean; app: boolean };
};

export type ClientHealth = {
  score: number;
  trend30d: number;
  reasons: { label: string; delta: number; observed_at: string }[];
  events: (ClientHealthEventRow & { label: string })[];
};

/** A fact as the dossier shows it: the current winner plus who said it and when. */
export type ClientFactView = {
  id: string;
  facet: ClientFacet;
  key: string;
  value: string;
  value_json: unknown | null;
  polarity: FactPolarity;
  source: FactSource;
  confidence: number;
  observed_at: string;
  created_by_name: string | null;
  superseded: boolean;
};

/** What the Observation box gets back: the note as saved and the cards the twin filed. */
export type ClientObservationResult = {
  note: ClientFactRow;
  facts: ClientFactRow[];
  relations: { kind: string; label: string; relation: string }[];
  /** True when the model read the sentence; false when only the note was saved. */
  read: boolean;
  corrected: boolean;
};

/** A mirrored Freshdesk ticket at dossier density. */
export type ClientTicketSummary = {
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

export type ClientGroupSummary = {
  group_jid: string;
  subject: string | null;
  member_count: number | null;
  last_message_at: string | null;
  message_count: number;
};

export type ClientTeam = {
  queen: { id: string; full_name: string } | null;
  bishop: { id: string; full_name: string } | null;
  joker: { id: string; full_name: string } | null;
  genies: { id: string; full_name: string; sia_role: SiaRole | null }[];
};

export type ClientDetail = {
  client: ClientRow;
  queendom: QueendomSummary | null;
  team: ClientTeam;
  people: ClientPersonRow[];
  facts: ClientFactView[];
  notes: ClientFactView[];
  health: ClientHealth;
  tickets: { open: ClientTicketSummary[]; recent: ClientTicketSummary[]; total: number };
  group: ClientGroupSummary | null;
  events: ClientEventRow[];
  relations: ClientRelationRow[];
  snapshot: ClientSnapshotRow | null;
  anticipations: ClientAnticipationRow[];
};

export type ClientPickerHit = { id: string; full_name: string; primary_phone: string | null; queendom_name: string | null };
