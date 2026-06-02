export const LEAD_SOURCES = [
  "meta",
  "google",
  "website",
  "whatsapp",
  "referral",
  "ypo",
  "events",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Tuple for Zod `z.enum()` — must be non-empty. */
export const LEAD_SOURCE_ENUM = [...LEAD_SOURCES] as [
  LeadSource,
  ...LeadSource[],
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  meta:     "Meta",
  google:   "Google",
  website:  "Website",
  whatsapp: "WhatsApp",
  referral: "Referral",
  ypo:      "YPO",
  events:   "Events",
};

export function getLeadSourceLabel(
  source: string | null | undefined,
): string {
  if (!source) return "—";
  if (source in LEAD_SOURCE_LABELS) {
    return LEAD_SOURCE_LABELS[source as LeadSource];
  }
  return source;
}

export const LEAD_SOURCE_OPTIONS = LEAD_SOURCES.map((id) => ({
  id,
  label: LEAD_SOURCE_LABELS[id],
}));

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
