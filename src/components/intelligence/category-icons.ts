// Category → Lucide icon map for Call Intelligence surfaces (the list row's
// leading tile + the detail modal). Unknown/future category slugs fall back
// to Sparkles — never throw on vocabulary growth (mirrors
// getServiceCategoryLabel's title-case fallback).

import {
  Gift,
  PartyPopper,
  Plane,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  travel: Plane,
  dining: UtensilsCrossed,
  gifts:  Gift,
  events: PartyPopper,
  retail: ShoppingBag,
  special: Sparkles,
};

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? Sparkles;
}
