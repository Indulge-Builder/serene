'use client';

// VendorAdminActions — the two things only an owner of the data may do to a vendor
// row itself: fold another row into it, and take it out of circulation.
//
// WHY THEY LIVE TOGETHER
// Both exist for the same reason and are reached at the same moment: the live
// extractor (0213/0214) writes vendors by itself, so it sometimes writes the same
// supplier twice, and sometimes writes something that is not a supplier at all.
// Someone looking at a wrong row wants one of these two answers, and having them in
// one place means never wondering which page the other one was on.
//
// Both are gated to admin/founder, with the status change — the writes here that are
// not additive. The rest of the module is open to the whole concierge floor (0221).
//
// NEITHER DESTROYS ANYTHING.
//   Merge moves the other row's jobs, reviews, notes and preferences onto this one
//   and keeps its name as an alias, so the extractor matches that spelling next time
//   instead of recreating it. What it cannot keep — the other spine row — is written
//   to vendor_merges in full.
//   Remove does one of two things and says which BEFORE you press it (0230). A vendor
//   with nothing attached — the "Client name- AKSHAT SHAH" the extractor writes by
//   mistake — is genuinely deleted, because deleting it costs nothing. A vendor with
//   jobs on it is hidden instead and everything is kept, because those rows record
//   money that moved and someone having filed them under the wrong name does not make
//   them untrue. The SQL takes the count again under a row lock, so the page's view
//   cannot cause a delete.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge, Trash2, Undo2, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from '@/lib/toast';
import { mergeVendorsAction, removeVendorAction, searchVendorsAction, setVendorDeletedAction } from '@/lib/actions/vendors';
import { VENDORS_PATH } from '@/lib/constants/vendors';
import type { VendorRow } from '@/lib/types/vendor';

type Props = {
  vendor: Pick<VendorRow, 'id' | 'name' | 'deleted_at'>;
  /**
   * Jobs, ratings and notes on this vendor. Decides which warning is shown — never
   * what happens: remove_vendor counts again inside its own transaction (0230).
   */
  history: { jobs: number; reviews: number; notes: number };
  /**
   * Rows that are probably this same supplier (getLikelyDuplicates: the extractor's
   * own near-miss flags, a shared phone, a name that is one of our aliases). Shown
   * in the Merge dialog before anyone types, so the common case is one click.
   */
  suggested?: VendorRow[];
};

