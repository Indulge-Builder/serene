import { defineEnum } from "./define-enum";

// Single source of truth — values/labels/options/zod-enum all derive from here.
const LEAD_SOURCE_DEF = defineEnum([
  { id: "meta",     label: "Meta"     },
  { id: "google",   label: "Google"   },
  { id: "website",  label: "Website"  },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "referral", label: "Referral" },
  { id: "ypo",      label: "YPO"      },
  { id: "events",   label: "Events"   },
  // The Indulge Shop app (React Native + NestJS). Its own webhook channel with its
  // own secret — deliberately NOT folded into "website", so marketplace product
  // enquiries stay separable from website form fills in every report.
  // Adding a value here REQUIRES extending the deals.source CHECK in the same
  // change (migration 0180 did so for this one).
  { id: "shop_app", label: "Shop App" },
  // Self-sourced: a lead the team member brought in themselves (own network,
  // outreach) — not attributable to any channel above. Migration 0182 extended
  // the deals.source CHECK for it.
  { id: "self",     label: "Self"     },
]);

export const LEAD_SOURCES = LEAD_SOURCE_DEF.values;

export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Tuple for Zod `z.enum()` — must be non-empty. */
export const LEAD_SOURCE_ENUM = LEAD_SOURCE_DEF.zodEnum;

export const LEAD_SOURCE_LABELS = LEAD_SOURCE_DEF.labels;

/** Webhook leads store channel on `platform`; manual/dossier edits use `utm_source`. */
export function resolveLeadSource(
  utmSource: string | null | undefined,
  platform: string | null | undefined,
): string | null {
  return utmSource ?? platform ?? null;
}

export function getLeadSourceLabel(
  source: string | null | undefined,
): string {
  if (!source) return "—";
  if (source in LEAD_SOURCE_LABELS) {
    return LEAD_SOURCE_LABELS[source as LeadSource];
  }
  return source;
}

export const LEAD_SOURCE_OPTIONS = LEAD_SOURCE_DEF.options;

export const PLATFORM_LABELS: Record<string, string> = {
  meta:      "Meta",
  google:    "Google",
  website:   "Website",
  whatsapp:  "WhatsApp",
  shop_app:  "Shop App",
};

export const META_MEDIUM_LABELS: Record<string, string> = {
  fb:  "Facebook",
  ig:  "Instagram",
  msg: "Messenger",
  an:  "Audience Network",
};

export function getMetaMediumLabel(medium: string | null): string | null {
  if (!medium) return null;
  return META_MEDIUM_LABELS[medium.toLowerCase()] ?? medium;
}

// ─────────────────────────────────────────────
// Shop app enquiry types (migration 0180)
// SQL mirror of the enquiry_type CHECK on lead_product_enquiries, and of the
// shop backend's own ENQUIRY_TYPES enum. Adding a value means extending BOTH
// this list and that CHECK in one change.
// ─────────────────────────────────────────────
export const SHOP_ENQUIRY_TYPES = ['enquire', 'price_request', 'source_request'] as const;

export type ShopEnquiryType = (typeof SHOP_ENQUIRY_TYPES)[number];

export const SHOP_ENQUIRY_TYPE_LABELS: Record<ShopEnquiryType, string> = {
  enquire:        'Enquiry',
  price_request:  'Price request',
  source_request: 'Sourcing request',
};

export function getShopEnquiryTypeLabel(type: string): string {
  return SHOP_ENQUIRY_TYPE_LABELS[type as ShopEnquiryType] ?? type;
}
