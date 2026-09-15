// constants/tickets.ts — THE Sia ticketing vocabulary (migration 0195, client-ticket-plan.md 7).
//
// Statuses keep every Freshdesk meaning under a name that says who is waiting on whom; the
// transitions table is the state machine the mutation core enforces. Categories are the real
// Freshdesk tree read from the account (2026-09-15). Priorities are real here: suggested by the
// ticket creator, approved by the bishop, and only then the SLA clocks start.

import { defineEnum } from "@/lib/constants/define-enum";

export const TICKETS_PATH = "/tickets";
export const TICKETS_LIST_PAGE_SIZE = 50;

// ─── Status machine ──────────────────────────────────────────────────────────

export const TICKET_STATUSES = defineEnum([
  { id: "proposed",        label: "Proposed" },
  { id: "open",            label: "Open" },
  { id: "sourcing",        label: "Sourcing" },
  { id: "awaiting_client", label: "Awaiting client" },
  { id: "awaiting_vendor", label: "Awaiting vendor" },
  { id: "in_delivery",     label: "In delivery" },
  { id: "payment_due",     label: "Payment due" },
  { id: "resolved",        label: "Resolved" },
  { id: "closed",          label: "Closed" },
  { id: "dropped",         label: "Dropped" },
] as const);
export type TicketStatus = (typeof TICKET_STATUSES.values)[number];

/** Which statuses count as live work (the board columns, the open counts). */
export const TICKET_ACTIVE_STATUSES: readonly TicketStatus[] = ["open", "sourcing", "awaiting_client", "awaiting_vendor", "in_delivery", "payment_due"];
export const TICKET_TERMINAL_STATUSES: readonly TicketStatus[] = ["resolved", "closed", "dropped"];
/** Statuses where the SLA clock is stopped (Freshdesk's own stop_sla_timer flags, kept). */
export const TICKET_SLA_STOPPED_STATUSES: readonly TicketStatus[] = ["awaiting_client", "in_delivery", "payment_due", "resolved", "closed", "dropped", "proposed"];

/** The allowed moves. Anything else is refused by the core. */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  proposed:        ["open", "dropped"],
  open:            ["sourcing", "awaiting_client", "awaiting_vendor", "in_delivery", "resolved", "dropped"],
  sourcing:        ["open", "awaiting_client", "awaiting_vendor", "in_delivery", "payment_due", "resolved", "dropped"],
  awaiting_client: ["sourcing", "awaiting_vendor", "in_delivery", "resolved", "dropped"],
  awaiting_vendor: ["sourcing", "awaiting_client", "in_delivery", "payment_due", "resolved", "dropped"],
  in_delivery:     ["sourcing", "payment_due", "resolved", "dropped"],
  payment_due:     ["in_delivery", "resolved", "dropped"],
  resolved:        ["closed", "open"],
  closed:          ["open"],
  dropped:         ["open"],
};
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from]?.includes(to) ?? false;
}

export type TicketStatusTone = "info" | "warning" | "success" | "neutral" | "danger";
export const TICKET_STATUS_TONE: Record<TicketStatus, TicketStatusTone> = {
  proposed: "neutral", open: "info", sourcing: "warning", awaiting_client: "neutral", awaiting_vendor: "warning",
  in_delivery: "info", payment_due: "danger", resolved: "success", closed: "neutral", dropped: "neutral",
};

/** The member app's four-stage journey (kept so the app can read Serene later). */
export const TICKET_APP_STAGE: Record<TicketStatus, "received" | "sourcing" | "in_progress" | "completed" | null> = {
  proposed: null, open: "received", sourcing: "sourcing", awaiting_client: "in_progress", awaiting_vendor: "sourcing",
  in_delivery: "in_progress", payment_due: "in_progress", resolved: "completed", closed: "completed", dropped: null,
};

// ─── Priority ────────────────────────────────────────────────────────────────

