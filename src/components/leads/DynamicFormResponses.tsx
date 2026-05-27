import { FileText } from 'lucide-react';

type Props = {
  formData: Record<string, unknown>;
};

export function DynamicFormResponses({ formData }: Props) {
  const entries = Object.entries(formData).filter(([, v]) => v !== null && v !== '');

  if (entries.length === 0) return null;

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        <FileText
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            color:       'var(--theme-text-tertiary)',
            strokeWidth: 1.5,
            flexShrink:  0,
          }}
        />
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
          }}
        >
          Form Responses
        </span>
        <span
          style={{
            marginLeft:   'auto',
            fontSize:     'var(--text-xs)',
            color:        'var(--theme-text-tertiary)',
          }}
        >
          {entries.length} field{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Entries */}
      <div style={{ padding: 'var(--space-5)' }}>
        <dl
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1.5fr',
            gap:                 '0',
            margin:              0,
          }}
        >
          {entries.map(([key, value], idx) => (
            <FormRow
              key={key}
              label={formatKey(key)}
              value={formatValue(value)}
              isLast={idx === entries.length - 1}
            />
          ))}
        </dl>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Single key/value row
// ─────────────────────────────────────────────
function FormRow({ label, value, isLast }: { label: string; value: string; isLast: boolean }) {
  const borderStyle = isLast ? 'none' : '1px solid var(--theme-paper-border)';

  return (
    <>
      <dt
        style={{
          padding:       'var(--space-3) var(--space-3) var(--space-3) 0',
          borderBottom:  borderStyle,
          fontSize:      'var(--text-xs)',
          fontWeight:    'var(--weight-medium)',
          color:         'var(--theme-text-secondary)',
          wordBreak:     'break-word',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          padding:       'var(--space-3) 0 var(--space-3) var(--space-4)',
          borderBottom:  borderStyle,
          borderLeft:    '1px solid var(--theme-paper-border)',
          fontSize:      'var(--text-sm)',
          color:         'var(--theme-text-primary)',
          fontFamily:    'var(--font-mono)',
          margin:        0,
          wordBreak:     'break-word',
        }}
      >
        {value}
      </dd>
    </>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Converts any key format into a readable label.
// Handles: snake_case, camelCase, dot-separated slugs,
// and the long URL-encoded question strings Meta sends.
function formatKey(key: string): string {
  return key
    .replace(/\?_?$/, '')           // strip trailing ?_ or ? (Meta question slugs)
    .replace(/[_\-.]+/g, ' ')       // underscores, hyphens, dots → space
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase split
    .replace(/\s{2,}/g, ' ')        // collapse multiple spaces
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Converts answer values into readable strings.
// Underscore-joined answers (Meta's format) are split into words.
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const s = String(value);
  // Meta encodes answer values with underscores: "i_want_to_learn_more" → "i want to learn more"
  // Only apply if the string looks like a slug (no spaces, has underscores)
  if (!s.includes(' ') && s.includes('_')) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s;
}
