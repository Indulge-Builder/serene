// clients-service.ts — ALL /clients reads (migration 0194, client-ticket-plan.md 5.9).
//
// The list and the dossier read on the SESSION client, so RLS (client_visible: the whole
// queendom, admin, founder) is the boundary — no caller-supplied scope. Two slices come from
// service-role schemas through their own homes: the mirrored tickets (freshdesk-service) and
// the WhatsApp group (sia-service); both are keyed by a client id the caller already passed
// the RLS gate for.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import { computeHealthScore, CLIENT_FACETS, type ClientFacet, type ClientTier } from "@/lib/constants/client-facets";
import { CLIENTS_LIST_PAGE_SIZE } from "@/lib/constants/sia-roles";
import { getFreshdeskTicketsForClient } from "@/lib/services/freshdesk-service";
import { getSiaGroupForClient } from "@/lib/services/sia-service";
import { freshdeskDb } from "@/lib/services/freshdesk-sync";
import type {
  ClientDetail,
  ClientFactView,
  ClientHealth,
  ClientListFilters,
  ClientListItem,
  ClientPickerHit,
  ClientRow,
  ClientTeam,
  QueendomSummary,
  ClientHealthEventRow,
  ClientHealthPolicyRow,
  ClientFactRow,
} from "@/lib/types/client";

// ─── Queendoms ───────────────────────────────────────────────────────────────

export const getQueendoms = cache(async (): Promise<QueendomSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("sia").from("queendoms").select("id, name, slug").eq("is_active", true).order("name");
  if (error) {
    console.error("[clients-service] queendoms read failed", error.message);
    return [];
  }
  return mapRows<QueendomSummary, QueendomSummary>(data, (r) => r);
});

// ─── Health ──────────────────────────────────────────────────────────────────

const getHealthPolicy = cache(async (): Promise<Map<string, ClientHealthPolicyRow>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("client_health_policy").select("*");
  const m = new Map<string, ClientHealthPolicyRow>();
  mapRows<ClientHealthPolicyRow, void>(data, (r) => { m.set(r.signal, r); });
  return m;
});

function buildHealth(events: ClientHealthEventRow[], policy: Map<string, ClientHealthPolicyRow>): ClientHealth {
  const withHalf = events.map((e) => ({ delta: Number(e.delta), observed_at: e.observed_at, half_life_days: policy.get(e.signal)?.half_life_days ?? 60 }));
  const now = new Date();
  const score = computeHealthScore(withHalf, now);
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const scoreThen = computeHealthScore(withHalf.filter((e) => new Date(e.observed_at) <= thirtyAgo), thirtyAgo);
  const reasons = [...events]
    .sort((a, b) => Math.abs(Number(b.delta)) - Math.abs(Number(a.delta)) || (a.observed_at < b.observed_at ? 1 : -1))
    .slice(0, 3)
    .map((e) => ({ label: e.note ?? policy.get(e.signal)?.label ?? e.signal, delta: Number(e.delta), observed_at: e.observed_at }));
  return { score, trend30d: score - scoreThen, reasons, events: events.map((e) => ({ ...e, label: policy.get(e.signal)?.label ?? e.signal })) };
}

async function healthScoresFor(clientIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  const supabase = await createClient();
  const [{ data }, policy] = await Promise.all([
    supabase.from("client_health_events").select("client_id, signal, delta, observed_at").in("client_id", clientIds).limit(5000),
    getHealthPolicy(),
  ]);
  const byClient = new Map<string, { delta: number; observed_at: string; half_life_days: number }[]>();
  mapRows<{ client_id: string; signal: string; delta: number; observed_at: string }, void>(data, (r) => {
    const arr = byClient.get(r.client_id) ?? [];
    arr.push({ delta: Number(r.delta), observed_at: r.observed_at, half_life_days: policy.get(r.signal)?.half_life_days ?? 60 });
    byClient.set(r.client_id, arr);
  });
  for (const id of clientIds) {
    const evs = byClient.get(id);
    out.set(id, evs && evs.length ? computeHealthScore(evs) : Number.NaN);
  }
  return out;
}

// ─── The list ────────────────────────────────────────────────────────────────

const LIST_COLUMNS = "id, full_name, primary_phone, queendom_id, tier, membership_status, membership_end, freshdesk_contact_id, zoho_customer_id, app_member_id, wa_invite_link, updated_at";

