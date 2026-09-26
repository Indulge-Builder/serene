// Domain Lucide icons — one mark per app_domain for cards, pickers, and headers.
// Pair with DOMAIN_LINE_COLORS for tint; icons only, never hardcoded hex in consumers.
// The four Gia marks come from THE Gia map in domains.ts (the domain picker, the mobile
// tiles), so a domain wears one mark everywhere; this file adds only the other domains.

import {
  UserPlus,
  ConciergeBell,
  IndianRupee,
  Megaphone,
  Cpu,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import type { AppDomain } from '@/lib/types/database';
import { DOMAIN_ICONS as GIA_DOMAIN_MARKS, type GiaDomain } from '@/lib/constants/domains';

export const DOMAIN_ICONS: Record<AppDomain, LucideIcon> = {
  ...GIA_DOMAIN_MARKS,
  concierge:  ConciergeBell,
  finance:    IndianRupee,
  marketing:  Megaphone,
  tech:       Cpu,
  business:   Briefcase,
};

/** Gia module subset — same keys as GIA_DOMAINS */
export const GIA_DOMAIN_ICONS: Record<GiaDomain, LucideIcon> = {
  onboarding: DOMAIN_ICONS.onboarding,
  house:      DOMAIN_ICONS.house,
  shop:       DOMAIN_ICONS.shop,
  legacy:     DOMAIN_ICONS.legacy,
};

export function getDomainIcon(domain: AppDomain | string): LucideIcon {
  return DOMAIN_ICONS[domain as AppDomain] ?? UserPlus;
}
