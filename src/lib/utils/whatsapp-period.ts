import {
  isWhatsAppPeriod,
  type WhatsAppPeriod,
} from '@/lib/constants/whatsapp-period';

export type WhatsAppPeriodRange = {
  from: string;
  to:   string;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTMidnight(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

function toISTEndOfDay(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(23, 59, 59, 999);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

function getISTMondayStart(now: Date): Date {
  const istMs   = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const dow     = istDate.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  istDate.setUTCDate(istDate.getUTCDate() - daysBack);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

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
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      const first  = new Date(istNow);
      first.setUTCDate(1);
      first.setUTCHours(0, 0, 0, 0);
      const fromUtc = new Date(first.getTime() - IST_OFFSET_MS);
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
