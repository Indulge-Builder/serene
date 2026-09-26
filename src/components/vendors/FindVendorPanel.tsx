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
// against the ticket titles of 47,441 past jobs (0189), so "order for black
// forest cake" finds the cake suppliers without "cake" being in any vocabulary.
// The keyword parse still runs, but only to show CHIPS — what it recognised —
// which narrow the search and can be cleared. Nothing here is required, and
// nothing here re-ranks.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, Search, X } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
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
 * Cities that are also ordinary English words. "Something nice for a member's
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
    // length >= 3: a stray letter from an apostrophe ("member's" -> "s") was
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

/** Requests shown under an empty box: the way the team actually phrases them. A tap
 *  fills the box and runs the search, so the page teaches itself. */
const EXAMPLES = [
  'Black forest cake for a birthday',
  'Chauffeur in Dubai for three days',
  'Dinner for six in Mumbai tonight',
];

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
        <Button
          variant="ghost"
          iconOnly size="sm"
          type="button"
          onClick={onClear}
          aria-label={`Remove ${label}`}
          style={{ display: 'inline-flex' }}
        >
          <X style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 2 }} />
        </Button>
      )}
    </span>
  );
}

export function FindVendorPanel({ cities }: { cities: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Coming BACK from a vendor page, the search that led there is in ?q= (put
  // there by the result link's ?from=), so the box is pre-filled and the
  // search re-run once — not an empty box and a lost query.
  const initialQ = searchParams.get('q') ?? '';
  const [text, setText] = useState(initialQ);
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
  // category, and the ranker handles that since 0188. Requiring a category
  // here is what greyed the button out on every service-only phrase.
  // Anything typed is searchable. The chips NARROW the answer; they are not
  // the answer. Requiring one is what greyed the button out on every request
  // whose words happened not to be in the vocabulary — "order for black forest
  // cake", "need a cardiologist".
  const canSearch = text.trim().length > 1 && !isPending;
  // Where a result link sends you back to: this page with the search in the
  // URL, so it can be re-run rather than lost (the leads ?from= pattern).
  const fromUrl = text.trim() ? `${pathname}?q=${encodeURIComponent(text.trim())}` : pathname;

  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current || initialQ.trim().length <= 1) return;
    ranOnce.current = true;
    run();
    // Mount-only by design: `run` reads the current text, which IS initialQ here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(phrase: string, chips: Parsed) {
    setError(null);
    startTransition(async () => {
      const result = await rankVendorsAction({
        // The whole sentence goes through — the ranker searches it against past
        // ticket titles first and only falls back to the chips.
        phrase,
        category: chips.category,
        service: chips.service,
        city: chips.city,
      });
      if (result.error || !result.data) {
        setError(result.error ?? 'Could not run that search.');
        setResults(null);
        return;
      }
      setResults(result.data);
    });
  }

  function run() {
    if (!canSearch) return;
    search(text.trim(), parsed);
  }

  /** An example request: into the box, and searched, with its own chips. */
  function tryExample(phrase: string) {
    if (isPending) return;
    setText(phrase);
    setCleared({});
    search(phrase, parseRequest(phrase, cities));
  }

  const hasChips = Boolean(parsed.category || parsed.service || parsed.city);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: '960px' }}>
      {/* The search: ONE card. A line that says how it works, the field with its
          Find button inside it, then what the words were understood as (or, while
          the box is empty, three requests to try). */}
      <section
        // Roomy on a desk, tighter on a phone where every pixel is the field's.
        className="p-5 sm:p-6"
        style={{
          background: 'var(--theme-paper)',
          border: '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--neu-radius-card)',
          boxShadow: 'var(--shadow-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--weight-normal)',
              color: 'var(--theme-text-primary)',
            }}
          >
            What does the member need?
          </h2>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
            Say it in plain words. We match them against every past job and each vendor&apos;s
            capabilities, then rank the vendors by how those jobs went.
          </p>
        </div>

        {/* One field: the shell draws the frame, the input inside is bare. */}
        <div
          className="neu-input"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
          }}
        >
          <Search
            aria-hidden="true"
            style={{ width: '1.125rem', height: '1.125rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5, flexShrink: 0 }}
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
            aria-label="What does the member need?"
            placeholder="e.g. black forest cake for a birthday"
            className="serene-input-bare"
            style={{
              flex: 1,
              minWidth: 0,
              height: '2.5rem',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-base)',
              color: 'var(--theme-text-primary)',
            }}
          />
          <Button onClick={run} disabled={!canSearch} loading={isPending} loadingLabel="Finding…">
            Find
          </Button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            minHeight: '1.75rem',
            fontSize: 'var(--text-xs)',
            color: 'var(--theme-text-tertiary)',
          }}
        >
          {!text.trim() ? (
            <>
              <span>Try</span>
              {EXAMPLES.map((example) => (
                <Button key={example} variant="control" size="sm" type="button" onClick={() => tryExample(example)}>
                  {example}
                </Button>
              ))}
            </>
          ) : hasChips ? (
            <>
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
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>
              Searching past jobs for these words.
            </span>
          )}
        </div>

        {error && (
          <span role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger-text)' }}>{error}</span>
        )}
      </section>

      {results != null && <VendorMatches results={results} fromUrl={fromUrl} />}
    </div>
  );
}

