// Static accent pill showing a case's category label. Display-only,
// server-component-safe. NOT the filter pill — that is CategoryPill (a
// button with active state). Shared by CaseCard, CaseListRow, and
// CaseDetailModal so the pill style exists once.

import { getServiceCategoryLabel } from '@/lib/constants/interests';

export function CategoryTag({ category }: { category: string }) {
  return (
    <span
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        padding:       '2px 8px',
        borderRadius:  'var(--radius-full)',
        background:    'var(--theme-accent-surface)',
        color:         'var(--theme-accent)',
        fontFamily:    'var(--font-sans)',
        fontSize:      'var(--text-2xs)',
        fontWeight:    'var(--weight-medium)',
        letterSpacing: 'var(--tracking-wide)',
        whiteSpace:    'nowrap',
      }}
    >
      {getServiceCategoryLabel(category)}
    </span>
  );
}
