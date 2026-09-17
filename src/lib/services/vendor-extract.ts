// vendor-extract.ts — SERVER ONLY. THE model read that turns a Freshdesk note
// into vendor facts.
//
// The pure model core, separated from the cycle that feeds it
// (vendor-extract-sync.ts) for the same reason revival-gate.ts is separate from
// revival-service.ts: the prompt is the part that needs re-testing against real
// notes, and it must be callable without a database write behind it.
//
// Reuses the Elaya provider wholesale (R-01): resolveLlmForJob('routing') → the
// Haiku-tier adapter.complete(), no tools, one call per note. Never a new SDK
// import. Note text passes maskPii() first, exactly as the revival gate does.
//
// WHY THE FILES MATTER MORE THAN THE TEXT
// Measured over 2,800 real notes (25 Aug -> 17 Sep 2026): 39.2% carry at least
// one file, and the commonest shape on this account is a note with NO text and
// one photographed bill. Only 3.8% mention a phone in the text and 2.6% an
// amount. So a text-only reader would miss most of what this job exists to find.
// Images and PDFs go to the model directly through the provider's file part
// (added 2026-09-17) rather than through an OCR step: the same method that
// produced the historical import, which used a vision pass for exactly this.
//
// FAILS CLOSED. A missing key, a timeout, a torn reply, an unparseable body: the
// note yields NOTHING and stays queued for the next pass. The opposite posture
// to the search reader, deliberately — that one degrades a search, this one
// writes to the vendor spine, and a guess written into `vendors` is a row the
// team will read as fact.
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import type { PiiMaskingDepth } from "@/lib/services/llm-providers-service";
import type { LlmFilePart } from "@/lib/elaya/provider";
import {
  isOwnEntity,
  VENDOR_CATEGORIES,
  VENDOR_SERVICES,
  EXTRACT_MAX_OUTPUT_TOKENS,
  EXTRACT_NOTE_CHAR_CAP,
} from "@/lib/constants/vendors";

const LOG = "[vendor-extract]";

/** One supplier the model found in a note, before any matching or cleaning. */
export type ExtractedVendor = {
  /** The supplier's name as written. Null when a detail was found with no owner. */
  name: string | null;
  /** A person AT the vendor, never the client and never our own staff. */
  contactName: string | null;
  /** As written — normalizeToE164 runs later, at the write boundary (Rule 06). */
  phones: string[];
  emails: string[];
  /** One of VENDOR_CATEGORIES, or null when the note does not say. */
  category: string | null;
  /** One of VENDOR_SERVICES, or null. */
  service: string | null;
  city: string | null;
  /** Rupees, digits only, when the note or the bill states what was paid. */
  amountInr: number | null;
  /** The words the model based this on — the audit trail, kept on the row. */
  evidence: string | null;
};

export type ExtractionResult = {
  vendors: ExtractedVendor[];
  /**
   * True when the model read the note and found no supplier. Distinct from a
   * FAILURE, which returns null: "nothing here" means mark the note done,
   * "it broke" means leave it queued.
   */
  read: boolean;
};

