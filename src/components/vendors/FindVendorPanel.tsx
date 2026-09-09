'use client';

// FindVendorPanel — the "best vendor for this request" bench.
//
// One box, the request in plain words. It matches those words against OUR OWN
// vocabularies (REQUEST_CATEGORIES — what a ticket is filed under, which is the
// keyspace the ranker's capability filter uses, NOT the supplier-identity
// VENDOR_CATEGORIES — plus VENDOR_SERVICES and the cities we actually have on
// file) and shows what it understood as chips you can clear —
// then calls rankVendorsAction, which is the same rankVendorsForRequest the
// future ticket screen and Elaya's tool will call. Nothing here re-ranks.
//
// The SENTENCE is the search. It goes to the ranker whole and is matched
// against the ticket titles of 47,441 past jobs (0188), so "order for black
// forest cake" finds the cake suppliers without "cake" being in any vocabulary.
// The keyword parse still runs, but only to show CHIPS — what it recognised —
// which narrow the search and can be cleared. Nothing here is required, and
// nothing here re-ranks.

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { VendorScoreRing } from './VendorScoreRing';
import { rankVendorsAction } from '@/lib/actions/vendors';
import {
  REQUEST_CATEGORIES,
  VENDOR_SERVICES,
  VENDOR_SERVICE_LABELS,
  VENDORS_PATH,
  getRequestCategoryLabel,
  type VendorService,
  type RequestCategory,
} from '@/lib/constants/vendors';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';
import type { RankedVendor } from '@/lib/types/vendor';

type Parsed = {
  category: string | null;
  service: VendorService | null;
  city: string | null;
};

/**
 * The words people actually type, mapped onto the vocabulary the data uses.
 *
 * Nobody types "car-transfer". They type "chauffeur", "cab", "driver", "pickup".
 * Nobody types "hotel-booking" — they type "hotel" or "stay". The vocabularies
 * came out of Freshdesk's category tree, not out of anyone's mouth, so the gap
 * between the two is the parser's whole job.
 *
 * Keys are extra words that mean the value; the value's own words always match
 * too. Cheap to grow — a phrase that fails is one line here.
 */
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

function Chip({
  label,
  onClear,
}: {
  label: string;
  onClear?: () => void;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '5px var(--space-3)',
        borderRadius: 'var(--neu-radius-chip)',
        background: 'var(--theme-accent-surface)',
        border: '1px solid var(--theme-accent-muted)',
        color: 'var(--neu-accent-deep)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
      }}
    >
      {label}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${label}`}
          style={{
            display: 'inline-flex',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
          }}
        >
          <X style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 2 }} />
        </button>
      )}
    </span>
  );
}

export function FindVendorPanel({ cities }: { cities: string[] }) {
  const [text, setText] = useState('');
  const [cleared, setCleared] = useState<Partial<Parsed>>({});
  const [results, setResults] = useState<RankedVendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(() => {
    const raw = parseRequest(text, cities);
    return {
      category: cleared.category === null ? null : raw.category,
      service: cleared.service === null ? null : raw.service,
      city: cleared.city === null ? null : raw.city,
    } as Parsed;
  }, [text, cities, cleared]);

  // The ranker filters on a capability row, so a category is the one thing it
  // cannot infer — without it there is nothing to rank against.
  // A service alone is a valid request — "flights to Dubai" names no
  // category, and the ranker handles that since 0187. Requiring a category
  // here is what greyed the button out on every service-only phrase.
  // Anything typed is searchable. The chips NARROW the answer; they are not
  // the answer. Requiring one is what greyed the button out on every request
  // whose words happened not to be in the vocabulary — "order for black forest
  // cake", "need a cardiologist".
  const canSearch = text.trim().length > 1 && !isPending;

  function run() {
    if (!canSearch) return;
    setError(null);
    startTransition(async () => {
      const result = await rankVendorsAction({
        // The whole sentence goes through — the ranker searches it against past
        // ticket titles first and only falls back to the chips.
        phrase: text.trim(),
        category: parsed.category,
        service: parsed.service,
        city: parsed.city,
      });
      if (result.error || !result.data) {
        setError(result.error ?? 'Could not run that search.');
        setResults(null);
        return;
      }
      setResults(result.data);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: '820px' }}>
      <div
        className="neu-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
        }}
      >
        <Search
          style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5, flexShrink: 0 }}
        />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCleared({});
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
          }}
          placeholder="What do you need? e.g. black forest cake for a birthday"
          className="serene-input"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-base)',
            color: 'var(--theme-text-primary)',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          fontSize: 'var(--text-xs)',
          color: 'var(--theme-text-tertiary)',
        }}
      >
        <span>Understood as</span>
        {parsed.category && (
          <Chip
            label={getRequestCategoryLabel(parsed.category)}
            onClear={() => setCleared((c) => ({ ...c, category: null }))}
          />
        )}
        {parsed.service && (
          <Chip
            label={VENDOR_SERVICE_LABELS[parsed.service]}
            onClear={() => setCleared((c) => ({ ...c, service: null }))}
          />
        )}
        {parsed.city && (
          <Chip
            label={parsed.city.charAt(0).toUpperCase() + parsed.city.slice(1)}
            onClear={() => setCleared((c) => ({ ...c, city: null }))}
          />
        )}
        {!parsed.category && !parsed.service && !parsed.city && (
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
            searching past jobs for these words
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <Button size="sm" onClick={run} disabled={!canSearch} loading={isPending} loadingLabel="Finding…">
            Find
          </Button>
        </span>
      </div>

      {error && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger-text)' }}>{error}</span>
      )}

      {results != null && results.length === 0 && (
        <EmptyState
          variant="inline"
          title="Nobody offers that yet."
          description="No active vendor has a capability covering this request."
        />
      )}

      {results != null && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {results.map((r, i) => (
            <motion.div
              key={r.vendor.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO, delay: Math.min(i * 0.04, 0.16) }}
            >
              <Link
                href={`${VENDORS_PATH}/${r.vendor.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-5)',
                  padding: 'var(--space-4) var(--space-5)',
                  borderRadius: 'var(--neu-radius-tile)',
                  background: 'var(--theme-paper)',
                  border: '1px solid var(--theme-paper-border)',
                  boxShadow: 'var(--shadow-1)',
                }}
              >
                <VendorScoreRing score={r.score} size={64} stroke={6} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--theme-text-tertiary)',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontWeight: 'var(--weight-medium)' }}>{r.vendor.name}</span>
                  </div>
                  <ul
                    style={{
                      margin: 'var(--space-2) 0 0',
                      padding: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    {r.reasons.map((reason) => (
                      <li
                        key={reason}
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}
                      >
                        · {reason}
                      </li>
                    ))}
                    {r.flags.map((flag) => (
                      <li
                        key={flag}
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-text)' }}
                      >
                        ! {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
