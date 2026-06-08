// Domain Lucide icons — one mark per app_domain for cards, pickers, and headers.
// Pair with DOMAIN_LINE_COLORS for tint; icons only, never hardcoded hex in consumers.

import {
  UserPlus,
  Home,
  ShoppingBag,
  Crown,
  ConciergeBell,
  IndianRupee,
  Megaphone,
  Cpu,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import type { AppDomain } from '@/lib/types/database';
import type { GiaDomain } from '@/lib/constants/domains';

export const DOMAIN_ICONS: Record<AppDomain, LucideIcon> = {
  concierge:  ConciergeBell,
  onboarding: UserPlus,
  finance:    IndianRupee,
  marketing:  Megaphone,
  tech:       Cpu,
  shop:       ShoppingBag,
  b2b:        Briefcase,
  house:      Home,
  legacy:     Crown,
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