// The model is told what a vendor IS on this account, because the distinction it
// gets wrong is not spelling but role. The historical import produced 216 junk
// rows from exactly these confusions: "he will get back" became a supplier with
// 64 jobs, a delivery address became one, a product name became one, and clients
// were repeatedly filed as vendors. Each of those is named here as a negative.
const SYSTEM = `You read internal notes from Indulge, a luxury concierge company in India, and find VENDORS: the outside suppliers the team bought from or coordinated with on this job.

A VENDOR is a business or person Indulge PAID or BOOKED. Florists, drivers, hotels, restaurants, airlines, couriers, ticket agents, villa owners, doctors, personal shoppers, event suppliers.

These are NOT vendors, and getting this wrong is the main failure:
- INDULGE ITSELF. "Pricetime Technologies Private Limited" IS Indulge's own company. An invoice in that name is Indulge billing a client, never a supplier billing Indulge. Same for anything reading "Indulge".
- THE CLIENT. Both appear as a name with a phone. The client is the person the work is being done FOR. A line like "Client name- Shivam" is the client.
- INDULGE'S OWN STAFF. A note saying "as advised by Bhavarth" or "Snehil will update" names a colleague.
- A PRODUCT OR A PLACE. "Speaker", "Khan Market", "black forest cake" are what was bought or where it went, not who supplied it.
- TICKET CHATTER. "he will get back", "nudged", "local vendor", "will check" name nobody.

If you are not sure something is a supplier, leave it out. A missing vendor costs nothing; a wrong one is written into the company's vendor database as fact.

When a file is attached it is usually the bill or the booking confirmation, and the supplier's real name, phone and amount are commonly ONLY there. Read it.

Return STRICT JSON ONLY. No prose, no markdown, no code fence:
{"vendors":[{"name":string|null,"contactName":string|null,"phones":[string],"emails":[string],"category":string|null,"service":string|null,"city":string|null,"amountInr":number|null,"evidence":string}]}

- "name": the SUPPLIER's name exactly as written. Use null ONLY when the note gives a detail (a phone, an amount) that clearly belongs to a supplier whose name is not stated here.
- "contactName": a person at the vendor. Never the client, never Indulge staff.
- "category": exactly one of ${VENDOR_CATEGORIES.join(", ")}. Null if the note does not make it obvious.
- "service": exactly one of ${VENDOR_SERVICES.join(", ")}, or null.
- Phone numbers and email addresses in the note text appear as placeholders like [PHONE_1] and [EMAIL_2]. Return the PLACEHOLDER exactly as written, never a made-up number. Pick the one that belongs to the VENDOR, not the client. A phone or email you read from an attached FILE is not a placeholder: return it as it appears.
- "amountInr": what Indulge paid the vendor, digits only. Not the price charged to the client when both appear.
- "evidence": the few words you read this from, quoted from the note or the file.
- No vendors found: {"vendors":[]}`;

// ─── Reversible tokens for the contactable details ───────────────────────────
//
// maskPii() turns "+91 77689 21969" into "••••••••1969" before the model reads
// it, which is right for a gate that only needs a verdict and wrong for an
// extractor whose whole job is to bring that number back. A masked phone
// survives the round trip as bullets, fails normalizeToE164, and the vendor
// lands with no phone — the strongest matching key we have, lost.
//
// So phones and emails are swapped for [PHONE_1] / [EMAIL_1] BEFORE masking,
// and swapped back after the reply. The model never sees a real number (the
// rule stands), it can still say WHICH number belongs to the vendor rather than
// the client, and we recover the true value from our own map.
const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{4,5}[\s-]?\d{4,6}\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

type TokenMap = Map<string, string>;

function tokenisePii(text: string): { text: string; map: TokenMap } {
  const map: TokenMap = new Map();
  let out = text.replace(EMAIL_RE, (m) => {
    const t = `[EMAIL_${map.size + 1}]`;
    map.set(t, m);
    return t;
  });
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    // 4-6 digits is a date, an amount or an invoice number, not a phone.
    if (digits.length < 8 || digits.length > 15) return m;
    const t = `[PHONE_${map.size + 1}]`;
    map.set(t, m.trim());
    return t;
  });
  return { text: out, map };
}

/** Put the real value back. A token the model invented resolves to nothing and is dropped. */
function detokenise(values: string[], map: TokenMap): string[] {
  const out: string[] = [];
  for (const v of values) {
    const hit = map.get(v.trim());
    if (hit) { out.push(hit); continue; }
    // The model sometimes echoes the detail verbatim instead of the token; that is
    // only possible for something that was never PII, so it passes through.
    if (!/^\[(PHONE|EMAIL)_\d+\]$/.test(v.trim())) out.push(v);
  }
  return [...new Set(out)];
}

