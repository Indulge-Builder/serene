"use server";

// actions/ticket-settings.ts — the /settings/tickets write path (admin/founder): SLA policies,
// the status labels the app shows, the tag vocabulary. Separate from actions/tickets.ts (the
// queendom's day-to-day writes) the way sla-policies.ts is separate from sla.ts.
// ticket_sla_policies / ticket_settings have no user write RLS: this gated action on the
// service role IS the sanctioned write path. The sentinel reads policies per wake, so an edit
// applies on the next look.

import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "./_auth";
import { parseActionInput } from "./_validation";
import { DeleteTicketSlaPolicySchema, UpdateTicketSettingsSchema, UpsertTicketSlaPolicySchema } from "@/lib/validations/ticket-schema";
import { deleteTicketSlaPolicyCore, updateTicketSettingsCore, upsertTicketSlaPolicyCore } from "@/lib/services/ticket-mutations";
import { TICKET_SETTINGS_PATH, TICKETS_PATH } from "@/lib/constants/tickets";
import type { ActionResult } from "@/lib/types";
import type { TicketSlaPolicyRow } from "@/lib/types/ticket";

const ROLES = ["admin", "founder"] as const;

function revalidate() {
  revalidatePath(TICKET_SETTINGS_PATH);
  revalidatePath(TICKETS_PATH);
}

export async function upsertTicketSlaPolicyAction(input: unknown): Promise<ActionResult<TicketSlaPolicyRow>> {
  const parsed = parseActionInput(UpsertTicketSlaPolicySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ROLES]);
  if (!auth.ok) return auth.result;
  const res = await upsertTicketSlaPolicyCore(parsed.data);
  if (res.error) return { data: null, error: res.error };
  revalidate();
  return { data: res.data, error: null };
}

export async function deleteTicketSlaPolicyAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(DeleteTicketSlaPolicySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ROLES]);
  if (!auth.ok) return auth.result;
  const res = await deleteTicketSlaPolicyCore(parsed.data.id);
  if (res.error) return { data: null, error: res.error };
  revalidate();
  return { data: res.data, error: null };
}

export async function updateTicketSettingsAction(input: unknown): Promise<ActionResult<{ keys: string[] }>> {
  const parsed = parseActionInput(UpdateTicketSettingsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ROLES]);
  if (!auth.ok) return auth.result;
  const res = await updateTicketSettingsCore(parsed.data, actorFromProfile(auth.profile));
  if (res.error) return { data: null, error: res.error };
  revalidate();
  return { data: res.data, error: null };
}
