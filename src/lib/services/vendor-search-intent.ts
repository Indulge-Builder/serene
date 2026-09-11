// vendor-search-intent.ts — read a request the way a person means it.
//
// The panel used to match the request against a hand-written keyword list. That
// list can never be finished: "order for black forest cake" found nothing
// because "cake" was not on it, "pickup cash from the airport" shares no word
// with "airport transfer", and "flgihts" shares no word with anything. Every new
// phrasing meant a code change and another round of testing.
//
// So the sentence is read once by the routing-tier model, which returns the
// structured request underneath it — category, service, city, and the SEARCH
// TERMS to look for in past ticket titles. Everything after that is unchanged:
// the terms go to `find_vendors_by_history` (0189) and the vendors come back
// from real rows.
//
// THE MODEL NEVER NAMES A VENDOR. It only interprets the sentence. Every vendor
// returned is a row with real job history, so a hallucinated supplier is not
// possible — the failure a concierge business cannot afford.
//
// Reuses the Elaya provider layer wholesale (R-01): `resolveLlmForJob('routing')`
// → the Haiku-tier adapter.complete(), no tools, one call. Same shape as
// revival-gate.ts, which is the precedent for a single structured judgement.
//
// FAILS OPEN. No key, a timeout, a bad reply, a torn JSON body — every failure
// returns null and the caller falls back to the keyword parse. Search that got
// slightly worse beats search that stopped working.

import { resolveLlmForJob } from "@/lib/elaya/registry";
import { REQUEST_CATEGORIES, VENDOR_SERVICES } from "@/lib/constants/vendors";

const LOG = "[vendor-search-intent]";

export type VendorSearchIntent = {
  /** One of REQUEST_CATEGORIES, or null when the request does not name one. */
  category: string | null;
  /** One of VENDOR_SERVICES, or null. */
  service: string | null;
  /** A city named in the request, lower-cased. Null when none is named. */
  city: string | null;
  /**
   * The words to look for in past ticket titles — the subject of the request,
   * expanded with the words the team would plausibly have written instead.
   * "black forest cake" yields cake, bakery, dessert; "pickup from the airport"
   * yields airport, pickup, transfer, chauffeur.
   */
  terms: string[];
};

const SYSTEM_PROMPT = `You read a concierge team's vendor request and return the structured search underneath it.

The team serves wealthy clients. A request names something they need sourced, booked, delivered or arranged.

Return ONLY a JSON object, no prose and no code fence:

{
  "category": one of [${REQUEST_CATEGORIES.join(", ")}] or null,
  "service":  one of [${VENDOR_SERVICES.join(", ")}] or null,
  "city":     a city named in the request, lower-cased, or null,
  "terms":    3-8 lower-case words to search past ticket titles with,
              MOST IMPORTANT FIRST (the subject is term 1)
}

Rules for "terms" — this is the important field:
- Include the SUBJECT of the request (what is actually wanted).
- Add words the team would plausibly have typed for the same thing. "cake" also
  suggests bakery, dessert, pastry. "airport pickup" also suggests transfer,
  chauffeur, car. "gift for a wife's 50th" also suggests anniversary, birthday,
  milestone, hamper, flowers.
- Correct obvious typos: "flgihts" is flights.
- EXCLUDE dates, times, quantities, prices, people's names and place names.
- EXCLUDE colours, sizes and other modifiers unless the modifier IS the subject.
  "black forest cake" is about cake, not the colour black — including "black"
  surfaces black socks and a bar called True Black.
- EXCLUDE filler that appears in every request: need, want, order, book,
  request, client, guest, urgent, please, arrange, delivery.
- Prefer specific words over generic ones. A generic word like "delivery"
  appears in thousands of unrelated tickets and buries the real subject.

Set "category", "service" or "city" to null when the request does not clearly
name one. Do not guess. Never invent a vendor name.`;

/** Strip a code fence and take the first {...} block — models fence JSON despite instructions. */
function parseIntent(text: string): VendorSearchIntent | null {
  const fenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  // Anything the model returns that is NOT in our vocabulary is discarded, not
  // trusted: a category we do not have would filter the search down to nothing.
  const pick = (v: unknown, allowed: readonly string[]): string | null => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    return allowed.includes(s) ? s : null;
  };

  // A multi-word term is SPLIT, not squashed. Stripping the spaces out of
  // "black forest cake" produced "blackforestcake", a token that appears in no
  // title on earth; the words it was made of match 765 of them.
  const terms = Array.isArray(o.terms)
    ? [...new Set(
        o.terms
          .filter((t): t is string => typeof t === "string")
          .flatMap((t) => t.trim().toLowerCase().split(/[^a-z0-9]+/))
          .filter((t) => t.length >= 3),
      )].slice(0, 10)
    : [];

  const city = typeof o.city === "string" && o.city.trim() ? o.city.trim().toLowerCase() : null;

  // A reply with no terms is useless — the caller should fall back rather than
  // run a search with nothing in it.
  if (terms.length === 0) return null;

  return {
    category: pick(o.category, REQUEST_CATEGORIES),
    service: pick(o.service, VENDOR_SERVICES),
    city,
    terms,
  };
}

/**
 * Read one request. Returns null on ANY failure so the caller falls back to the
 * keyword parse — never throws, never blocks a search.
 */
export async function readVendorRequest(phrase: string): Promise<VendorSearchIntent | null> {
  const text = phrase.trim();
  if (text.length < 2) return null;

  try {
    const llm = await resolveLlmForJob("routing");
    const result = await llm.adapter.complete({
      model: llm.model,
      // A JSON object with four small fields — 300 is generous. Capping it keeps
      // the per-search cost at roughly ₹0.03 even if the model gets chatty.
      maxTokens: Math.min(llm.maxTokens, 300),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
      // The system prompt is byte-stable across every search, so the cache
      // breakpoint makes calls 2..n read it at ~0.1x.
      cachePrefix: true,
      // NO tools — single-shot structured read.
    });
    return parseIntent(result.text);
  } catch (e) {
    console.error(`${LOG} readVendorRequest failed (falling back to keywords):`,
      e instanceof Error ? e.message : e);
    return null;
  }
}
