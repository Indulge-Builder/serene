/**
 * Find-a-vendor bench — runs real phrases through the SAME parse the panel
 * uses, then the SAME ranker, and prints what a person would see.
 *
 * Exists so a phrasing can be checked against the actual data before it is
 * typed into the UI: if a phrase parses to the wrong chips, the fault is the
 * keyword parser; if the chips are right and the vendors are wrong, the fault
 * is the ranker. Keeping them on one screen is what tells the two apart.
 *
 * Run: npx tsx --env-file=.env.local scripts/vendors/test-find-phrases.ts
 */

import { rankVendorsForRequest, getVendorCities } from "../../src/lib/services/vendors-service";
import {
  REQUEST_CATEGORIES,
  VENDOR_SERVICES,
  getRequestCategoryLabel,
  getServiceLabel,
  type VendorService,
  type RequestCategory,
} from "../../src/lib/constants/vendors";

const host = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING TO RUN — not a local database (host "${host}").`);
  process.exit(1);
}

// Copied verbatim from FindVendorPanel so the bench cannot drift from it.
const SERVICE_WORDS: Record<VendorService, string[]> = {
  'flights':          ['flight', 'flights', 'fly', 'flying', 'air', 'airline', 'airfare', 'ticket', 'tickets'],
  'hotel-booking':    ['hotel', 'hotels', 'stay', 'accommodation', 'resort', 'suite', 'room', 'rooms'],
  'car-transfer':     ['car', 'cars', 'cab', 'cabs', 'taxi', 'chauffeur', 'driver', 'transfer', 'transfers', 'pickup', 'drop'],
  'airport-protocol': ['protocol', 'meet', 'greet', 'fast', 'track', 'lounge'],
  'visa':             ['visa', 'visas', 'schengen', 'immigration'],
  'itinerary':        ['itinerary', 'itineraries', 'trip', 'plan', 'planning'],
  'experiences':      ['experience', 'experiences', 'activity', 'activities', 'tour', 'tours', 'excursion'],
  'general':          ['shopping', 'shop', 'purchase', 'buy'],
  'bag':              ['bag', 'bags', 'luggage', 'suitcase', 'handbag'],
  'watch':            ['watch', 'watches'],
};

const CATEGORY_WORDS: Record<RequestCategory, string[]> = {
  'travel':                 ['travel', 'trip', 'flight', 'flights', 'hotel', 'visa', 'itinerary'],
  'dining':                 ['dining', 'dinner', 'lunch', 'restaurant', 'table', 'reservation', 'eat', 'brunch'],
  'retail':                 ['retail', 'shopping', 'buy', 'purchase', 'store'],
  'gifting':                ['gift', 'gifts', 'gifting', 'hamper', 'hampers', 'flowers', 'bouquet'],
  'events':                 ['event', 'events', 'party', 'venue', 'celebration', 'wedding'],
  'special-request':        ['special', 'request'],
  'staff-hiring':           ['staff', 'hiring', 'hire', 'butler', 'chef', 'nanny'],
  'indulge-recommendations':['recommendation', 'recommendations', 'recommend', 'suggest'],
};

/**
 * Whole-word match that tolerates the plural. "flight to Dubai" has to find
 * `flights`, and "watches" has to find `watch` — an exact \b match found
 * neither, which is why a phrase as ordinary as "flight to dubai" produced no
 * chips at all. Not a stemmer: an optional trailing s/es, which covers the
 * English plural without pulling in false matches.
 */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word}(?:e?s)?\\b`).test(haystack);
}

/** A multi-word value matches when EVERY one of its words is present. */
function mentions(haystack: string, needle: string): boolean {
  const words = needle.toLowerCase().split(/[-_\s]+/).filter(Boolean);
  return words.every((w) => hasWord(haystack, w));
}

/**
 * Cities that are also ordinary English words. "Something nice for a client's
 * wife" was read as the city NICE, France — and then narrowed the whole search
 * to vendors serving the French Riviera.
 *
 * These count as a place only when a preposition puts them there ("dinner IN
 * Nice"). Every other city still matches bare, so "Dubai flights" and "goa
 * flowers" are unaffected.
 */
