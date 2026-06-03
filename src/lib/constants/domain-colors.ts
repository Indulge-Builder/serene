// Domain line colours for data visualisation (line charts, multi-domain series).
// Values are CSS variable strings — must be resolved via resolveColorMap() from
// src/components/ui/charts/useChartTokens.ts before passing to Recharts stroke props
// (SVG attributes do not resolve custom properties in all browsers).
//
// Token definitions: src/styles/design-tokens.css  --domain-*
// Usage: const resolved = resolveColorMap(DOMAIN_LINE_COLORS)  inside a useEffect or useChartTokens.
//
// Never import from lib/services/ here (Rule 03 / CLAUDE.md).

import type { AppDomain } from '@/lib/types/database';

export const DOMAIN_LINE_COLORS: Record<AppDomain, string> = {
  concierge:   'var(--domain-concierge)',
  onboarding:  'var(--domain-onboarding)',
  finance:     'var(--domain-finance)',
  marketing:   'var(--domain-marketing)',
  tech:        'var(--domain-tech)',
  shop:        'var(--domain-shop)',
  b2b:         'var(--domain-b2b)',
  house:       'var(--domain-house)',
  legacy:      'var(--domain-legacy)',
};
