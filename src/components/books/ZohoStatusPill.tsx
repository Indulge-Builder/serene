// ZohoStatusPill — THE Zoho invoice / bill status pill (the FreshdeskStatusPill shape):
// tone from constants/zoho.ts, semantic tokens only. Server-component-safe.

import { zohoInvoiceStatus } from '@/lib/constants/zoho';

const TONES: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--color-neutral-light)', fg: 'var(--theme-text-secondary)' },
  info: { bg: 'var(--color-info-light)', fg: 'var(--color-info-text)' },
  warning: { bg: 'var(--color-warning-light)', fg: 'var(--color-warning-text)' },
  danger: { bg: 'var(--color-danger-light)', fg: 'var(--color-danger-text)' },
  success: { bg: 'var(--color-success-light)', fg: 'var(--color-success-text)' },
};

export function ZohoStatusPill({ status }: { status: string }) {
  const s = zohoInvoiceStatus(status);
  const t = TONES[s.tone] ?? TONES.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-medium)', letterSpacing: '0.02em', background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}
