// THE person ↔ lead identity seam (migration 0251, 2026-09-29).
//
// One person (a phone) may hold one ACTIVE lead in EACH Gia domain. Every question about
// that identity is answered here and nowhere else:
//
//   findActiveLeadInDomain(phone, domain)  the duplicate check, inside one domain
//   findPreviousLeadId(phone, domain)      the returning-client link, inside one domain
//   getLeadSiblings(viewer, leadId)        the person's OTHER leads (the "Also in" pills)
//   getSharedLeadView(viewer, own, other)  the read-only history of one of those
//   isActiveTwinViolation(error)           the unique index said no (23505)
//
// SECURITY. The RLS policies on leads / lead_notes / lead_activities are unchanged: an
// agent still reads only the leads assigned to him. The two sibling reads use the admin
// client, so THE GATE IS IN THIS FILE and it is one rule:
//
//   you may read a person's lead in another domain only through a lead of the SAME person
//   that you can already open (canAccessLead on the anchor), and the two leads must share
//   a non-empty phone_key. The ids come from the database, never from the browser's word.
//
// What a shared view carries: who owns it, its status, its notes and its timeline. Never
// personal details, never the deal, never the WhatsApp thread. It is read only: no action
// anywhere accepts the sibling as a lead the viewer may write to.
//
// No `server-only` import: the rescue script runs the duplicate check from a laptop.

import { createAdminClient } from "@/lib/supabase/admin";
import { giaDb } from "@/lib/supabase/schemas";
import { canAccessLead } from "@/lib/elaya/access";
import { TERMINAL_LEAD_STATUSES } from "@/lib/constants/lead-statuses";
import type { AppDomain, LeadStatus, UserRole } from "@/lib/types/database";
import type { LeadActivityWithActor, LeadNoteWithAuthor } from "@/lib/services/leads-service";

const PG_UNIQUE_VIOLATION = "23505";
const SIBLING_LIMIT = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The person asking, from their verified profile (Rule 09). */
export type LeadViewer = { userId: string; role: UserRole; domain: AppDomain };

export type ActiveLeadMatch = {
  id: string;
  slug: string | null;
  status: string;
  assigned_to: string | null;
  domain: AppDomain;
};

export type SiblingLead = {
  id: string;
  slug: string | null;
  domain: AppDomain;
  status: LeadStatus;
  ownerName: string | null;
  createdAt: string;
  /** The viewer may open the real dossier (admin, founder, or it is theirs). */
  direct: boolean;
};

export type SharedLeadView = {
  anchor: { id: string; slug: string | null };
  lead: SiblingLead & { name: string; source: string | null; resolutionReason: string | null };
  notes: LeadNoteWithAuthor[];
  activities: LeadActivityWithActor[];
};

type IdentityRow = {
  id: string;
  slug: string | null;
  first_name: string | null;
  last_name: string | null;
  domain: AppDomain;
  status: LeadStatus;
  source: string | null;
  resolution_reason: string | null;
  assigned_to: string | null;
  phone_key: string;
  created_at: string;
  assignee: { full_name: string } | null;
};

const IDENTITY_SELECT =
  "id, slug, first_name, last_name, domain, status, source, resolution_reason, assigned_to, phone_key, created_at, assignee:profiles!leads_assigned_to_fkey(full_name)";

/** The unique index (one active lead per person per domain) refused a write. */
export function isActiveTwinViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === PG_UNIQUE_VIOLATION;
}

/**
 * THE duplicate check: the active lead this phone already holds INSIDE `domain`, or null.
 * A lead of the same person in another domain is not a duplicate.
 */
export async function findActiveLeadInDomain(
  phone: string,
  domain: AppDomain,
): Promise<ActiveLeadMatch | null> {
  if (!phone) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_active_lead_by_phone", {
    p_phone: phone,
    p_domain: domain,
  });
  if (error) {
    console.error("[lead-identity] duplicate check failed:", error.message);
    return null;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    assigned_to: row.assigned_to,
    domain: row.domain,
  };
}

