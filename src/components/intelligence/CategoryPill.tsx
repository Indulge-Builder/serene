'use client';

// Call Intelligence — single category filter pill (helpdesk filter row).
// Single-select: the parent owns activeCategory state. Active = accent wash
// float (neumorphic selection grammar — never a solid fill, never inset).
// Press feedback is the CSS .serene-pressable mechanism (never a second Framer
// whileTap); flexShrink: 0 keeps the pill intact in FilterBar's mobile
// scroll row.

type CategoryPillProps = {
  label:   string;
  active:  boolean;
  onClick: () => void;
};

export function CategoryPill({ label, active, onClick }: CategoryPillProps) {
  return (
    <Button
      variant="control"
      active={active} size="sm"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="serene-pressable serene-touch"
      style={{ whiteSpace:    'nowrap', flexShrink:    0 }}
    >
      {label}
    </Button>
  );
}import { Button } from '@/components/ui/Button';
