'use client';

// VendorCategoryPicker — the one editable field on the vendor dossier.
//
// A vendor's category answers "what is this supplier", and 4,082 of the
// imported vendors answer "Unclassified" because the extraction genuinely
// could not tell (a one-line mention in a single ticket) or because the row is
// a PERSON, who has no business category at all. Their ticket history still
// knows what they do — that is what the ranker matches on — but the list
// column and the Category filter read this field, so an unclassified vendor is
// invisible to browsing until a human says what it is.
//
// So: the chip that displayed the category is now the control that sets it.
// No modal, no separate edit mode — the thing you are looking at is the thing
// you change.
//
// Display + one action (A-06 permits the action; the query stays in the
// service). Optimistic: the chip shows the new value immediately and REVERTS on
// error, because a category that silently failed to save is worse than one
// that never changed.

import { useState, useTransition } from 'react';
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { usePortalAnchor } from '@/hooks/usePortalAnchor';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { toast } from '@/lib/toast';
import { updateVendorAction } from '@/lib/actions/vendors';
import { vendorCategoryOptions, getVendorCategoryLabel, toVocabularyKey } from '@/lib/constants/vendors';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

export function VendorCategoryPicker({
  vendorId,
  category,
  categoriesInUse = [],
}: {
  vendorId: string;
  category: string | null;
  /** Categories already in the database, so one added by hand is offered next time. */
  categoriesInUse?: string[];
}) {
  const [value, setValue] = useState(category);
  const [pending, startTransition] = useTransition();
  // A category added here has to appear in THIS list immediately — the page
  // will not have re-rendered by the time the panel reopens.
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const anchor = usePortalAnchor<HTMLButtonElement>();

  const options = vendorCategoryOptions([...categoriesInUse, ...added, ...(value ? [value] : [])]);

  function commitNew() {
    const key = toVocabularyKey(draft);
    setAdding(false);
    setDraft('');
    if (!key) return;
    setAdded((a) => (a.includes(key) ? a : [...a, key]));
    choose(key);
  }

  function choose(next: string) {
    anchor.close();
    setAdding(false);
    if (next === value) return;
    const previous = value;
    setValue(next);            // optimistic
    startTransition(async () => {
      const res = await updateVendorAction({ id: vendorId, category: next });
      if (res.error) {
        setValue(previous);    // never leave a lie on screen
        // The app toast: it has its own timer and dismiss. The first version
        // rendered a pill here that closed onAnimationEnd — with no animation
        // on it, it never closed.
        toast.danger(res.error ?? 'Could not save the category.');
      }
    });
  }

  return (
    <>
      <button
        ref={anchor.triggerRef}
        type="button"
        onClick={anchor.toggle}
        disabled={pending}
        title="Change what kind of supplier this is"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          padding: '3px var(--space-3)',
          borderRadius: 'var(--radius-full)',
          border: 'none',
          background: 'var(--theme-accent-surface)',
          color: 'var(--neu-accent-deep)',
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-medium)',
          fontFamily: 'inherit',
          cursor: pending ? 'progress' : 'pointer',
          opacity: pending ? 0.6 : 1,
          transition: `opacity ${FAST_DURATION}s ${EASE_OUT_EXPO}`,
        }}
      >
        {getVendorCategoryLabel(value)}
        {pending ? (
          <Loader2 style={{ width: 12, height: 12, strokeWidth: 2 }} className="animate-spin" />
        ) : (
          <ChevronDown style={{ width: 12, height: 12, strokeWidth: 2 }} />
        )}
      </button>

      <FloatingPanel {...anchor.panelProps} panelKey={`vendor-category-${vendorId}`}>
        <div style={{ padding: 'var(--space-2)', minWidth: 200, maxHeight: 320, overflowY: 'auto' }}>
          {options.map((opt) => {
            const selected = opt.id === value;
            return (
              <motion.button
                key={opt.id}
                type="button"
                onClick={() => choose(opt.id)}
                whileHover={{ x: 2 }}
                transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--neu-radius-chip)',
                  border: 'none',
                  background: selected ? 'var(--theme-accent-surface)' : 'transparent',
                  color: selected ? 'var(--neu-accent-deep)' : 'var(--theme-text-primary)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
                {selected && <Check style={{ width: 14, height: 14, strokeWidth: 2, flexShrink: 0 }} />}
              </motion.button>
            );
          })}

          {/* vendors.category has no SQL CHECK — it is free text by design
              (0183) — so a category typed here is as real as a built-in one and
              needs no migration. It is slugified through the SAME
              toVocabularyKey the loader and the Zod schema use, so "Private
              Aviation" lands on the one key all three agree on. */}
          <div style={{ borderTop: '1px solid var(--theme-paper-border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
            {adding ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNew();
                  if (e.key === 'Escape') { setAdding(false); setDraft(''); }
                }}
                onBlur={commitNew}
                placeholder="New category…"
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--neu-radius-chip)',
                  border: '1px solid var(--theme-accent-muted)',
                  background: 'var(--theme-paper)',
                  color: 'var(--theme-text-primary)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--neu-radius-chip)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--theme-text-secondary)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <Plus style={{ width: 14, height: 14, strokeWidth: 2 }} />
                Add a category
              </button>
            )}
          </div>
        </div>
      </FloatingPanel>
    </>
  );
}
