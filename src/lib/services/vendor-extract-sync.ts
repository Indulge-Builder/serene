// vendor-extract-sync.ts — SERVER ONLY. THE cycle that keeps the vendor tables
// current from the Freshdesk mirror.
//
// It calls Freshdesk NOT AT ALL. The mirror (0193) already pulls every ticket,
// note and attachment every minute and is the account's priority consumer of the
// 50-calls-a-minute budget; a second poller would fight it for that budget to
// re-fetch bytes we already hold. This reads `freshdesk.conversations`, which is
// free, and can therefore re-read history whenever the rules improve.
//
// THE QUEUE is `vendor_extracted_at IS NULL` on the conversation row (0214) —
// the same NULL-as-flag shape the mirror already uses for `conversations_synced_at`
// and `media_synced_at`. Marked once, preserved forever: the model read is the
// only billed step, so re-clearing that column re-bills the whole thread.
//
// WHAT IT WRITES, and through what
// Nothing here touches a vendor table directly. Every write goes through the
// cores in vendor-mutations.ts (R-01) — the same functions the /vendors form and
// Elaya call — so a synced vendor is the same shape as a typed one. The cores
// were extended (not copied) on 2026-09-17 to carry provenance: `source:
// 'freshdesk_live'` (its own value -- `ticket` is Sia's and `freshdesk` is the
// archive the loader wipes on re-run), the ticket id as `source_ref`,
// `identity_status:'unverified'`.
//
// IDEMPOTENT by key, not by luck. `(vendor_id, source, source_ref)` is UNIQUE on
// the ledger, and source_ref is the Freshdesk ticket id, so a ticket read twice
// REFINES one engagement row -- fills what is still empty, never overwrites what
// a bill already supplied -- rather than minting a second.
//
// EACH NOTE IS MARKED THE MOMENT ITS OWN WRITES LAND, not at the end of the
// batch: a crash midway through forty notes must not re-bill the thirty it had
// already read. A note that FAILS -- the model read, or a write a core refused
// after a good read -- is counted (vendor_extract_attempts)
// and the queue stops offering it at EXTRACT_MAX_ATTEMPTS, so one permanently
// bad note cannot hold the oldest-first queue for everything behind it.
//
// OUTCOMES CATCH UP WITH THE TICKET. A job is logged when a note is read, and
// at that moment the ticket is nearly always still open; Freshdesk resolves it
// days later with no further note. settleOutcomes() closes the live extractor's
// open jobs through closeEngagementCore once the mirrored ticket is Resolved or
// Closed. No model, no cost.
import { createAdminClient } from "@/lib/supabase/admin";
import { freshdeskDb, getSyncState, setSyncState } from "@/lib/services/freshdesk-sync";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { extractVendorsFromNote, type ExtractedVendor } from "@/lib/services/vendor-extract";
import { searchVendors } from "@/lib/services/vendors-service";
import {
  closeEngagementCore,
  createVendorCore,
  logEngagementCore,
  updateVendorCore,
  upsertCapabilityCore,
} from "@/lib/services/vendor-mutations";
import { normalizeToE164 } from "@/lib/utils/phone";
import { sanitizeText } from "@/lib/utils/sanitize";
import { FRESHDESK_ATTACHMENT_BUCKET } from "@/lib/constants/freshdesk";
import {
  EXTRACT_CONCURRENCY,
  EXTRACT_CYCLE_BUDGET_MS,
  EXTRACT_FILE_MAX_BYTES,
  EXTRACT_FILES_PER_NOTE,
  EXTRACT_FILES_TOTAL_MAX_BYTES,
  EXTRACT_MATCH_MIN_SIMILARITY,
  EXTRACT_MAX_ATTEMPTS,
  EXTRACT_MIN_FUZZY_NAME_CHARS,
  EXTRACT_NOTES_PER_CYCLE,
  EXTRACT_SETTLE_PAGE_SIZE,
  EXTRACT_SOURCE,
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
  /** Failed for the last permitted time this cycle; the queue will not offer them again. */
  notesGivenUp: number;
  /** Claimed but not reached before the cycle's wall-clock budget; still queued. */
  notesDeferred: number;
  filesRead: number;
  vendorsCreated: number;
  vendorsMatched: number;
  engagementsWritten: number;
  capabilitiesWritten: number;
  duplicatesFlagged: number;
  /** Open live-extractor jobs closed because their ticket is now Resolved/Closed. */
  outcomesSettled: number;
};

// ─── The queue ────────────────────────────────────────────────────────────────

type QueuedNote = {
  id: number;
  ticket_id: number;
  body_text: string | null;
  body_html: string | null;
  attachments: FdAttachment[];
  fd_created_at: string;
  vendor_extract_attempts: number;
};