export const TICKET_PRIORITIES = defineEnum([
  { id: "low",    label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high",   label: "High" },
  { id: "urgent", label: "Urgent" },
] as const);
export type TicketPriority = (typeof TICKET_PRIORITIES.values)[number];
export const TICKET_PRIORITY_WEIGHT: Record<TicketPriority, number> = { low: 1, medium: 1, high: 2, urgent: 3 };

// ─── Categories (the Freshdesk tree, read live 2026-09-15) ───────────────────

export const TICKET_CATEGORIES = defineEnum([
  { id: "travel",          label: "Travel" },
  { id: "dining",          label: "Dining" },
  { id: "retail",          label: "Retail" },
  { id: "events",          label: "Events" },
  { id: "special_request", label: "Special request" },
  { id: "itinerary",       label: "Itinerary" },
  { id: "recommendations", label: "Indulge recommendations" },
  { id: "staff_hiring",    label: "Staff hiring" },
] as const);
export type TicketCategory = (typeof TICKET_CATEGORIES.values)[number];

export const TICKET_SUB_CATEGORIES: Record<TicketCategory, readonly { id: string; label: string }[]> = {
  travel: [
    { id: "flight", label: "Flight" }, { id: "hotel_booking", label: "Hotel booking" }, { id: "car_transfer", label: "Car transfer" },
    { id: "experiences", label: "Experiences" }, { id: "airport_assistance", label: "Airport assistance" }, { id: "visa", label: "Visa" },
  ],
  dining: [{ id: "reservation", label: "Reservation" }, { id: "delivery", label: "Delivery" }, { id: "private_chef", label: "Private chef" }],
  retail: [{ id: "bag", label: "Bag" }, { id: "watch", label: "Watch" }, { id: "general", label: "General" }, { id: "gifting", label: "Gifting" }],
  events: [{ id: "tickets", label: "Tickets" }, { id: "private_event", label: "Private event" }],
  special_request: [],
  itinerary: [],
  recommendations: [],
  staff_hiring: [],
};

/** Freshdesk's category labels → ours, for the mirror and the import at cutover. */
export const FRESHDESK_CATEGORY_TO_TICKET: Record<string, TicketCategory> = {
  "Travel": "travel", "Dining": "dining", "Retail": "retail", "Events": "events", "Special Request": "special_request",
  "Itinerary": "itinerary", "Indulge Recommendations": "recommendations", "Staff Hiring": "staff_hiring",
};

// ─── Origins, resolutions, event types ───────────────────────────────────────

export const TICKET_ORIGINS = defineEnum([
  { id: "whatsapp_group",   label: "WhatsApp group" },
  { id: "app",              label: "App" },
  { id: "call",             label: "Call" },
  { id: "email",            label: "Email" },
  { id: "manual",           label: "By hand" },
  { id: "freshdesk_import", label: "Freshdesk import" },
] as const);
export type TicketOrigin = (typeof TICKET_ORIGINS.values)[number];

export const TICKET_RESOLUTIONS = defineEnum([
  { id: "delivered",           label: "Delivered" },
  { id: "cancelled_by_client", label: "Cancelled by the client" },
  { id: "could_not_source",    label: "Could not source" },
  { id: "duplicate",           label: "Duplicate" },
  { id: "not_a_request",       label: "Not a request" },
] as const);
export type TicketResolution = (typeof TICKET_RESOLUTIONS.values)[number];

export const TICKET_EVENT_TYPES = [
  "created", "proposed", "approved", "classified", "assigned", "reassigned", "status_changed", "priority_changed",
  "brief_updated", "checklist_ticked", "note", "client_message_linked", "client_update_drafted", "client_update_sent",
  "vendor_shortlisted", "vendor_chosen", "quote_added", "payment_requested", "payment_received", "subtask_created",
  "handed_off", "sla_warning", "sla_breached", "reminder_sent", "observation", "escalated", "closed", "reopened", "learning_written",
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

export const TICKET_ACTOR_KINDS = ["human", "sentinel", "intake", "elaya", "system", "client"] as const;
export type TicketActorKind = (typeof TICKET_ACTOR_KINDS)[number];

export const TICKET_LINK_KINDS = ["origin", "update", "client_reply", "staff_reply", "attachment"] as const;
export type TicketLinkKind = (typeof TICKET_LINK_KINDS)[number];

export const TICKET_REASSIGN_REASONS = defineEnum([
  { id: "shift_end",  label: "Shift ended" },
  { id: "workload",   label: "Workload" },
  { id: "speciality", label: "Better suited" },
  { id: "leave",      label: "On leave" },
  { id: "other",      label: "Other" },
] as const);

// ─── SLA (seeded from Freshdesk's numbers; edited in settings later) ─────────

/** Minutes. Freshdesk today: respond 15 min, resolve 8 business hours for most, 48 h watches/bags. */
export const TICKET_SLA_DEFAULTS = {
  first_response_min: { low: 15, medium: 15, high: 15, urgent: 15 } as Record<TicketPriority, number>,
  update_cadence_min: { low: 1440, medium: 720, high: 240, urgent: 120 } as Record<TicketPriority, number>,
  vendor_silence_min: 240,
  client_silence_min: 1440,
  resolve_target_min: { default: 480, retail_watch_bag: 2880 },
};

// ─── Brief fields (the typed request per category) ───────────────────────────

/** The fields a brief may carry; the schema validates types, the UI shows the ones that fit the category. */
export const TICKET_BRIEF_FIELDS = [
  "pax", "date", "time", "date_to", "from_location", "to_location", "budget_inr", "budget_note", "product_details",
  "quantity", "delivery_address", "delivery_contact", "preferred_vendor", "event_name", "duration", "luggage",
  "airport", "early_check_in", "assistance_required", "gift_specifications", "notes",
] as const;
export type TicketBriefField = (typeof TICKET_BRIEF_FIELDS)[number];

export const TICKET_BRIEF_FIELDS_BY_CATEGORY: Record<TicketCategory, readonly TicketBriefField[]> = {
  travel:          ["pax", "date", "date_to", "from_location", "to_location", "time", "luggage", "airport", "early_check_in", "assistance_required", "budget_inr", "preferred_vendor", "notes"],
  dining:          ["pax", "date", "time", "to_location", "delivery_address", "preferred_vendor", "budget_inr", "notes"],
  retail:          ["product_details", "quantity", "budget_inr", "delivery_address", "delivery_contact", "gift_specifications", "date", "notes"],
  events:          ["event_name", "date", "pax", "to_location", "budget_inr", "notes"],
  special_request: ["date", "to_location", "budget_inr", "notes"],
  itinerary:       ["pax", "date", "date_to", "from_location", "to_location", "budget_inr", "duration", "notes"],
  recommendations: ["to_location", "date", "budget_note", "notes"],
  staff_hiring:    ["to_location", "date", "budget_inr", "notes"],
};

export const TICKET_BRIEF_FIELD_LABELS: Record<TicketBriefField, string> = {
  pax: "People", date: "Date", time: "Time", date_to: "Until", from_location: "From", to_location: "Where / to", budget_inr: "Budget (INR)",
  budget_note: "Budget note", product_details: "Product", quantity: "Quantity", delivery_address: "Deliver to", delivery_contact: "Delivery contact",
  preferred_vendor: "Preferred vendor", event_name: "Event", duration: "Duration", luggage: "Luggage", airport: "Airport", early_check_in: "Early check-in",
  assistance_required: "Assistance", gift_specifications: "Gift specifications", notes: "Notes",
};

// ─── Checklists (per category; from Freshdesk's internal task-list checkboxes) ─

export const TICKET_CHECKLIST_TEMPLATES: Record<TicketCategory, readonly string[]> = {
  travel:          ["Options shared with the client", "Client confirmed the option", "Booking made", "Confirmation sent to the client", "Cancellation policy told", "Cost and timeline told"],
  dining:          ["Restaurant contacted", "Table or order confirmed", "Client informed", "Dietary needs passed on"],
  retail:          ["Product sourced", "Price and timeline told", "Box, papers and warranty checked", "Delivery arranged", "Client informed"],
  events:          ["Tickets sourced", "Names on tickets confirmed", "Proof of tickets received", "Client informed"],
  special_request: ["Request understood", "Options shared", "Client confirmed", "Delivered"],
  itinerary:       ["Draft itinerary shared", "Client feedback taken", "Final itinerary sent"],
  recommendations: ["Recommendations shared"],
  staff_hiring:    ["Requirement understood", "Candidates shared", "Trial arranged", "Terms and agency fee told"],
};

export type TicketChecklistItem = { label: string; done_at: string | null; done_by: string | null };
export function checklistForCategory(category: TicketCategory): TicketChecklistItem[] {
  return TICKET_CHECKLIST_TEMPLATES[category].map((label) => ({ label, done_at: null, done_by: null }));
}

export function ticketStatusLabel(s: string): string {
  return TICKET_STATUSES.labels[s as TicketStatus] ?? s;
}
