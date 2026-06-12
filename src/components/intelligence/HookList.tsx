// Call Intelligence — conversation hooks list. Compact numbered text rows
// (not cards) per spec §9. Server-component-safe: no hooks, no motion —
// hooks appear with their parent section, never staggered (spec §8).

import type { ConversationHook } from '@/lib/services/intelligence-service';

type HookListProps = {
  hooks: ConversationHook[];
  /** Section label, e.g. "Talking points" / "Talking points for Travel". */
  label: string;
};

export function HookList({ hooks, label }: HookListProps) {
  if (hooks.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
        {label}
      </span>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {hooks.map((hook, i) => (
          <li key={hook.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize:   'var(--text-2xs)',
                color:      'var(--theme-text-tertiary)',
                flexShrink: 0,
                minWidth:   '16px',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-sm)',
                fontStyle:  'italic',
                color:      'var(--theme-text-secondary)',
                lineHeight: 1.6,
              }}
            >
              {hook.hook}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