/**
 * Oldest first: a ticket's notes must be read in the order they were written.
 * Notes at the attempts cap are not offered -- see recordFailure.
 */
async function claimNotes(limit: number): Promise<QueuedNote[]> {
  const { data, error } = await freshdeskDb()
    .from("conversations")
    .select("id, ticket_id, body_text, body_html, attachments, fd_created_at, vendor_extract_attempts")
    .is("vendor_extracted_at", null)
    .lt("vendor_extract_attempts", EXTRACT_MAX_ATTEMPTS)
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

/**
 * A read that failed. Counted on the row, immediately, so a permanent failure
 * cannot come back every five minutes forever: at EXTRACT_MAX_ATTEMPTS the
 * queue stops offering the note. vendor_extracted_at stays NULL on purpose --
 * "gave up" is a state someone can query, not one that hides inside "read".
 */
async function recordFailure(note: QueuedNote, stats: ExtractCycleStats): Promise<void> {
  const attempts = note.vendor_extract_attempts + 1;
  const { error } = await freshdeskDb()
    .from("conversations")
    .update({ vendor_extract_attempts: attempts })
    .eq("id", note.id);
  if (error) console.error(`${LOG} counting a failed read failed:`, error.message);
  stats.notesFailed++;
  if (attempts >= EXTRACT_MAX_ATTEMPTS) {
    stats.notesGivenUp++;
    console.error(`${LOG} GAVE UP on note ${note.id} (ticket ${note.ticket_id}) after ${attempts} failed reads; reset vendor_extract_attempts to re-queue it`);
  }
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
  resolved_at: string | null;
  closed_at: string | null;
};

async function readTickets(ids: number[]): Promise<Map<number, TicketFacts>> {
  const out = new Map<number, TicketFacts>();
  if (ids.length === 0) return out;
  const { data, error } = await freshdeskDb()
    .from("tickets")
    .select("id, subject, category, sub_category, member_id, responder_id, status, fd_created_at, resolved_at, closed_at")
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
  // Two limits, both refusals rather than slowness: the API rejects one image
  // over ~5 MB and one request over ~32 MB, and a rejection is identical on
  // every retry -- so a note that exceeded either would burn all its attempts
  // for nothing. Files past the budget are skipped; the note still goes with
  // what fit.
  let total = 0;
  const usable = atts.filter((a) => a.storage_path && READABLE.has(a.content_type ?? ""));
  for (const a of usable.slice(0, EXTRACT_FILES_PER_NOTE)) {
    if ((a.size ?? 0) > EXTRACT_FILE_MAX_BYTES) { skipped++; continue; }
    if (total + (a.size ?? 0) > EXTRACT_FILES_TOTAL_MAX_BYTES) { skipped++; continue; }
    try {
      const { data, error } = await storage.download(a.storage_path as string);
      if (error || !data) { skipped++; continue; }
      const bytes = Buffer.from(await data.arrayBuffer());
      if (bytes.byteLength > EXTRACT_FILE_MAX_BYTES) { skipped++; continue; }
      if (total + bytes.byteLength > EXTRACT_FILES_TOTAL_MAX_BYTES) { skipped++; continue; }
      total += bytes.byteLength;
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

/** Freshdesk 4 = Resolved, 5 = Closed. Anything else is still a job in progress. */
const OUTCOME_BY_STATUS: Record<number, "completed"> = { 4: "completed", 5: "completed" };

/** When a resolved ticket closed, as the mirror recorded it; null while it is open. */
function closedAtFor(t: { status: number | null; resolved_at: string | null; closed_at: string | null; fd_created_at: string }): string | null {
  if (!(t.status != null && t.status in OUTCOME_BY_STATUS)) return null;
  const at = t.resolved_at ?? t.closed_at ?? null;
  // Never before it started -- the ledger CHECKs that, and a mirror row from
  // the XML archive can carry an odd timestamp.
  return at && at >= t.fd_created_at ? at : t.fd_created_at;
}

async function writeFinding(
  found: ExtractedVendor,
  ticket: TicketFacts,
  agent: { profileId: string | null; name: string | null } | undefined,
  stats: ExtractCycleStats,
): Promise<boolean> {
  // TRUE = everything this finding had to say is in the tables (or it had
  // nothing to say). FALSE = a core refused a write, and the caller must NOT
  // mark the note read: the model read worked but the fact did not land, and
  // marking it done would lose that vendor for good with only a log line to
  // show for it. Every write below is idempotent (exact-name match, the refine
  // path, the capability lookup), so reading the note again is safe.
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
    if (!found.name) return true;                    // a detail with no owner — nothing to write, not a failure
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
        source: EXTRACT_SOURCE,
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
      return false;
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
      // Already resolved when read: the row is born closed. Still open: the
      // settle pass closes it when the ticket resolves, days from now.
      closed_at: closedAtFor(ticket),
      outcome: OUTCOME_BY_STATUS[ticket.status ?? 0] ?? "unknown",
      amount_inr: found.amountInr,
      note: found.evidence ? sanitizeText(found.evidence).slice(0, 4000) : null,
    } as never,
    {
      source: EXTRACT_SOURCE,
      sourceRef: String(ticket.id),
      title: ticket.subject,
      agentNameRaw: agent?.profileId ? null : (agent?.name ?? null),
    },
  );
  if (!logged.ok) {
    console.error(`${LOG} logEngagementCore refused (${logged.error}) for ticket ${ticket.id}`);
    return false;
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
    if (!cap.ok) {
      console.error(`${LOG} upsertCapabilityCore refused (${cap.error}) for vendor ${vendorId}`);
      return false;
    }
    stats.capabilitiesWritten++;
  }
  return true;
}

// ─── Outcomes catch up with the ticket ───────────────────────────────────────

/**
 * Close the live extractor's open jobs whose ticket has since been Resolved or
 * Closed. A job is logged the moment a note is read, and at that moment the
 * ticket is nearly always still open -- so the row says `unknown`, the
 * reliability score reads that, and Freshdesk resolves the ticket days later
 * with no further note to trigger another read (reviewer, 2026-09-18).
 *
 * Through closeEngagementCore -- the ledger's ONE close, resolve-once -- and
 * only rows this extractor wrote (source = freshdesk_live). Never the archive,
 * never a hand-logged job. No model call, so it costs nothing to run every pass.
 */
async function settleOutcomes(stats: ExtractCycleStats, deadline: number): Promise<void> {
  const admin = createAdminClient();
  const actor = actorFor(null);
  type OpenJob = { id: string; source_ref: string; amount_inr: number | null; invoice_paths: string[]; note: string | null };
  type TicketState = { id: number; status: number | null; resolved_at: string | null; closed_at: string | null; fd_created_at: string };

  // EVERY open job, a page at a time, keyset on id. The first version looked at
  // the 200 oldest only: two hundred jobs on tickets that stay open for weeks
  // would have filled that window on every pass, and nothing newer would ever
  // have settled (reviewer, 2026-09-18). A keyset on id is stable while rows
  // close underneath it, and the whole walk is two cheap reads a page.
  let afterId: string | null = null;
  while (Date.now() <= deadline) {
    let query = admin
      .from("vendor_engagements")
      .select("id, source_ref, amount_inr, invoice_paths, note")
      .eq("source", EXTRACT_SOURCE)
      .eq("outcome", "unknown")
      .is("closed_at", null)
      .order("id", { ascending: true })
      .limit(EXTRACT_SETTLE_PAGE_SIZE);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) {
      console.error(`${LOG} settle read failed:`, error.message);
      return;
    }
    const open = (data ?? []) as OpenJob[];
    if (open.length === 0) return;
    afterId = open[open.length - 1].id;

    const ticketIds = [...new Set(open.map((r) => Number(r.source_ref)).filter((n) => Number.isFinite(n)))];
    const { data: tickets, error: tErr } = await freshdeskDb()
      .from("tickets")
      .select("id, status, resolved_at, closed_at, fd_created_at")
      .in("id", ticketIds);
    if (tErr) {
      console.error(`${LOG} settle ticket read failed:`, tErr.message);
      return;
    }
    const byId = new Map<number, TicketState>();
    for (const t of (tickets ?? []) as unknown as TicketState[]) byId.set(t.id, t);

    for (const row of open) {
      const t = byId.get(Number(row.source_ref));
      if (!t) continue;
      const closedAt = closedAtFor(t);
      if (!closedAt) continue;                              // still open -- next time
      const res = await closeEngagementCore(actor, {
        id: row.id,
        closed_at: closedAt,
        outcome: "completed",
        // The close carries the row's own facts forward; it must not blank them.
        amount_inr: row.amount_inr,
        invoice_paths: row.invoice_paths ?? [],
        note: row.note,
      });
      if (res.ok) stats.outcomesSettled++;
      else if (res.error !== "already_closed") console.error(`${LOG} closeEngagementCore refused (${res.error}) for job ${row.id}`);
    }
    if (open.length < EXTRACT_SETTLE_PAGE_SIZE) return;
  }
}

// ─── The cycle ───────────────────────────────────────────────────────────────

/**
 * One pass: claim a batch of unread notes, read each with the model, write what
 * it found, mark THAT note done, move on. Notes are grouped by ticket and read
 * oldest first so that a phone arriving in note 6 can attach to a vendor named
 * in note 1 — the model is told what earlier notes on the same ticket already
 * yielded. Then the settle pass closes jobs whose tickets have resolved.
 *
 * A note whose READ failed, or whose WRITE a core refused, is counted
 * (recordFailure) and comes back next pass until the attempts cap. A note the model read and found nothing in is marked
 * done: that is an answer, not a failure, and re-reading it would re-bill it
 * forever. Notes not reached before the wall-clock budget stay queued, untouched.
 */
export async function runVendorExtractCycle(limit = EXTRACT_NOTES_PER_CYCLE): Promise<ExtractCycleStats> {
  const stats: ExtractCycleStats = {
    notesRead: 0, notesSkipped: 0, notesFailed: 0, notesGivenUp: 0, notesDeferred: 0, filesRead: 0,
    vendorsCreated: 0, vendorsMatched: 0, engagementsWritten: 0, capabilitiesWritten: 0, duplicatesFlagged: 0,
    outcomesSettled: 0,
  };
  const deadline = Date.now() + EXTRACT_CYCLE_BUDGET_MS;
  const notes = await claimNotes(limit);

  if (notes.length > 0) {
    const tickets = await readTickets([...new Set(notes.map((n) => n.ticket_id))]);
    const agents = await resolveAgents([...tickets.values()].map((t) => t.responder_id).filter((n): n is number => n != null));
    const maskingDepth = await getPiiMaskingDepth();

    // Per ticket, what previous notes in THIS run already found — the thread that
    // lets a later detail find its owner.
    const context = new Map<number, string[]>();

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
        if (!ticket) {
          // No mirrored ticket to hang a job on. Marked read: it is not a failure
          // of the model, and it will not be different next pass.
          stats.notesSkipped += ticketNotes.length;
          await markRead(ticketNotes.map((n) => n.id));
          continue;
        }
        const agent = ticket.responder_id != null ? agents.get(ticket.responder_id) : undefined;

        for (let i = 0; i < ticketNotes.length; i++) {
          if (Date.now() > deadline) {
            // Out of time. Whatever is left stays NULL and unattempted -- the next
            // pass starts exactly here. Nothing is half-done, because every note
            // before this one was marked the moment its own writes landed.
            stats.notesDeferred += ticketNotes.length - i;
            for (const [, rest] of queue) stats.notesDeferred += rest.length;
            queue.length = 0;
            return;
          }
          const note = ticketNotes[i];
          const text = (note.body_text ?? "").trim() || (note.body_html ?? "").replace(/<[^>]*>/g, " ").trim();
          const atts = Array.isArray(note.attachments) ? note.attachments : [];
          const { files, skipped } = await readFiles(atts);
          stats.filesRead += files.length;
          if (skipped) console.warn(`${LOG} note ${note.id}: ${skipped} file(s) skipped (size, budget or unreadable type)`);

          const result = await extractVendorsFromNote({
            subject: ticket.subject,
            noteText: text,
            files,
            ticketContext: (context.get(ticketId) ?? []).slice(0, EXTRACT_TICKET_CONTEXT_ROWS),
            maskingDepth,
          });

          if (result == null) { await recordFailure(note, stats); continue; }

          // A refused or thrown write counts exactly like a failed read: the
          // note stays queued, the attempt is counted, and at the cap it is
          // given up on loudly. Marking it read here would lose the vendor.
          let allWritten = true;
          for (const found of result.vendors) {
            try {
              const written = await writeFinding(found, ticket, agent, stats);
              if (!written) { allWritten = false; continue; }
              if (found.name) {
                const line = [found.name, found.category, found.phones[0]].filter(Boolean).join(" · ");
                context.set(ticketId, [line, ...(context.get(ticketId) ?? [])]);
              }
            } catch (e) {
              allWritten = false;
              console.error(`${LOG} write failed for ticket ${ticketId}:`, e instanceof Error ? e.message : e);
            }
          }
          if (!allWritten) { await recordFailure(note, stats); continue; }
          stats.notesRead++;
          // THIS note, now. A crash on the next one must not re-bill this one.
          await markRead([note.id]);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(EXTRACT_CONCURRENCY, queue.length) }, worker));
  }

  // Runs whether or not there were notes: tickets resolve on their own clock.
  if (Date.now() <= deadline) await settleOutcomes(stats, deadline);

  const idle = notes.length === 0 && stats.outcomesSettled === 0;
  // A heartbeat even when there is nothing to do. Without it "alive and idle"
  // and "not running at all" look identical from the outside, which is the
  // shape every silent-failure incident in this codebase has taken.
  await setSyncState(EXTRACT_SYNC_KEY, { last_run_at: new Date().toISOString(), ...(idle ? { idle: true } : {}), ...stats });
  return stats;
}

/** What the last cycle did — the /vendors page and any check reads this. */
export async function getExtractState() {
  return getSyncState<Record<string, unknown>>(EXTRACT_SYNC_KEY);
}