/**
 * The ranked answer as ONE card: a row per vendor (rank, score ring, name, the
 * reasons it ranked, any cautions), each row a link to the vendor. Display only;
 * the order is the ranker's.
 */
export function VendorMatches({ results, fromUrl }: { results: RankedVendor[]; fromUrl: string }) {
  return (
    <SectionCard
      title="Best matches"
      bodyPadding={false}
      headerRight={
        results.length > 0 ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--neu-header-ink)' }}>
            {results.length} {results.length === 1 ? 'vendor' : 'vendors'}
          </span>
        ) : undefined
      }
    >
      {results.length === 0 ? (
        <EmptyState
          variant="inline"
          title="Nobody offers that yet."
          description="No active vendor has a capability covering this request. Try fewer words, or clear a chip."
        />
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 'var(--space-2)' }}>
          {results.map((r, i) => (
            <motion.li
              key={r.vendor.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO, delay: Math.min(i * 0.04, 0.16) }}
              style={{ borderTop: i > 0 ? '1px solid var(--theme-paper-border)' : undefined }}
            >
              <Link
                href={`${VENDORS_PATH}/${r.vendor.id}?from=${encodeURIComponent(fromUrl)}`}
                // The shared rich-row material (SelectionButton's), on a link. The rank
                // column appears from sm: on a phone the order speaks for itself and
                // the text needs the width.
                className="serene-selection grid grid-cols-[48px_minmax(0,1fr)_auto] sm:grid-cols-[1.75rem_48px_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4"
                data-appearance="option"
                style={{ padding: 'var(--space-3)', textDecoration: 'none' }}
              >
                <span
                  className="hidden sm:block"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--theme-text-tertiary)',
                    textAlign: 'right',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <VendorScoreRing score={r.score} size={48} stroke={5} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', overflowWrap: 'anywhere' }}>
                    {r.vendor.name}
                  </span>
                  {r.reasons.length > 0 && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                      {r.reasons.join(' · ')}
                    </span>
                  )}
                  {r.flags.length > 0 && (
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                      {r.flags.map((flag) => (
                        <span
                          key={flag}
                          style={{
                            fontSize: 'var(--text-2xs)',
                            fontWeight: 'var(--weight-medium)',
                            padding: '1px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-warning-light)',
                            color: 'var(--color-warning-text)',
                          }}
                        >
                          {flag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  style={{ width: '1rem', height: '1rem', color: 'var(--theme-text-tertiary)', strokeWidth: 1.5 }}
                />
              </Link>
            </motion.li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
