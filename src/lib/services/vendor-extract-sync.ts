// vendor-extract-sync.ts — SERVER ONLY. THE cycle that keeps the vendor tables
// current from the Freshdesk mirror.
//
// It calls Freshdesk NOT AT ALL. The mirror (0193) already pulls every ticket,
// note and attachment every minute and is the account's priority consumer of the
// 50-calls-a-minute budget; a second poller would fight it for that budget to
// re-fetch bytes we already hold. This reads `freshdesk.conversations`, which is
// free, and can therefore re-read history whenever the rules improve.
//
// THE QUEUE is `vendor_extracted_at IS NULL` on the conversation row (0213) —
// the same NULL-as-flag shape the mirror already uses for `conversations_synced_at`
// and `media_synced_at`. Marked once, preserved forever: the model read is the
// only billed step, so re-clearing that column re-bills the whole thread.
//
// WHAT IT WRITES, and through what
// Nothing here touches a vendor table directly. Every write goes through the
// cores in vendor-mutations.ts (R-01) — the same functions the /vendors form and
// Elaya call — so a synced vendor is the same shape as a typed one. The cores
// were extended (not copied) on 2026-09-17 to carry provenance: `source:'ticket'`,
// the ticket id as `source_ref`, `identity_status:'unverified'`.
//
// IDEMPOTENT by key, not by luck. `(vendor_id, source, source_ref)` is UNIQUE on
// the ledger, and source_ref is the Freshdesk ticket id, so a ticket read twice
// refines one engagement row rather than minting a second.
import { createAdminClient } from "@/lib/supabase/admin";
import { freshdeskDb, getSyncState, setSyncState } from "@/lib/services/freshdesk-sync";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { extractVendorsFromNote, type ExtractedVendor } from "@/lib/services/vendor-extract";
import { searchVendors } from "@/lib/services/vendors-service";
import { createVendorCore, logEngagementCore, upsertCapabilityCore } from "@/lib/services/vendor-mutations";
import { updateVendorCore } from "@/lib/services/vendor-mutations";
import { normalizeToE164 } from "@/lib/utils/phone";
import { sanitizeText } from "@/lib/utils/sanitize";
import { FRESHDESK_ATTACHMENT_BUCKET } from "@/lib/constants/freshdesk";
import {
  EXTRACT_CONCURRENCY,
  EXTRACT_FILE_MAX_BYTES,
  EXTRACT_FILES_PER_NOTE,
  EXTRACT_MATCH_MIN_SIMILARITY,
  EXTRACT_MIN_FUZZY_NAME_CHARS,
  EXTRACT_NOTES_PER_CYCLE,
  EXTRACT_SYNC_KEY,
  EXTRACT_TICKET_CONTEXT_ROWS,
  toVocabularyKey,
} from "@/lib/constants/vendors";
import type { LlmFilePart } from "@/lib/elaya/provider";
import type { FdAttachment } from "@/lib/types/freshdesk";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { VendorRow } from "@/lib/types/vendor";

const LOG = "[vendor-extract-sync]";

/** The media types the provider can actually show a model (provider.ts LlmFilePart). */
const READABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export type ExtractCycleStats = {
  notesRead: number;
  notesSkipped: number;
  notesFailed: number;
  filesRead: number;
  vendorsCreated: number;
  vendorsMatched: number;
  engagementsWritten: number;
  capabilitiesWritten: number;
  duplicatesFlagged: number;
};

// ─── The queue ────────────────────────────────────────────────────────────────

type QueuedNote = {
  id: number;
  ticket_id: number;
  body_text: string | null;
  body_html: string | null;
  attachments: FdAttachment[];
  fd_created_at: string;
};

/** Oldest first: a ticket's notes must be read in the order they were written. */
async function claimNotes(limit: number): Promise<QueuedNote[]> {
  const { data, error } = await freshdeskDb()
    .from("conversations")
    .select("id, ticket_id, body_text, body_html, attachments, fd_created_at")
    .is("vendor_extracted_at", null)
    .order("fd_created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error(`${LOG} queue read failed:`, error.message);
    return [];
  }
  return (data ?? []) as unknown as QueuedNote[];
}

