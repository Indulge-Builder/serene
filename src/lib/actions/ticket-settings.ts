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
import { DeleteTicketSlaPolicySchema, IntakeLessonIdSchema, UpdateIntakeLessonSchema, UpdateTicketSettingsSchema, UpsertTicketSlaPolicySchema, WriteIntakeLessonSchema } from "@/lib/validations/ticket-schema";
import { approveLessonCore, discardLessonCore, updateLessonBodyCore } from "@/lib/services/intake-lessons";
import { startIntakeLessonWrite } from "@/trigger/intake-lessons";
import type { IntakeLesson } from "@/lib/types/intake";
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

// ─── The lessons (0240): the founder's three moves on a draft, and "write one now" ────────────

export async function approveIntakeLessonAction(input: unknown): Promise<ActionResult<IntakeLesson>> {
  const parsed = parseActionInput(IntakeLessonIdSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(ROLES);
  if (!auth.ok) return auth.result;
  const res = await approveLessonCore(parsed.data.lesson_id, auth.profile.id);
  if (res.error !== null || !res.data) return { data: null, error: res.error ?? "Could not approve that lesson." };
  revalidate();
  return { data: res.data, error: null };
}

export async function updateIntakeLessonAction(input: unknown): Promise<ActionResult<IntakeLesson>> {
  const parsed = parseActionInput(UpdateIntakeLessonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(ROLES);
  if (!auth.ok) return auth.result;
  const res = await updateLessonBodyCore(parsed.data.lesson_id, parsed.data.body);
  if (res.error !== null || !res.data) return { data: null, error: res.error ?? "Could not save that lesson." };
  revalidate();
  return { data: res.data, error: null };
}

export async function discardIntakeLessonAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(IntakeLessonIdSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(ROLES);
  if (!auth.ok) return auth.result;
  const res = await discardLessonCore(parsed.data.lesson_id);
  if (res.error !== null) return { data: null, error: res.error };
  revalidate();
  return { data: { id: parsed.data.lesson_id }, error: null };
}

/** Queue a writing for one kind (Trigger.dev; a minute or two). The draft appears on the page when it lands. */
export async function writeIntakeLessonNowAction(input: unknown): Promise<ActionResult<{ queued: true }>> {
  const parsed = parseActionInput(WriteIntakeLessonSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(ROLES);
  if (!auth.ok) return auth.result;
  try { await startIntakeLessonWrite(parsed.data.kind); } catch (e) { console.error("[ticket-settings] lesson write could not be queued:", e instanceof Error ? e.message : e); return { data: null, error: "Could not start the writing. Try again in a minute." }; }
  return { data: { queued: true }, error: null };
}