function searchToken(q: string): string {
  return q.replace(/[,()"'\\%]/g, " ").trim();
}

export async function listClients(filters: ClientListFilters): Promise<{ clients: ClientListItem[]; totalCount: number }> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page);
  const from = (page - 1) * CLIENTS_LIST_PAGE_SIZE;
  const to = from + CLIENTS_LIST_PAGE_SIZE - 1;

  let q = supabase.from("clients").select(LIST_COLUMNS, { count: "exact" });
  if (filters.queendom) q = q.eq("queendom_id", filters.queendom);
  if (filters.tier) q = q.eq("tier", filters.tier);
  if (filters.status) q = q.eq("membership_status", filters.status);
  if (filters.unlinked === "whatsapp") q = q.is("wa_invite_link", null);
  if (filters.unlinked === "freshdesk") q = q.is("freshdesk_contact_id", null);
  if (filters.unlinked === "zoho") q = q.is("zoho_customer_id", null);
  if (filters.unlinked === "app") q = q.is("app_member_id", null);
  if (filters.search) {
    const token = searchToken(filters.search);
    if (token) q = q.or(`full_name.ilike.%${token}%,primary_phone.ilike.%${token.replace(/\s+/g, "")}%`);
  }
  q = q.order("full_name", { ascending: true }).range(from, to);

  const [{ data, error, count }, queendoms] = await Promise.all([q, getQueendoms()]);
  if (error) {
    console.error("[clients-service] list failed", error.message);
    return { clients: [], totalCount: 0 };
  }
  type Row = Pick<ClientRow, "id" | "full_name" | "primary_phone" | "queendom_id" | "tier" | "membership_status" | "membership_end" | "freshdesk_contact_id" | "zoho_customer_id" | "app_member_id" | "wa_invite_link" | "updated_at">;
  const rows = mapRows<Row, Row>(data, (r) => r);
  const ids = rows.map((r) => r.id);
  const qd = new Map(queendoms.map((x) => [x.id, x]));

  // Open ticket counts and last contact from the mirror, one query for the page (service role,
  // keyed by ids the caller already passed RLS for).
  const openCounts = new Map<string, number>();
  const lastContact = new Map<string, string>();
  if (ids.length) {
    const fd = freshdeskDb();
    const { data: t } = await fd.from("tickets").select("client_id, status, fd_updated_at").in("client_id", ids).eq("deleted", false).limit(5000);
    mapRows<{ client_id: string; status: number; fd_updated_at: string }, void>(t, (r) => {
      if (r.status !== 4 && r.status !== 5) openCounts.set(r.client_id, (openCounts.get(r.client_id) ?? 0) + 1);
      const prev = lastContact.get(r.client_id);
      if (!prev || r.fd_updated_at > prev) lastContact.set(r.client_id, r.fd_updated_at);
    });
  }
  const health = await healthScoresFor(ids);

  let clients: ClientListItem[] = rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    primary_phone: r.primary_phone,
    queendom: r.queendom_id ? (qd.get(r.queendom_id) ?? null) : null,
    tier: (r.tier as ClientTier | null) ?? null,
    membership_status: r.membership_status,
    membership_end: r.membership_end,
    health_score: Number.isNaN(health.get(r.id)) ? null : (health.get(r.id) ?? null),
    open_tickets: openCounts.get(r.id) ?? 0,
    last_contact_at: lastContact.get(r.id) ?? null,
    linked: {
      whatsapp: Boolean(r.wa_invite_link),
      freshdesk: Boolean(r.freshdesk_contact_id),
      zoho: Boolean(r.zoho_customer_id),
      app: Boolean(r.app_member_id),
    },
  }));
  // The health band is a post-filter on the page (scores are computed, not stored).
  if (filters.health) {
    clients = clients.filter((c) => {
      if (c.health_score == null) return false;
      if (filters.health === "low") return c.health_score < 50;
      if (filters.health === "mid") return c.health_score >= 50 && c.health_score < 75;
      return c.health_score >= 75;
    });
  }
  return { clients, totalCount: Number(count ?? 0) };
}

/** The picker behind "link this group to a client" (Sia panel) and the search box. */
export async function searchClientsForPicker(q: string, limit = 8): Promise<ClientPickerHit[]> {
  const token = searchToken(q);
  if (!token) return [];
  const supabase = await createClient();
  const [{ data }, queendoms] = await Promise.all([
    supabase.from("clients").select("id, full_name, primary_phone, queendom_id")
      .or(`full_name.ilike.%${token}%,primary_phone.ilike.%${token.replace(/\s+/g, "")}%`)
      .order("full_name").limit(limit),
    getQueendoms(),
  ]);
  const qd = new Map(queendoms.map((x) => [x.id, x.name]));
  return mapRows<{ id: string; full_name: string; primary_phone: string | null; queendom_id: string | null }, ClientPickerHit>(
    data, (r) => ({ id: r.id, full_name: r.full_name, primary_phone: r.primary_phone, queendom_name: r.queendom_id ? (qd.get(r.queendom_id) ?? null) : null }),
  );
}

// ─── The dossier ─────────────────────────────────────────────────────────────