async function markRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await freshdeskDb()
    .from("conversations")
    .update({ vendor_extracted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) console.error(`${LOG} marking notes read failed:`, error.message);
}

// ─── The ticket's own facts (free — already mirrored) ────────────────────────

type TicketFacts = {
  id: number;
  subject: string | null;
  category: string | null;
  sub_category: string | null;
  /** Renamed from client_id by 0211 (clients became member.members). */
  member_id: string | null;
  responder_id: number | null;
  status: number | null;
  fd_created_at: string;
};

async function readTickets(ids: number[]): Promise<Map<number, TicketFacts>> {
  const out = new Map<number, TicketFacts>();
  if (ids.length === 0) return out;
  const { data, error } = await freshdeskDb()
    .from("tickets")
    .select("id, subject, category, sub_category, member_id, responder_id, status, fd_created_at")
    .in("id", ids);
  if (error) {
    console.error(`${LOG} ticket read failed:`, error.message);
    return out;
  }
  for (const t of (data ?? []) as unknown as TicketFacts[]) out.set(t.id, t);
  return out;
}

/**
 * The Freshdesk agent who owns the ticket, as a Serene profile id when they have
 * one. Ex-staff and unmapped agents keep their NAME on the row instead (the 0185
 * contract) rather than the job losing its owner.
 */
async function resolveAgents(responderIds: number[]): Promise<Map<number, { profileId: string | null; name: string | null }>> {
  const out = new Map<number, { profileId: string | null; name: string | null }>();
  const ids = [...new Set(responderIds.filter((n): n is number => Number.isFinite(n)))];
  if (ids.length === 0) return out;
  const { data, error } = await freshdeskDb().from("agents").select("id, name, email").in("id", ids);
  if (error) {
    console.error(`${LOG} agent read failed:`, error.message);
    return out;
  }
  const agents = (data ?? []) as unknown as { id: number; name: string | null; email: string | null }[];
  const emails = agents.map((a) => a.email).filter((e): e is string => Boolean(e));
  const byEmail = new Map<string, string>();
  if (emails.length) {
    const { data: profiles } = await createAdminClient().from("profiles").select("id, email").in("email", emails);
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      if (p.email) byEmail.set(p.email.toLowerCase(), p.id);
    }
  }
  for (const a of agents) {
    out.set(a.id, { profileId: (a.email && byEmail.get(a.email.toLowerCase())) ?? null, name: a.name });
  }
  return out;
}

// ─── Files ───────────────────────────────────────────────────────────────────

/**
 * Read a note's attachments back out of the mirror's private bucket as bytes.
 * They were downloaded once by the mirror (0197) — nothing is fetched from
 * Freshdesk here, and nothing new is stored.
 */
async function readFiles(atts: FdAttachment[]): Promise<{ files: LlmFilePart[]; skipped: number }> {
  const storage = createAdminClient().storage.from(FRESHDESK_ATTACHMENT_BUCKET);
  const files: LlmFilePart[] = [];
  let skipped = 0;
  const usable = atts.filter((a) => a.storage_path && READABLE.has(a.content_type ?? ""));
  for (const a of usable.slice(0, EXTRACT_FILES_PER_NOTE)) {
    if ((a.size ?? 0) > EXTRACT_FILE_MAX_BYTES) { skipped++; continue; }
    try {
      const { data, error } = await storage.download(a.storage_path as string);
      if (error || !data) { skipped++; continue; }
      const bytes = Buffer.from(await data.arrayBuffer());
      if (bytes.byteLength > EXTRACT_FILE_MAX_BYTES) { skipped++; continue; }
      files.push({ mediaType: a.content_type as string, dataBase64: bytes.toString("base64") });
    } catch {
      // One unreadable file never stalls a note, let alone a run.
      skipped++;
    }
  }
  skipped += Math.max(0, usable.length - EXTRACT_FILES_PER_NOTE);
  return { files, skipped };
}

