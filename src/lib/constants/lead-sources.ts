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