/** Strip a code fence and take the first {...} — models fence JSON despite instructions. */
function parseExtraction(text: string): ExtractedVendor[] | null {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (obj as { vendors?: unknown })?.vendors;
  if (!Array.isArray(raw)) return null;

  const clean: ExtractedVendor[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const str = (k: string): string | null => {
      const s = typeof r[k] === "string" ? (r[k] as string).trim() : "";
      return s.length ? s : null;
    };
    const list = (k: string): string[] =>
      Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
    const name = str("name");
    // Our own invoicing entity is never a supplier, whatever the model decided.
    if (isOwnEntity(name)) continue;
    const phones = list("phones");
    const emails = list("emails");
    const amount = typeof r.amountInr === "number" && Number.isFinite(r.amountInr) && r.amountInr >= 0 ? r.amountInr : null;
    // A row with no name AND no contactable detail says nothing at all.
    if (!name && phones.length === 0 && emails.length === 0 && amount == null) continue;
    // The vocabularies are ours, not the model's: anything outside them is dropped
    // rather than allowed to invent a category (the search-reader rule).
    const category = str("category");
    const service = str("service");
    clean.push({
      name,
      contactName: str("contactName"),
      phones,
      emails,
      category: category && (VENDOR_CATEGORIES as readonly string[]).includes(category) ? category : null,
      service: service && (VENDOR_SERVICES as readonly string[]).includes(service) ? service : null,
      city: str("city")?.toLowerCase() ?? null,
      amountInr: amount,
      evidence: str("evidence"),
    });
  }
  return clean;
}

export type ExtractInput = {
  /** The ticket subject — free context, and itself a place vendors are named. */
  subject: string | null;
  /** The note's plain text. May be empty when the note is only a file. */
  noteText: string;
  /** Images and PDFs from this note, already read out of the mirror's bucket. */
  files?: LlmFilePart[];
  /**
   * What earlier notes on THIS ticket already told us, one line each. The reason
   * a phone in note 6 can be attached to a vendor named in note 1 — without it
   * a bare number has no owner and the model either drops it or guesses.
   */
  ticketContext?: string[];
  /**
   * The account's PII depth. Passed in rather than read here so one cycle reads
   * `elaya_settings` once for a whole batch, and an eval can pass 'light'
   * directly (the revival-gate split).
   */
  maskingDepth: PiiMaskingDepth;
};

/**
 * Read one note. Returns the vendors found (possibly none), or NULL when the
 * read itself failed — the caller must keep a null queued and retry it, and must
 * not mark it done.
 */
export async function extractVendorsFromNote(input: ExtractInput): Promise<ExtractionResult | null> {
  const text = input.noteText.slice(0, EXTRACT_NOTE_CHAR_CAP).trim();
  const files = input.files ?? [];
  if (!text && files.length === 0) return { vendors: [], read: true };

  try {
    // Tokens first, then maskPii for anything else it recognises. Order matters:
    // masking first would destroy the numbers we need to hand back.
    const { text: tokenised, map } = text ? tokenisePii(text) : { text: "", map: new Map<string, string>() };
    const masked = tokenised ? maskPii(tokenised, input.maskingDepth) : "";
    const parts = [
      input.subject ? `Ticket subject: ${input.subject}` : null,
      input.ticketContext?.length
        ? `Already known on this ticket:\n${input.ticketContext.map((l) => `- ${l}`).join("\n")}`
        : null,
      files.length
        ? `${files.length} file(s) are attached to this note; read them.`
        : null,
      masked ? `Note:\n${masked}` : "Note: (no text, the file is the whole note)",
      `Return the JSON.`,
    ].filter(Boolean) as string[];

    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({
      model: llm.model,
      maxTokens: EXTRACT_MAX_OUTPUT_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: parts.join("\n\n"), files: files.length ? files : undefined }],
      // The system prompt is byte-stable across every note, so the cache
      // breakpoint pays for itself from the second note of every run onward.
      cachePrefix: true,
    });

    const vendors = parseExtraction(result.text);
    if (vendors == null) {
      console.warn(`${LOG} unparseable reply; leaving the note queued`);
      return null;
    }
    // Tokens back to real values. A phone read off a FILE arrives verbatim (an
    // image cannot be tokenised) and passes through untouched.
    for (const v of vendors) {
      v.phones = detokenise(v.phones, map);
      v.emails = detokenise(v.emails, map);
      if (v.evidence) {
        for (const [t, real] of map) v.evidence = v.evidence.split(t).join(real);
      }
    }
    return { vendors, read: true };
  } catch (e) {
    console.error(`${LOG} extraction failed (note stays queued):`, e instanceof Error ? e.message : e);
    return null;
  }
}
