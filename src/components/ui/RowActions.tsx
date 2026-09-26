'use client';

// EditDeleteActions — THE Edit + Delete pair at the end of a record row
// (2026-09-25; ad creatives, training assets, notes). Edit is the raised control;
// Delete is the quiet destructive action (`ghost-danger`: rose ink, a rose wash on
// hover), because a pink pill on every row of a list reads as an alarm. The strong
// red belongs to the confirm step each caller already opens. Both are labelled
// buttons: never `iconOnly` with a text child, which squeezes the word out of a
// 32px square. `deleting` runs Button's own pending treatment.

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from './Button';

export function EditDeleteActions({
  onEdit,
  onDelete,
  deleting = false,
  subject,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
  /** What the row is, for the accessible names ("creative" → "Edit creative"). */
  subject: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
      <Button variant="control" size="sm" type="button" className="serene-touch" iconLeft={Pencil} onClick={onEdit} aria-label={`Edit ${subject}`}>
        Edit
      </Button>
      <Button
        variant="ghost-danger"
        size="sm"
        type="button"
        className="serene-touch"
        iconLeft={Trash2}
        onClick={onDelete}
        loading={deleting}
        loadingLabel="Deleting…"
        aria-label={`Delete ${subject}`}
      >
        Delete
      </Button>
    </div>
  );
}
