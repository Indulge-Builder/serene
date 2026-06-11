import {
  isWhatsAppPeriod,
  type WhatsAppPeriod,
} from '@/lib/constants/whatsapp-period';
import {
  toISTMidnight,
  toISTEndOfDay,
  getISTMondayStart,
  getISTMonthStart,
} from '@/lib/utils/ist';

export type WhatsAppPeriodRange = {
  from: string;
  to:   string;
};

/** Preset ranges in IST. Custom requires at least one bound. */
export function getWhatsAppPeriodRange(
  period: WhatsAppPeriod,
  customFrom?: string | null,
  customTo?:   string | null,
): WhatsAppPeriodRange | null {
  const now = new Date();

  switch (period) {
    case 'today':
      return {
        from: toISTMidnight(now).toISOString(),
        to:   now.toISOString(),
      };

    case 'this_week':
      return {
        from: getISTMondayStart(now).toISOString(),
        to:   now.toISOString(),
      };

    case 'this_month': {
      const fromUtc = getISTMonthStart(now);
      return { from: fromUtc.toISOString(), to: now.toISOString() };
    }

    case 'custom': {
      const from = customFrom ? new Date(customFrom) : null;
      const to   = customTo   ? new Date(customTo)   : null;
      if (!from && !to) return null;
      return {
        from: from ? toISTMidnight(from).toISOString() : '1970-01-01T00:00:00.000Z',
        to:   to   ? toISTEndOfDay(to).toISOString()   : now.toISOString(),
      };
    }

    default:
      return null;
  }
}

export function parseWhatsAppPeriodFromSearchParams(params: {
  get: (key: string) => string | null;
}): {
  period:     WhatsAppPeriod | null;
  customFrom: string | null;
  customTo:   string | null;
} {
  const raw = params.get('period');
  if (!isWhatsAppPeriod(raw)) {
    return { period: null, customFrom: null, customTo: null };
  }
  return {
    period:     raw,
    customFrom: params.get('from'),
    customTo:   params.get('to'),
  };
}
