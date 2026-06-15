import { defineEnum } from "./define-enum";
import type { GiaDomain } from "./domains";

// ─────────────────────────────────────────────
// Deal type — DERIVED from domain, never free-picked.
// The rule (decision-log 2026-06-15): a Gia domain determines its single
// deal_type. onboarding → membership · shop → retail · house/legacy → sale.
// DOMAIN_DEAL_CONFIG below is the ONE source — the form auto-sets the type,
// the Zod refine validates it, the DB CHECK mirrors it, the filter items read
// it. Never re-hardcode the type/category lists anywhere else (R-01).
// ─────────────────────────────────────────────
const DEAL_TYPE_DEF = defineEnum([
  { id: "membership", label: "Membership" },
  { id: "retail",     label: "Retail"     },
  { id: "sale",       label: "Sale"       },
]);

export const DEAL_TYPES = DEAL_TYPE_DEF.values;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABELS = DEAL_TYPE_DEF.labels;
export const DEAL_TYPE_OPTIONS = DEAL_TYPE_DEF.options;
export const DEAL_TYPE_ENUM = DEAL_TYPE_DEF.zodEnum;

// ─────────────────────────────────────────────
// Deal duration — membership only (deals_membership_duration_check enforces it).
// ─────────────────────────────────────────────
const DEAL_DURATION_DEF = defineEnum([
  { id: "3_months", label: "3 Months" },
  { id: "6_months", label: "6 Months" },
  { id: "1_year",   label: "1 Year"   },
]);

export const DEAL_DURATIONS = DEAL_DURATION_DEF.values;
export type DealDuration = (typeof DEAL_DURATIONS)[number];
export const DEAL_DURATION_LABELS = DEAL_DURATION_DEF.labels;
export const DEAL_DURATION_ENUM = DEAL_DURATION_DEF.zodEnum;

// ─────────────────────────────────────────────
// Deal category — REQUIRED for retail deals, NULL for every other type.
// The product-category breakdown of a shop sale (deals_category_required
// CHECK: retail ⇒ category set, non-retail ⇒ category null).
// ─────────────────────────────────────────────
const DEAL_CATEGORY_DEF = defineEnum([
  { id: "watch",        label: "Watch"          },
  { id: "bag",          label: "Bag"            },
  { id: "event",        label: "Event"          },
  { id: "jewellery",    label: "Jewellery"      },
  { id: "small_luxury", label: "Small Luxury"   },
  { id: "accessories",  label: "Accessories"    },
  { id: "other",        label: "Other"          },
]);

export const DEAL_CATEGORIES = DEAL_CATEGORY_DEF.values;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];
export const DEAL_CATEGORY_LABELS = DEAL_CATEGORY_DEF.labels;
export const DEAL_CATEGORY_OPTIONS = DEAL_CATEGORY_DEF.options;
export const DEAL_CATEGORY_ENUM = DEAL_CATEGORY_DEF.zodEnum;

// ─────────────────────────────────────────────
// DOMAIN_DEAL_CONFIG — THE source of truth (mirrors DOMAIN_INTERESTS).
// Maps every Gia domain → its single deal_type and its category list
// (null where the type has no product categories — i.e. anything but retail).
// Drives: NewDealModal/WonDealModal (auto-set type, show category picker only
// when categories ≠ null), the Zod refines, the DealsFilters category items,
// and the DB CHECK constraints. ONE place — never duplicate the mapping.
// ─────────────────────────────────────────────
export type DomainDealConfig = {
  type:       DealType;
  categories: readonly DealCategory[] | null;
};

export const DOMAIN_DEAL_CONFIG = {
  onboarding: { type: "membership", categories: null },
  shop:       { type: "retail",     categories: DEAL_CATEGORIES },
  house:      { type: "sale",       categories: null },
  legacy:     { type: "sale",       categories: null },
} as const satisfies Record<GiaDomain, DomainDealConfig>;

/** The single deal_type a Gia domain produces (the domain-derived-type law). */
export function dealTypeForDomain(domain: GiaDomain): DealType {
  return DOMAIN_DEAL_CONFIG[domain].type;
}

/**
 * The product categories valid for a Gia domain's deals, or null when the
 * domain's type carries no categories. Returns null for unknown domains.
 */
export function dealCategoriesForDomain(
  domain: string,
): readonly DealCategory[] | null {
  return DOMAIN_DEAL_CONFIG[domain as GiaDomain]?.categories ?? null;
}