const AMBIGUOUS_CITIES = new Set([
  'nice', 'bath', 'split', 'york', 'rome', 'mayfair',
  // "airport" is a city on 12 capability rows, so "pickup from the airport"
  // filtered the whole search to vendors serving a place called Airport.
  'airport',
]);

/** Is this city preceded by in / at / to / from / near / around? */
function precededByPlace(haystack: string, city: string): boolean {
  return new RegExp(`\\b(?:in|at|to|from|near|around)\\s+${city}\\b`).test(haystack);
}

function parseRequest(text: string, cities: string[]): Parsed {
  const q = text.toLowerCase();

  // Two passes, and the order matters. A word the user actually TYPED beats a
  // synonym: "someone to buy a watch" says "watch", but "buy" is a synonym of
  // `general`, and a single pass sorted by length picked General over Watch.
  // Within each pass, longest value first, so "hotel booking" wins over a bare
  // "hotel" and "airport protocol" is not shadowed by a one-word rule.
  const byLength = [...VENDOR_SERVICES].sort((a, b) => b.length - a.length);
  const service =
    byLength.find((sv) => mentions(q, sv)) ??
    byLength.find((sv) => (SERVICE_WORDS[sv] ?? []).some((w) => hasWord(q, w))) ??
    null;

  // The city is matched against what the SERVICE did not already claim.
  // "airport" is a city on 12 capability rows, so "airport protocol in Delhi"
  // read the city as "airport" and dropped Delhi entirely.
  const claimed = service ? [...service.split(/[-_\s]+/), ...(SERVICE_WORDS[service] ?? [])] : [];
  const rest = claimed.reduce((t, w) => t.replace(new RegExp(`\\b${w}(?:e?s)?\\b`, 'g'), ' '), q);
  const city =
    // length >= 3: a stray letter from an apostrophe ("client's" -> "s") was
    // matching a one-character city and filtering the search to nothing.
    cities.find(
      (c) => c.length >= 3 && mentions(rest, c) && (!AMBIGUOUS_CITIES.has(c) || precededByPlace(rest, c)),
    ) ??
    null;

  const catByLength = [...REQUEST_CATEGORIES].sort((a, b) => b.length - a.length);
  const category =
    catByLength.find((c) => mentions(q, c)) ??
    catByLength.find((c) => (CATEGORY_WORDS[c] ?? []).some((w) => hasWord(q, w))) ??
    null;

  return { category, service: service as VendorService | null, city };
}


type Parsed = { category: string | null; service: VendorService | null; city: string | null };

const PHRASES = [
  "need a nutritionist in Mumbai",
  "birthday balloons and decoration at home",
  "arrange a private jet to Delhi",
  "wine delivery tonight",
  "book a spa appointment for two",
  "urgent laptop repair",
  "sneakers size 42",
  "yacht for a weekend in Goa",
  "someone to walk the dog",
  "resturant resevation for anniversry",
];

async function main() {
  const cities = await getVendorCities();
  console.log(`${cities.length.toLocaleString()} cities on file\n`);

  for (const phrase of PHRASES) {
    const parsed = parseRequest(phrase, cities);
    const chips = [
      parsed.category ? `category=${getRequestCategoryLabel(parsed.category)}` : null,
      parsed.service ? `service=${getServiceLabel(parsed.service)}` : null,
      parsed.city ? `city=${parsed.city}` : null,
    ].filter(Boolean).join("  ");

    console.log(`\n"${phrase}"`);
    console.log(`   understood as: ${chips || "(no chips — the phrase alone searches past jobs)"}`);

    const ranked = await rankVendorsForRequest({
      phrase,
      category: parsed.category,
      service: parsed.service,
      city: parsed.city,
      limit: 3,
    });
    if (!ranked.length) { console.log("   → no vendors matched"); continue; }
    for (const r of ranked) {
      console.log(`   → ${r.vendor.name}`);
      console.log(`        ${r.reasons[0] ?? ""}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