// ─── Matching: is this a vendor we already have? ─────────────────────────────

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The distinctive core of a company name, with the legal form stripped.
 *
 * An invoice writes the registered name and a person writes the trading name:
 * "MAKEMYTRIP (INDIA) LIMITED" on a tax invoice is the row already in the table
 * as "MakeMyTrip (India) Private Limited" with 275 jobs. Squashed whole they do
 * not match -- "private" sits in the middle of one and not the other -- so the
 * extractor created a second MakeMyTrip on its first real run. Stripping the
 * form words leaves "makemytrip" on both sides and they meet.
 *
 * Only the form is removed, never a word that could distinguish two suppliers.
 */
const LEGAL_FORM = /\b(private|pvt|limited|ltd|llp|llc|inc|incorporated|corporation|corp|company|co|gmbh|sa|bv|plc|holdings|group|international|enterprises)\b/g;
const legalCore = (name: string) => squash(name.toLowerCase().replace(LEGAL_FORM, " "));

/**
 * Find the existing vendor a name refers to, or null to create one.
 *
 * Order is deliberate and each tier is a fact, not a guess:
 *   1. the phone, when it belongs to exactly ONE vendor. A shared switchboard is
 *      no evidence at all — one number is the primary_phone of 39 rows here.
 *   2. the exact name, or an exact alias. `name_key` is UNIQUE, so this is exact.
 *   3. a close name, ONLY for names long enough to be distinctive and only when
 *      a single candidate clears the bar.
 *
 * What it will NOT do is fuzzy-match a short or person-shaped name. The vendor
 * table holds rows called "Nudged", "Local", "Frame" and "Flowers", and the
 * historical dedup found that one character between Indian first names means a
 * different person, not a typo (Akshay / Lakshay / Akshaya).
 */
async function matchVendor(
  name: string | null,
  phones: string[],
): Promise<{ vendor: VendorRow | null; how: "phone" | "exact" | "legal-form" | "fuzzy" | null; nearMisses: string[] }> {
  const admin = createAdminClient();
  const nearMisses: string[] = [];

  for (const raw of phones) {
    let e164: string | null = null;
    try { e164 = normalizeToE164(raw); } catch { e164 = null; }
    if (!e164) continue;
    const { data } = await admin.from("vendors").select("*").eq("primary_phone", e164).limit(2);
    const hits = (data ?? []) as unknown as VendorRow[];
    if (hits.length === 1) return { vendor: hits[0], how: "phone", nearMisses };
    // 2+ hits: a shared line. It identifies nobody, so it is not used.
  }

  if (!name) return { vendor: null, how: null, nearMisses };
  const key = name.trim().toLowerCase();
  const { data: exact } = await admin.from("vendors").select("*").eq("name_key", key).maybeSingle();
  if (exact) return { vendor: exact as unknown as VendorRow, how: "exact", nearMisses };

  const { data: aliased } = await admin.from("vendors").select("*").contains("aliases", [name.trim()]).limit(2);
  const aliasHits = (aliased ?? []) as unknown as VendorRow[];
  if (aliasHits.length === 1) return { vendor: aliasHits[0], how: "exact", nearMisses };

  // The registered name meeting the trading name. An EXACT match once both are
  // reduced to their distinctive core is a fact, not a guess -- so it sits above
  // the fuzzy tier and is not subject to the length floor in the same way.
  const core = legalCore(name);
  if (core.length >= 6) {
    for (const c of await searchVendors({ query: name, limit: 8 })) {
      if (legalCore(c.name) === core) return { vendor: c, how: "legal-form", nearMisses };
    }
  }

  if (squash(name).length < EXTRACT_MIN_FUZZY_NAME_CHARS) return { vendor: null, how: null, nearMisses };

  // search_vendors (0187) already handles spacing and typos; it is the same
  // engine the list search uses, so a match here means a person searching would
  // have found the same row.
  const candidates = await searchVendors({ query: name, limit: 5 });
  const squashed = squash(name);
  const close = candidates.filter((c) => {
    const cs = squash(c.name);
    if (cs === squashed) return true;
    const longer = cs.length >= squashed.length ? cs : squashed;
    const shorter = cs.length >= squashed.length ? squashed : cs;
    if (!longer.includes(shorter)) return false;
    return shorter.length / longer.length >= EXTRACT_MATCH_MIN_SIMILARITY;
  });
  if (close.length === 1) return { vendor: close[0], how: "fuzzy", nearMisses };

  // Nothing met the bar, but something LOOKED close. Never fused on that -- a
  // wrong merge destroys history and nothing catches it -- but recorded on the
  // new row, so the duplicate report has a thread to pull. "Porter 2 Wheeler"
  // beside a "Porter" with 206 jobs is the shape: probably the same company,
  // not certain enough for a machine to decide.
  //
  // Only a name that CONTAINS ours, or is contained BY ours, counts. The search
  // returns trigram neighbours, and a neighbour is not a near miss: it offered
  // "Treebo Regency - Hotel near Dhole Patil Road" for "Rohan Patil" on the
  // strength of one shared surname. A flag that cries wolf is worse than no flag,
  // because the person reading the duplicate report stops reading it.
  for (const c of candidates) {
    const them = legalCore(c.name);
    if (them.length < 5 || core.length < 5) continue;
    if (them.startsWith(core) || core.startsWith(them)) nearMisses.push(c.name);
    if (nearMisses.length >= 3) break;
  }
  return { vendor: null, how: null, nearMisses };
}

