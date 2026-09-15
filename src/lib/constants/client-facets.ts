// constants/client-facets.ts — THE vocabulary of the client twin (migration 0194,
// client-ticket-plan.md section 5). Facets, sources, polarity, event kinds, relation kinds,
// anticipation kinds, membership tiers. The SQL CHECKs on client_facts.facet / .source /
// .polarity and on client_anticipations.kind mirror these lists exactly — a new value is one
// entry here plus a CHECK-extending migration.

import { defineEnum } from "@/lib/constants/define-enum";

export const CLIENT_FACETS = defineEnum([
  { id: "identity",      label: "Identity" },
  { id: "address",       label: "Address" },
  { id: "family",        label: "Family" },
  { id: "dietary",       label: "Dietary" },
  { id: "preference",    label: "Preference" },
  { id: "interest",      label: "Interest" },
  { id: "occasion",      label: "Occasion" },
  { id: "travel",        label: "Travel" },
  { id: "budget_signal", label: "Budget signal" },
  { id: "contact_rule",  label: "Contact rule" },
  { id: "note",          label: "Note" },
] as const);
export type ClientFacet = (typeof CLIENT_FACETS.values)[number];

/** Which facets the Essentials card shows, in order; the rest go to Preferences. */
export const ESSENTIAL_FACETS: readonly ClientFacet[] = ["address", "family", "dietary", "contact_rule"];
export const PREFERENCE_FACETS: readonly ClientFacet[] = ["preference", "interest", "travel", "occasion", "budget_signal"];

export const FACT_SOURCES = defineEnum([
  { id: "agent_note",        label: "Team note" },
  { id: "typeform",          label: "Onboarding form" },
  { id: "atlas",             label: "Atlas profile" },
  { id: "freshdesk_contact", label: "Freshdesk contact" },
  { id: "freshdesk_ticket",  label: "Freshdesk ticket" },
  { id: "whatsapp_group",    label: "WhatsApp group" },
  { id: "ticket",            label: "Ticket" },
  { id: "app_taste",         label: "App tastes" },
  { id: "app_behaviour",     label: "App activity" },
  { id: "import",            label: "Import" },
] as const);
export type FactSource = (typeof FACT_SOURCES.values)[number];

export const FACT_POLARITIES = ["likes", "dislikes", "neutral"] as const;
export type FactPolarity = (typeof FACT_POLARITIES)[number];

/** Human-readable labels for the well-known fact keys (unknown keys render as-is, spaced). */
export const FACT_KEY_LABELS: Record<string, string> = {
  "identity.birthday": "Birthday",
  "identity.anniversary": "Anniversary",
  "identity.dating_anniversary": "Dating anniversary",
  "identity.blood_group": "Blood group",
  "identity.diabetic": "Diabetic",
  "identity.marital_status": "Marital status",
  "identity.primary_city": "Primary city",
  "identity.company": "Company",
  "identity.designation": "Designation",
  "identity.company_and_designation": "Company and designation",
  "identity.instagram": "Instagram",
  "identity.linkedin": "LinkedIn",
  "identity.social_handles": "Social handles",
  "identity.chronotype": "Sunrise or sunset person",
  "identity.email": "Email",
  "dietary.diet": "Diet",
  "dietary.veg_nonveg": "Veg or non-veg",
  "dietary.allergies": "Allergies",
  "dietary.drink": "Drink",
  "dietary.coffee": "Coffee",
  "dietary.dessert": "Dessert",
  "dietary.food": "Favourite food",
  "preference.seat": "Flight seat",
  "preference.stays": "Stays",
  "preference.cuisine": "Cuisine",
  "preference.restaurant": "Restaurant",
  "preference.brand": "Favourite brand",
  "preference.designer": "Designer",
  "preference.car": "Car",
  "preference.car_you_travel_in": "Car you travel in",
  "preference.watch": "Watch",
  "preference.flowers": "Flowers",
  "preference.book": "Book",
  "preference.artist": "Artist",
  "preference.actor": "Actor or actress",
  "interest.sport": "Sport",
  "travel.go_to_country": "Go-to country",
  "travel.travel_frequency": "Travel frequency",
  "travel.needs_assistance_with": "Needs assistance with",
  "family.pet": "Pet",
};

export const CLIENT_EVENT_KINDS = [
  "message_in", "message_out", "ticket_created", "ticket_status", "ticket_resolved", "note_added",
  "app_view", "app_save", "app_wish", "app_taste", "location", "payment", "invoice", "renewal",
  "call", "fact_added", "health_signal",
] as const;
export type ClientEventKind = (typeof CLIENT_EVENT_KINDS)[number];

export const RELATION_ENTITY_KINDS = ["person", "vendor", "place", "venue", "brand", "interest", "client"] as const;
export const RELATION_KINDS = [
  "spouse", "child", "staff", "uses", "prefers", "avoids", "visits", "lives_in", "travels_to", "knows", "collects", "follows",
] as const;

export const ANTICIPATION_KINDS = defineEnum([
  { id: "occasion",  label: "Occasion" },
  { id: "renewal",   label: "Renewal" },
  { id: "pattern",   label: "Pattern" },
  { id: "follow_up", label: "Follow-up" },
  { id: "trip",      label: "Trip" },
  { id: "silence",   label: "Silence" },
] as const);

/** clients.tier — from the membership types the sheets and Zoho use. */
export const CLIENT_TIERS = defineEnum([
  { id: "premium",       label: "Premium" },
  { id: "celebrity",     label: "Celebrity" },
  { id: "genie",         label: "Genie" },
  { id: "standard",      label: "Standard" },
  { id: "monthly_trial", label: "Monthly trial" },
] as const);
export type ClientTier = (typeof CLIENT_TIERS.values)[number];

/** "Monthly Trial" → monthly_trial; unknown labels → null (never invent a tier). */
export function tierFromLabel(label: string | null | undefined): ClientTier | null {
  const key = (label ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return (CLIENT_TIERS.values as readonly string[]).includes(key) ? (key as ClientTier) : null;
}

export const CLIENT_STATUSES = defineEnum([
  { id: "Active",  label: "Active" },
  { id: "Expired", label: "Expired" },
  { id: "Trial",   label: "Trial" },
] as const);

/** The health score's baseline and clamp (plan 5.5). */
export const HEALTH_BASELINE = 70;
export const HEALTH_MIN = 0;
export const HEALTH_MAX = 100;

/** Compute the live score from the ledger: baseline + Σ delta × 0.5^(age / half-life). */
export function computeHealthScore(
  events: { delta: number; observed_at: string; half_life_days: number }[],
  now: Date = new Date(),
): number {
  let sum = 0;
  for (const e of events) {
    const ageDays = Math.max(0, (now.getTime() - new Date(e.observed_at).getTime()) / 86_400_000);
    sum += e.delta * Math.pow(0.5, ageDays / Math.max(1, e.half_life_days));
  }
  return Math.round(Math.min(HEALTH_MAX, Math.max(HEALTH_MIN, HEALTH_BASELINE + sum)));
}
