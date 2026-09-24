import { Badge } from '@/components/ui/Badge';
// ZohoStatusPill — THE Zoho invoice / bill status pill (the FreshdeskStatusPill shape):
// tone from constants/zoho.ts, semantic tokens only. Server-component-safe.

import { zohoInvoiceStatus } from '@/lib/constants/zoho';

export function ZohoStatusPill({ status }: { status: string }) {
  const s = zohoInvoiceStatus(status);
  return (
    <Badge tone={s.tone} size="xs">
      {s.label}
    </Badge>
  );
}