async function getTeam(queendomId: string | null): Promise<ClientTeam> {
  const empty: ClientTeam = { queen: null, bishop: null, joker: null, genies: [] };
  if (!queendomId) return empty;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, sia_role").eq("queendom_id", queendomId).eq("is_active", true).order("full_name");
  const team: ClientTeam = { ...empty, genies: [] };
  mapRows<{ id: string; full_name: string; sia_role: string | null }, void>(data, (p) => {
    const person = { id: p.id, full_name: p.full_name };
    if (p.sia_role === "queen") team.queen = person;
    else if (p.sia_role === "bishop") team.bishop = person;
    else if (p.sia_role === "joker") team.joker = person;
    else team.genies.push({ ...person, sia_role: (p.sia_role as ClientTeam["genies"][number]["sia_role"]) ?? null });
  });
  return team;
}

/**
 * Two sources saying the same thing (the Atlas profile and the onboarding form both say
 * "Badminton") are one fact with two witnesses, not two facts. Group current rows by
 * facet + key + value (case-insensitive) + polarity; keep the most confident (then newest)
 * as the row, list every source, and remember the other ids so a correction retires them all.
 */
function collapseAgreeingFacts(facts: ClientFactView[]): ClientFactView[] {
  const groups = new Map<string, ClientFactView[]>();
  for (const f of facts) {
    const k = `${f.facet}|${f.key}|${f.value.trim().toLowerCase()}|${f.polarity}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const out: ClientFactView[] = [];
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => b.confidence - a.confidence || b.observed_at.localeCompare(a.observed_at));
    const [head, ...rest] = sorted;
    out.push({
      ...head,
      sources: [...new Set(sorted.map((x) => x.source))],
      duplicate_ids: rest.map((x) => x.id),
    });
  }
  return out.sort((a, b) => b.observed_at.localeCompare(a.observed_at));
}

/** The client's queendom, for the access check in every client action. Null when the client does not exist. */
export async function clientQueendom(clientId: string): Promise<{ exists: boolean; queendom_id: string | null }> {
  const { data } = await createAdminClient().from("clients").select("queendom_id").eq("id", clientId).maybeSingle();
  return data ? { exists: true, queendom_id: (data as { queendom_id: string | null }).queendom_id } : { exists: false, queendom_id: null };
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const supabase = await createClient();
  const { data: client, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (error) {
    console.error("[clients-service] client read failed", error.message);
    return null;
  }
  if (!client) return null;
  const c = client as ClientRow;

  const [queendoms, team, people, factsRes, healthRes, policy, tickets, group, events, relations, snapshot, anticipations] = await Promise.all([
    getQueendoms(),
    getTeam(c.queendom_id),
    supabase.from("client_people").select("*").eq("client_id", clientId).order("relation").order("name"),
    supabase.from("client_facts").select("*, created_by_profile:profiles!client_facts_created_by_fkey(full_name)").eq("client_id", clientId).is("superseded_by", null).order("observed_at", { ascending: false }).limit(1000),
    supabase.from("client_health_events").select("*").eq("client_id", clientId).order("observed_at", { ascending: false }).limit(500),
    getHealthPolicy(),
    getFreshdeskTicketsForClient(clientId),
    getSiaGroupForClient(clientId),
    supabase.from("client_events").select("*").eq("client_id", clientId).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("client_relations").select("*").eq("client_id", clientId).order("strength", { ascending: false }).limit(100),
    supabase.from("client_snapshot").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("client_anticipations").select("*").eq("client_id", clientId).in("status", ["pending", "surfaced"]).order("due_at").limit(20),
  ]);

  type FactJoined = ClientFactRow & { created_by_profile: { full_name: string } | null };
  const allFacts = mapRows<FactJoined, ClientFactView>(factsRes.data, (f) => ({
    id: f.id,
    facet: f.facet as ClientFacet,
    key: f.key,
    value: f.value,
    value_json: f.value_json,
    polarity: f.polarity as ClientFactView["polarity"],
    source: f.source as ClientFactView["source"],
    confidence: Number(f.confidence),
    observed_at: f.observed_at,
    created_by_name: f.created_by_profile?.full_name ?? null,
    superseded: false,
    sources: [f.source as ClientFactView["source"]],
    duplicate_ids: [],
  }));
  const validFacets = new Set<string>(CLIENT_FACETS.values);
  const facts = collapseAgreeingFacts(allFacts.filter((f) => f.facet !== "note" && validFacets.has(f.facet)));
  const notes = allFacts.filter((f) => f.facet === "note");

  return {
    client: c,
    queendom: c.queendom_id ? (queendoms.find((q) => q.id === c.queendom_id) ?? null) : null,
    team,
    people: mapRows(people.data, (r) => r as ClientDetail["people"][number]),
    facts,
    notes,
    health: buildHealth(mapRows<ClientHealthEventRow, ClientHealthEventRow>(healthRes.data, (r) => r), policy),
    tickets,
    group,
    events: mapRows(events.data, (r) => r as ClientDetail["events"][number]),
    relations: mapRows(relations.data, (r) => r as ClientDetail["relations"][number]),
    snapshot: (snapshot.data as ClientDetail["snapshot"]) ?? null,
    anticipations: mapRows(anticipations.data, (r) => r as ClientDetail["anticipations"][number]),
  };
}
