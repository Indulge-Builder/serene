"use server";

// actions/desks.ts — ALL desks server actions (0248; docs/architecture/desks-plan.md Layers C and E).
// Every one: Zod (parseActionInput) → requireProfile(['admin','founder']) → a desk-mutations core →
// { data, error }. Nothing here speaks to a speaker: an announcement is an outbox row; after() runs
// the sender once so the room hears it in seconds, and the minute task is the retry.

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { formErrors } from "@/lib/validations/form-errors";
import { SendDeskAnnouncementSchema, UpdateDeskSettingsSchema, UpsertDeskDeviceSchema } from "@/lib/validations/desks-schema";
import { queueDeskMessageCore, saveDeskSettingsCore, upsertDeskDeviceCore } from "@/lib/services/desk-mutations";
import { isDeskSenderConfigured, runDeskSender } from "@/lib/services/desk-sender";
import { DESK_SENDER_RUN_BUDGET_MS, DESKS_SETTINGS_PATH } from "@/lib/constants/desks";
import type { ActionResult } from "@/lib/types";
import type { DeskDeviceRow, DeskOutboxRow } from "@/lib/types/desks";

const LOG = "[desks-action]";

/** The founder types a line; every speaker in the audience says it and every TV shows it. */
export async function sendDeskAnnouncementAction(input: unknown): Promise<ActionResult<DeskOutboxRow>> {
  const parsed = parseActionInput(SendDeskAnnouncementSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await queueDeskMessageCore(
    { kind: "announcement", from: auth.profile.full_name, text: parsed.data.text, audience: parsed.data.audience, source: "human", speak: parsed.data.speak },
    actorFromProfile(auth.profile),
  );
  if (core.error) return { data: null, error: core.error === "disabled" ? formErrors.desksDisabled : formErrors.generic };
  // Speak now, not at the next minute: the run is awaited inside after() (A-16).
  if (parsed.data.speak && isDeskSenderConfigured()) {
    after(runDeskSender({ deadlineMs: DESK_SENDER_RUN_BUDGET_MS }).catch((e) => console.error(`${LOG} sender after announce failed (non-fatal):`, e)));
  }
  revalidatePath(DESKS_SETTINGS_PATH);
  return { data: core.data, error: null };
}

/** "Say hello": one test line on one device, so a new speaker proves itself before it carries an alert. */
export async function testDeskDeviceAction(input: unknown): Promise<ActionResult<DeskOutboxRow>> {
  const parsed = parseActionInput(UpsertDeskDeviceSchema.pick({ id: true }).required(), input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await queueDeskMessageCore(
    { kind: "announcement", from: auth.profile.full_name, text: "Hello. This speaker is set up in Serene.", audience: { device_id: parsed.data.id }, source: "human" },
    actorFromProfile(auth.profile),
  );
  if (core.error) return { data: null, error: core.error === "disabled" ? formErrors.desksDisabled : formErrors.generic };
  if (isDeskSenderConfigured()) after(runDeskSender({ deadlineMs: DESK_SENDER_RUN_BUDGET_MS }).catch((e) => console.error(`${LOG} sender after test failed (non-fatal):`, e)));
  revalidatePath(DESKS_SETTINGS_PATH);
  return { data: core.data, error: null };
}

export async function upsertDeskDeviceAction(input: unknown): Promise<ActionResult<DeskDeviceRow>> {
  const parsed = parseActionInput(UpsertDeskDeviceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await upsertDeskDeviceCore(actorFromProfile(auth.profile), parsed.data);
  if (core.error) return { data: null, error: formErrors.generic };
  revalidatePath(DESKS_SETTINGS_PATH);
  return { data: core.data, error: null };
}

export async function updateDeskSettingsAction(input: unknown): Promise<ActionResult<{ keys: string[] }>> {
  const parsed = parseActionInput(UpdateDeskSettingsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const core = await saveDeskSettingsCore(parsed.data);
  if (core.error) return { data: null, error: formErrors.generic };
  revalidatePath(DESKS_SETTINGS_PATH);
  return { data: core.data, error: null };
}