// ─── Writing one finding ─────────────────────────────────────────────────────

/** A machine actor still needs an identity for the cores; the ticket's agent is it. */
function actorFor(profileId: string | null): MutationActor {
  return {
    userId: profileId ?? "",
    role: "admin",
    domain: "concierge",
    fullName: "Freshdesk sync",
  };
}

const OUTCOME_BY_STATUS: Record<number, "completed" | "unknown"> = { 4: "completed", 5: "completed" };

async function writeFinding(
  found: ExtractedVendor,
  ticket: TicketFacts,
  agent: { profileId: string | null; name: string | null } | undefined,
  stats: ExtractCycleStats,
): Promise<string | null> {
  const actor = actorFor(agent?.profileId ?? null);
  const phonesE164 = found.phones
    .map((p) => { try { return normalizeToE164(p); } catch { return null; } })
    .filter((p): p is string => Boolean(p));

  const { vendor: matched, how, nearMisses } = await matchVendor(found.name, found.phones);
  let vendorId: string;

  if (matched) {
    stats.vendorsMatched++;
    vendorId = matched.id;
    // A new spelling becomes an alias, so the NEXT time it arrives the match is
    // exact rather than fuzzy. The problem shrinks with use instead of growing.
    if (found.name && squash(found.name) !== squash(matched.name) && !matched.aliases.some((a) => squash(a) === squash(found.name as string))) {
      await updateVendorCore(actor, { id: matched.id, aliases: [...matched.aliases, found.name.trim()] } as never);
    }
    // A phone learned later that points at a DIFFERENT existing vendor is a
    // possible duplicate. It is flagged, never auto-merged: merging is the
    // decision that destroyed history last time, and the dedupe tool owns it.
    if (how !== "phone" && phonesE164.length && !matched.primary_phone) {
      const { data: byPhone } = await createAdminClient()
        .from("vendors").select("id").eq("primary_phone", phonesE164[0]).neq("id", matched.id).limit(1);
      if ((byPhone ?? []).length) stats.duplicatesFlagged++;
      else await updateVendorCore(actor, { id: matched.id, primary_phone: phonesE164[0] } as never);
    }
  } else {
    if (!found.name) return null;                    // a detail with no owner — parked, see the caller
    const created = await createVendorCore(
      actor,
      {
        name: sanitizeText(found.name).slice(0, 200),
        aliases: [],
        category: found.category,
        subcategory: null,
        category_source: found.category ? "rule" : "unresolved",
        contacts: found.contactName || phonesE164.length || found.emails.length
          ? [{ name: found.contactName ? sanitizeText(found.contactName) : null, phones: phonesE164, emails: found.emails.map((e) => e.toLowerCase()) }]
          : [],
        primary_phone: phonesE164[0] ?? null,
        home_city: found.city ? toVocabularyKey(found.city) : null,
        notes: null,
      } as never,
      {
        source: "ticket",
        evidence: {
          ticket_id: ticket.id,
          quote: found.evidence,
          read_at: new Date().toISOString(),
          // Existing rows that looked close but did not meet the bar. The
          // duplicate report reads this; a machine never merges on it.
          ...(nearMisses.length ? { possible_duplicate_of: nearMisses } : {}),
        },
      },
    );
    if (!created.ok) {
      console.error(`${LOG} createVendorCore refused (${created.error}) for "${found.name}"`);
      return null;
    }
    stats.vendorsCreated++;
    if (nearMisses.length) stats.duplicatesFlagged++;
    vendorId = created.row.id;
  }

  // The ledger row. Category and service come from the TICKET's own fields, not
  // from the model: they are already mirrored, already correct, and free.
  const category = toVocabularyKey(ticket.category) ?? "unknown";
  const service = toVocabularyKey(ticket.sub_category);
  const logged = await logEngagementCore(
    actor,
    {
      vendor_id: vendorId,
      member_id: ticket.member_id,
      lead_id: null,
      agent_id: agent?.profileId ?? null,
      category,
      service,
      city: found.city ? toVocabularyKey(found.city) : null,
      started_at: ticket.fd_created_at,
      closed_at: null,
      outcome: OUTCOME_BY_STATUS[ticket.status ?? 0] ?? "unknown",
      amount_inr: found.amountInr,
      note: found.evidence ? sanitizeText(found.evidence).slice(0, 4000) : null,
    } as never,
    {
      source: "ticket",
      sourceRef: String(ticket.id),
      title: ticket.subject,
      agentNameRaw: agent?.profileId ? null : (agent?.name ?? null),
    },
  );
  if (!logged.ok) {
    console.error(`${LOG} logEngagementCore refused (${logged.error}) for ticket ${ticket.id}`);
    return vendorId;
  }
  stats.engagementsWritten++;

  // What the vendor DOES, learned from the work they actually did. Only when the
  // ticket names a category — a capability with no category is not a fact.
  if (category !== "unknown") {
    const cap = await upsertCapabilityCore(
      actor,
      {
        vendor_id: vendorId,
        category,
        service,
        stance: "offers",
        cities: found.city && toVocabularyKey(found.city) ? [toVocabularyKey(found.city) as string] : [],
        note: null,
      } as never,
      // NULL, not a fabricated user: the ticket's agent often has no profile, and
      // an empty string is an invalid uuid that fails the write silently.
      { setBy: agent?.profileId ?? null },
    );
    // Checked, because it failing quietly is exactly how seven vendors landed
    // with no capability row at all.
    if (!cap.ok) console.error(`${LOG} upsertCapabilityCore refused (${cap.error}) for vendor ${vendorId}`);
    else stats.capabilitiesWritten++;
  }
  return vendorId;
}

