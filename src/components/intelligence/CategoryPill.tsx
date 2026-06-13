'use client';

// Call Intelligence — single category filter pill (helpdesk filter row).
// Single-select: the parent owns activeCategory state. Active = accent fill
// (--theme-accent-fg text — never text-inverse on accent, Surface Contract).
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="serene-pressable serene-touch"
      style={{
        padding:       '6px 14px',
        borderRadius:  'var(--radius-full)',
        border:        '1px solid',
        borderColor:   active ? 'var(--theme-accent)' : 'var(--theme-paper-border)',
        background:    active ? 'var(--theme-accent)' : 'var(--theme-paper-subtle)',
        color:         active ? 'var(--theme-accent-fg)' : 'var(--theme-text-secondary)',
        fontFamily:    'var(--font-sans)',
        fontSize:      'var(--text-xs)',
        fontWeight:    active ? 'var(--weight-medium)' : 'var(--weight-normal)',
        letterSpacing: 'var(--tracking-wide)',
        whiteSpace:    'nowrap',
        flexShrink:    0,
        cursor:        'pointer',
        transition:
          'background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)',
      }}
    >
      {label}
    </button>
  );
}
