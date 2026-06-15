'use client';

// Call Intelligence — full detail view for one service_cases row, opened from
// a CaseListRow on /helpdesk. Shows EVERYTHING saved on the case: category,
// featured flag, location, full summary, outcome note, all tags. Composes
// ui/modal.tsx (Modal rule — never reimplement chrome). Display-only EXCEPT
// the admin/founder Edit affordance (canEdit) — which opens the SHARED
// AddSuggestionModal prefilled in edit mode (R-01, no second form/action).
//
// canEdit is the COSMETIC gate only: upsertServiceCaseAction re-checks the
// admin/founder role server-side (so does the service_cases UPDATE RLS), so a
// forged call from a non-admin still fails even though the button is hidden.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Pencil, Star } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';
import { CategoryTag } from './CategoryTag';
import type { ServiceCase } from '@/lib/services/intelligence-service';

// Edit modal loads on intent (perf G-1), kept mounted after first open via
// useMountOnFirstOpen so modal.tsx's internal exit animation still plays.
const AddSuggestionModal = dynamic(
  () => import('@/components/intelligence/AddSuggestionModal').then((m) => m.AddSuggestionModal),
  { ssr: false },
);

type CaseDetailModalProps = {
  open:        boolean;
  onClose:     () => void;
  serviceCase: ServiceCase;
  /** admin/founder only — shows the Edit button. Server-gated regardless. */
  canEdit?:    boolean;
};

export function CaseDetailModal({ open, onClose, serviceCase: c, canEdit = false }: CaseDetailModalProps) {
  const location = [c.city, c.country].filter(Boolean).join(', ');

  const [editOpen, setEditOpen] = useState(false);
  const editMounted = useMountOnFirstOpen(editOpen);

  // The edit save closes BOTH modals — the refreshed RSC payload re-seeds the
  // list/library, so the row reflects the change without a client-side merge.
  function handleEditClose() {
    setEditOpen(false);
    onClose();
  }

  const footer = canEdit ? (
    <Button variant="secondary" iconLeft={Pencil} onClick={() => setEditOpen(true)}>
      Edit
    </Button>
  ) : undefined;

  return (
    <>
    <Modal open={open} onClose={onClose} title={c.title} footer={footer} maxWidth="max-w-xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <CategoryTag category={c.category} />
          {c.is_featured && (
            <span
              style={{
                display:       'inline-flex',
                alignItems:    'center',
                gap:           '4px',
                padding:       '2px 8px',
                borderRadius:  'var(--radius-full)',
                background:    'var(--theme-paper-subtle)',
                border:        '1px solid var(--theme-paper-border)',
                color:         'var(--theme-accent)',
                fontFamily:    'var(--font-sans)',
                fontSize:      'var(--text-2xs)',
                fontWeight:    'var(--weight-medium)',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              <Star size={10} strokeWidth={1.5} style={{ fill: 'var(--theme-accent)' }} />
              Featured
            </span>
          )}
          {location && (
            <span
              style={{
                display:    'inline-flex',
                alignItems: 'center',
                gap:        '4px',
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-tertiary)',
              }}
            >
              <MapPin size={12} strokeWidth={1.5} />
              {location}
            </span>
          )}
        </div>

        {/* The story — full summary, no clamp */}
        <div>
          <p className="label-micro" style={{ marginBottom: 'var(--space-2)' }}>
            The story
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize:   'var(--text-sm)',
              color:      'var(--theme-text-primary)',
              lineHeight: 'var(--leading-relaxed)',
              margin:     0,
              whiteSpace: 'pre-line',
            }}
          >
            {c.summary}
          </p>
        </div>

        {c.outcome_note && (
          <div>
            <p className="label-micro" style={{ marginBottom: 'var(--space-2)' }}>
              Outcome
            </p>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                fontStyle:  'italic',
                color:      'var(--theme-text-secondary)',
                lineHeight: 'var(--leading-relaxed)',
                margin:     0,
              }}
            >
              {c.outcome_note}
            </p>
          </div>
        )}

        {c.tags.length > 0 && (
          <div
            style={{
              paddingTop: 'var(--space-4)',
              borderTop:  '1px solid var(--theme-paper-border)',
            }}
          >
            <p className="label-micro" style={{ marginBottom: 'var(--space-2)' }}>
              Tags
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
              {c.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding:      '1px 7px',
                    borderRadius: 'var(--radius-full)',
                    background:   'var(--theme-paper-subtle)',
                    border:       '1px solid var(--theme-paper-border)',
                    fontFamily:   'var(--font-mono)',
                    fontSize:     'var(--text-2xs)',
                    color:        'var(--theme-text-tertiary)',
                    whiteSpace:   'nowrap',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>

    {editMounted && (
      <AddSuggestionModal
        open={editOpen}
        onClose={handleEditClose}
        initialDomain={c.domain}
        serviceCase={c}
      />
    )}
    </>
  );
}