// ─── The cycle ───────────────────────────────────────────────────────────────

/**
 * One pass: claim a batch of unread notes, read each with the model, write what
 * it found, mark the notes done. Notes are grouped by ticket and read oldest
 * first so that a phone arriving in note 6 can attach to a vendor named in note
 * 1 — the model is told what earlier notes on the same ticket already yielded.
 *
 * A note whose READ failed is left unmarked and comes back next pass. A note the
 * model read and found nothing in is marked done: that is an answer, not a
 * failure, and re-reading it would re-bill it forever.
 */
export async function runVendorExtractCycle(limit = EXTRACT_NOTES_PER_CYCLE): Promise<ExtractCycleStats> {
  const stats: ExtractCycleStats = {
    notesRead: 0, notesSkipped: 0, notesFailed: 0, filesRead: 0,
    vendorsCreated: 0, vendorsMatched: 0, engagementsWritten: 0, capabilitiesWritten: 0, duplicatesFlagged: 0,
  };
  const notes = await claimNotes(limit);
  if (notes.length === 0) {
    // A heartbeat even when there is nothing to do. Without it "alive and idle"
    // and "not running at all" look identical from the outside, which is the
    // shape every silent-failure incident in this codebase has taken.
    await setSyncState(EXTRACT_SYNC_KEY, { last_run_at: new Date().toISOString(), idle: true, ...stats });
    return stats;
  }

  const tickets = await readTickets([...new Set(notes.map((n) => n.ticket_id))]);
  const agents = await resolveAgents([...tickets.values()].map((t) => t.responder_id).filter((n): n is number => n != null));
  const maskingDepth = await getPiiMaskingDepth();

  // Per ticket, what previous notes in THIS run already found — the thread that
  // lets a later detail find its owner.
  const context = new Map<number, string[]>();
  const done: number[] = [];

  const byTicket = new Map<number, QueuedNote[]>();
  for (const n of notes) {
    const list = byTicket.get(n.ticket_id) ?? [];
    list.push(n);
    byTicket.set(n.ticket_id, list);
  }

  // Tickets run in parallel; the notes WITHIN a ticket run in order, because
  // each one's context depends on the one before it.
  const queue = [...byTicket.entries()];
  const worker = async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      const [ticketId, ticketNotes] = entry;
      const ticket = tickets.get(ticketId);
      if (!ticket) { stats.notesSkipped += ticketNotes.length; done.push(...ticketNotes.map((n) => n.id)); continue; }
      const agent = ticket.responder_id != null ? agents.get(ticket.responder_id) : undefined;

      for (const note of ticketNotes) {
        const text = (note.body_text ?? "").trim() || (note.body_html ?? "").replace(/<[^>]*>/g, " ").trim();
        const atts = Array.isArray(note.attachments) ? note.attachments : [];
        const { files, skipped } = await readFiles(atts);
        stats.filesRead += files.length;
        if (skipped) console.warn(`${LOG} note ${note.id}: ${skipped} file(s) skipped (size or unreadable type)`);

        const result = await extractVendorsFromNote({
          subject: ticket.subject,
          noteText: text,
          files,
          ticketContext: (context.get(ticketId) ?? []).slice(0, EXTRACT_TICKET_CONTEXT_ROWS),
          maskingDepth,
        });

        if (result == null) { stats.notesFailed++; continue; }   // left queued on purpose
        stats.notesRead++;
        done.push(note.id);

        for (const found of result.vendors) {
          try {
            await writeFinding(found, ticket, agent, stats);
            if (found.name) {
              const line = [found.name, found.category, found.phones[0]].filter(Boolean).join(" · ");
              context.set(ticketId, [line, ...(context.get(ticketId) ?? [])]);
            }
          } catch (e) {
            console.error(`${LOG} write failed for ticket ${ticketId}:`, e instanceof Error ? e.message : e);
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXTRACT_CONCURRENCY, queue.length) }, worker));

  await markRead(done);
  await setSyncState(EXTRACT_SYNC_KEY, {
    last_run_at: new Date().toISOString(),
    ...stats,
  });
  return stats;
}

/** What the last cycle did — the /vendors page and any check reads this. */
export async function getExtractState() {
  return getSyncState<Record<string, unknown>>(EXTRACT_SYNC_KEY);
}