/**
 * THE returning-client link: the newest CLOSED lead (won / lost / junk) of this phone inside
 * `domain`. A closed lead in another domain is not this domain's history; it shows as a pill.
 */
export async function findPreviousLeadId(phone: string, domain: AppDomain): Promise<string | null> {
  const key = phone.replace(/[^0-9]/g, "");
  if (!key) return null;
  const admin = createAdminClient();
  const { data } = await giaDb(admin)
    .from("leads")
    .select("id")
    .eq("phone_key", key)
    .eq("domain", domain)
    .is("archived_at", null)
    .in("status", [...TERMINAL_LEAD_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function readIdentityRow(ref: string): Promise<IdentityRow | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const admin = createAdminClient();
  const { data } = await giaDb(admin)
    .from("leads")
    .select(IDENTITY_SELECT)
    .eq(UUID_RE.test(trimmed) ? "id" : "slug", trimmed)
    .is("archived_at", null)
    .maybeSingle();
  return (data as unknown as IdentityRow | null) ?? null;
}

function toSibling(viewer: LeadViewer, row: IdentityRow): SiblingLead {
  return {
    id: row.id,
    slug: row.slug,
    domain: row.domain,
    status: row.status,
    ownerName: row.assignee?.full_name ?? null,
    createdAt: row.created_at,
    direct: canAccessLead(viewer, row),
  };
}

/**
 * The OTHER leads of the person behind `leadId`: another domain, or an earlier lead in the
 * same one. Empty when the viewer cannot open `leadId`, or the lead has no phone.
 */
export async function getLeadSiblings(viewer: LeadViewer, leadId: string): Promise<SiblingLead[]> {
  const anchor = await readIdentityRow(leadId);
  if (!anchor || !anchor.phone_key) return [];
  if (!canAccessLead(viewer, anchor)) return [];

  const admin = createAdminClient();
  const { data, error } = await giaDb(admin)
    .from("leads")
    .select(IDENTITY_SELECT)
    .eq("phone_key", anchor.phone_key)
    .neq("id", anchor.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(SIBLING_LIMIT);
  if (error || !data) return [];

  return (data as unknown as IdentityRow[]).map((row) => toSibling(viewer, row));
}

/**
 * The read-only history of a sibling lead, reached THROUGH a lead the viewer can open.
 * null = not found, not the same person, or the viewer cannot open the anchor.
 */
export async function getSharedLeadView(
  viewer: LeadViewer,
  anchorRef: string,
  siblingRef: string,
): Promise<SharedLeadView | null> {
  const [anchor, sibling] = await Promise.all([
    readIdentityRow(anchorRef),
    readIdentityRow(siblingRef),
  ]);
  if (!anchor || !sibling) return null;
  if (!canAccessLead(viewer, anchor)) return null;
  if (anchor.id === sibling.id) return null;
  if (!anchor.phone_key || anchor.phone_key !== sibling.phone_key) return null;

  const admin = createAdminClient();
  const [notes, activities] = await Promise.all([
    giaDb(admin)
      .from("lead_notes")
      .select("*, author:profiles!lead_notes_author_id_fkey(full_name)")
      .eq("lead_id", sibling.id)
      .order("created_at", { ascending: false }),
    giaDb(admin)
      .from("lead_activities")
      .select("*, actor:profiles!lead_activities_actor_id_fkey(full_name)")
      .eq("lead_id", sibling.id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    anchor: { id: anchor.id, slug: anchor.slug },
    lead: {
      ...toSibling(viewer, sibling),
      name: [sibling.first_name, sibling.last_name].filter(Boolean).join(" "),
      source: sibling.source,
      resolutionReason: sibling.resolution_reason,
    },
    notes: (notes.data ?? []) as unknown as LeadNoteWithAuthor[],
    activities: (activities.data ?? []) as unknown as LeadActivityWithActor[],
  };
}