export function VendorAdminActions({ vendor, history, suggested = [] }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [mergeOpen, setMergeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VendorRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<VendorRow | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const debounced = useDebounce(query, 300);
  const removed = vendor.deleted_at !== null;
  // What the warning must say. The server decides for real; this only chooses words.
  const attached = history.jobs + history.reviews + history.notes;
  const willDelete = attached === 0;

  // The search runs on the DEBOUNCED value, never on every keystroke, and never on
  // a near-empty box: an empty query matches every vendor, which is 21,000 rows of
  // noise in a picker. `cancelled` drops a slower earlier reply so the list always
  // belongs to what is in the box now.
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void (async () => {
      const res = await searchVendorsAction({ query: q, limit: 8 });
      if (cancelled) return;
      setSearching(false);
      if (res.error) {
        toast.danger(res.error);
        return;
      }
      // Never offer this vendor as something to merge into itself. The action and
      // the SQL both refuse it; this is so the option is never presented.
      setResults((res.data ?? []).filter((v) => v.id !== vendor.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, vendor.id]);

  function doMerge() {
    if (!picked) return;
    startTransition(async () => {
      const res = await mergeVendorsAction({ keep_id: vendor.id, merge_id: picked.id });
      if (res.error || !res.data) {
        toast.danger(res.error ?? 'The vendors could not be merged.');
        return;
      }
      const m = res.data;
      const moved = m.engagements_moved + m.engagements_folded;
      toast.success(`"${m.merged_name}" merged into ${vendor.name}`, {
        message:
          `${moved} job${moved === 1 ? '' : 's'} carried over` +
          (m.engagements_folded ? `, ${m.engagements_folded} folded into a job already here` : '') +
          `. "${m.merged_name}" is now an alias.`,
      });
      setMergeOpen(false);
      setPicked(null);
      setQuery('');
      setResults(null);
      router.refresh();
    });
  }

  function doRemove() {
    startTransition(async () => {
      const res = await removeVendorAction({ id: vendor.id });
      if (res.error || !res.data) {
        toast.danger(res.error ?? 'The vendor could not be removed.');
        return;
      }
      setRemoveOpen(false);
      // The server may have chosen the other branch — a job written a moment ago is
      // enough — so the message reports what HAPPENED, never what was expected.
      if (res.data.mode === 'deleted') {
        toast.success(`${res.data.vendor_name} deleted`, {
          message: 'It had nothing on record, so the row is gone.',
        });
      } else {
        const n = res.data.history.jobs;
        toast.success(`${res.data.vendor_name} hidden`, {
          message: `It is out of the list, search and Find a vendor. ${n} job${n === 1 ? '' : 's'} kept — open its page to restore it.`,
        });
      }
      router.push(VENDORS_PATH);
    });
  }

  function doRestore() {
    startTransition(async () => {
      const res = await setVendorDeletedAction({ id: vendor.id, deleted: false });
      if (res.error) {
        toast.danger(res.error);
        return;
      }
      toast.success(`${vendor.name} restored`);
      router.refresh();
    });
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: 'auto' }}>
        <Button variant="ghost" size="sm" onClick={() => setMergeOpen(true)} disabled={pending || removed}>
          <GitMerge style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
          Merge in
        </Button>
        {removed ? (
          <Button variant="secondary" size="sm" onClick={doRestore} disabled={pending}>
            <Undo2 style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
            Restore
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setRemoveOpen(true)} disabled={pending}>
            <Trash2 style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
            {willDelete ? 'Delete' : 'Hide'}
          </Button>
        )}
      </div>

      {/* ── Merge ───────────────────────────────────────────────────────────── */}
      <Dialog
        open={mergeOpen}
        onClose={() => {
          if (pending) return;
          setMergeOpen(false);
          setPicked(null);
          setQuery('');
          setResults(null);
        }}
        title="Merge another vendor in"
        description={`Everything from the vendor you pick moves onto ${vendor.name}, and that row disappears.`}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setMergeOpen(false);
                setPicked(null);
                setQuery('');
                setResults(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={doMerge} disabled={!picked || pending} loading={pending}>
              {picked ? `Merge ${picked.name} in` : 'Merge in'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>
              Find the duplicate
            </span>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                style={{
                  position: 'absolute',
                  left: 'var(--space-3)',
                  width: '1rem',
                  height: '1rem',
                  strokeWidth: 1.5,
                  color: 'var(--theme-text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
              <input
                className="serene-input neu-input"
                style={{ paddingLeft: 'var(--space-8)' }}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                }}
                placeholder="Name, alias, phone or a contact's name"
                enterKeyHint="search"
                autoFocus
                disabled={pending}
              />
            </span>
          </label>

          {/* The shortlist: shown while the box is empty, gone the moment a search
              takes over. Same row chrome as the results so picking feels the same. */}
          {results === null && !searching && suggested.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                Probably the same supplier
              </span>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 0, padding: 0 }}>
                {suggested.map((v) => {
                  const isPicked = picked?.id === v.id;
                  return (
                    <li key={v.id} style={{ listStyle: 'none' }}>
                      <SelectionButton
                        selected={isPicked}
                        appearance="row"
                        type="button"
                        onClick={() => setPicked(isPicked ? null : v)}
                        disabled={pending}
                        aria-pressed={isPicked}
                        style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-3)',
                                width: '100%',
                                textAlign: 'left',
                                padding: 'var(--space-3)',
                            }}
                      >
                        <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span
                            style={{
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'var(--weight-medium)',
                              color: 'var(--theme-text-primary)',
                            }}
                          >
                            {v.name}
                          </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                            {[v.category, v.home_city, v.primary_phone].filter(Boolean).join(' · ') || 'No details'}
                          </span>
                        </span>
                      </SelectionButton>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {searching && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-tertiary)', margin: 0 }}>Searching…</p>
          )}

          {!searching && results !== null && results.length === 0 && (
            <EmptyState variant="inline" title="Nothing matches that" />
          )}

          {!searching && results !== null && results.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 0, padding: 0 }}>
              {results.map((v) => {
                const isPicked = picked?.id === v.id;
                return (
                  <li key={v.id} style={{ listStyle: 'none' }}>
                    <SelectionButton
                      selected={isPicked}
                      appearance="row"
                      type="button"
                      onClick={() => setPicked(isPicked ? null : v)}
                      disabled={pending}
                      aria-pressed={isPicked}
                      style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-3)',
                              width: '100%',
                              textAlign: 'left',
                              padding: 'var(--space-3)',
                          }}
                    >
                      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 'var(--weight-medium)',
                            color: 'var(--theme-text-primary)',
                          }}
                        >
                          {v.name}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                          {[v.category, v.home_city, v.primary_phone].filter(Boolean).join(' · ') || 'No details'}
                        </span>
                      </span>
                    </SelectionButton>
                  </li>
                );
              })}
            </ul>
          )}

          {picked && (
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--theme-text-secondary)',
                margin: 0,
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--theme-paper-subtle)',
              }}
            >
              <strong style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>
                {picked.name}
              </strong>{' '}
              will be folded into{' '}
              <strong style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--theme-text-primary)' }}>
                {vendor.name}
              </strong>
              . Its jobs, ratings, notes and preferences move across, and its name is kept as an alias so the
              spelling still finds this vendor. This cannot be undone from here.
            </p>
          )}

        </div>
      </Dialog>

      {/* ── Remove ──────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={removeOpen}
        title={willDelete ? `Delete ${vendor.name}?` : `Hide ${vendor.name}?`}
        body={
          willDelete ? (
            <>
              <p style={{ margin: 0 }}>
                <strong style={{ fontWeight: 'var(--weight-semibold)' }}>
                  This vendor has no jobs, no ratings and no notes, so it will be deleted for good.
                </strong>{' '}
                There is nothing attached to lose, and nothing to restore afterwards.
              </p>
              <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--theme-text-secondary)' }}>
                If this is really the same supplier as another row, use <em>Merge in</em> on the row you are keeping
                instead.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                It disappears from the vendor list, from search and from Find a vendor. Anyone looking for a supplier
                will not see it.
              </p>
              <p style={{ margin: 'var(--space-3) 0 0' }}>
                <strong style={{ fontWeight: 'var(--weight-semibold)' }}>Nothing is deleted.</strong> It has{' '}
                {history.jobs} job{history.jobs === 1 ? '' : 's'}
                {history.reviews > 0 ? `, ${history.reviews} rating${history.reviews === 1 ? '' : 's'}` : ''}
                {history.notes > 0 ? `, ${history.notes} note${history.notes === 1 ? '' : 's'}` : ''} on record, and
                those stay exactly as they are — the money on a job is the reason the row cannot simply go. You can
                restore it from this page at any time.
              </p>
              <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--theme-text-secondary)' }}>
                If this is the same supplier as another row, use <em>Merge in</em> on the row you are keeping instead —
                that carries the history across rather than hiding it.
              </p>
            </>
          )
        }
        confirmLabel={willDelete ? 'Delete' : 'Hide'}
        pendingLabel={willDelete ? 'Deleting…' : 'Hiding…'}
        danger
        pending={pending}
        onConfirm={doRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </>
  );
}
