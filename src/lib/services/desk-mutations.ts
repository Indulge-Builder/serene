// desk-mutations.ts — THE context-free desks write cores (0248; docs/architecture/desks-plan.md).
// queueDeskMessageCore is the ONLY writer of desk_outbox: the Desks page, the alert sweep and
// Elaya's tools all call it; nothing in src/ speaks to a speaker except through a row it queued.
// It applies the switch, quiet hours, the expiry, and speakableFor (the only writer of `spoken`).
// Admin client; a MutationActor (never a session); the CALLER gates.

import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeText } from "@/lib/utils/sanitize";
import { toIst } from "@/lib/utils/ist";
import type { MutationActor } from "@/lib/services/lead-mutations";
import { getDesksSettings } from "@/lib/services/llm-providers-service";
import { speakableFor, type SpeakableInput } from "@/lib/services/desk-speech";
import { DESK_ALERT_EXPIRES_MS, DESK_ANNOUNCEMENT_EXPIRES_MS, DESK_SETTING_KEYS, type DeskAudience, type DeskSource } from "@/lib/constants/desks";
import type { DeskDeviceRow, DeskOutboxRow } from "@/lib/types/desks";

const LOG = "[desk-mutations]";
// The tables are not in the generated types until the next regen; one loose handle (the media-readings posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const db = (): Loose => createAdminClient() as unknown as Loose;
export type DeskResult<T> = { data: T; error: null } | { data: null; error: string };

/** Inside the quiet window (IST hours, wrapping past midnight when from > to). */
export function inQuietHours(now: Date, quiet: { from: number; to: number }): boolean {
  const h = toIst(now).hour;
  return quiet.from > quiet.to ? h >= quiet.from || h < quiet.to : h >= quiet.from && h < quiet.to;
}

/** The instant the quiet window ends, so an alert queued in it waits rather than dies. */
function quietEndsAt(now: Date, quiet: { from: number; to: number }): Date {
  const ist = toIst(now);
  const d = new Date(Date.UTC(ist.year, ist.month, ist.day, quiet.to, 0, 0) - 5.5 * 60 * 60 * 1000);
  return d.getTime() > now.getTime() ? d : new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

export async function queueDeskMessageCore(
  input: SpeakableInput & { audience: DeskAudience; source: DeskSource; speak?: boolean; alertId?: string | null; conversationId?: string | null; notBefore?: Date | null },
  actor: MutationActor | null,
): Promise<DeskResult<DeskOutboxRow>> {
  const settings = await getDesksSettings();
  if (!settings.enabled) return { data: null, error: "disabled" };
  const now = new Date();
  const s = speakableFor(input);
  const spoken = input.speak === false ? "" : s.spoken;
  const isHuman = input.kind === "announcement";
  // Quiet hours: a human's announcement still goes; anything the machine says waits for morning.
  let notBefore = input.notBefore ?? now;
  if (!isHuman && inQuietHours(notBefore, settings.quietHours)) notBefore = quietEndsAt(notBefore, settings.quietHours);
  const expires = new Date(notBefore.getTime() + (isHuman ? DESK_ANNOUNCEMENT_EXPIRES_MS : DESK_ALERT_EXPIRES_MS));
  const { data, error } = await db().from("desk_outbox").insert({
    kind: input.kind, severity: input.kind === "alert" ? input.severity : 2, audience: input.audience,
    title: s.title, body: s.body, spoken, source: input.source, created_by: actor?.userId ?? null,
    alert_id: input.alertId ?? null, conversation_id: input.conversationId ?? null,
    not_before: notBefore.toISOString(), expires_at: expires.toISOString(),
  }).select("*").single();
  if (error) { console.error(`${LOG} queue failed:`, error.message); return { data: null, error: error.message }; }
  return { data: data as DeskOutboxRow, error: null };
}

/** The sender's settle: the one UPDATE the ledger allows. */
export async function settleDeskMessageCore(id: string, status: "sent" | "failed" | "refused", sentTo: string[], error: string | null): Promise<void> {
  const { error: e } = await db().from("desk_outbox").update({ status, sent_to: sentTo, error, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", id).eq("status", "queued");
  if (e) console.error(`${LOG} settle failed:`, e.message);
}

export async function upsertDeskDeviceCore(
  actor: MutationActor,
  input: { id?: string; kind: "alexa" | "tv"; label: string; queendomId: string | null; profileId: string | null; alexaDeviceId: string | null; voicemonkeyDevice: string | null; isActive: boolean },
): Promise<DeskResult<DeskDeviceRow>> {
  const row = {
    ...(input.id ? { id: input.id } : {}), kind: input.kind, label: sanitizeText(input.label), queendom_id: input.queendomId, profile_id: input.profileId,
    alexa_device_id: input.alexaDeviceId, voicemonkey_device: input.voicemonkeyDevice, is_active: input.isActive, created_by: actor.userId, updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from("desk_devices").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) { console.error(`${LOG} upsert device failed:`, error.message); return { data: null, error: error.message }; }
  return { data: data as DeskDeviceRow, error: null };
}

export async function saveDeskSettingsCore(input: { enabled: boolean; quietFrom: number; quietTo: number }): Promise<DeskResult<{ keys: string[] }>> {
  const rows = [
    { key: DESK_SETTING_KEYS.enabled, value: input.enabled },
    { key: DESK_SETTING_KEYS.quietHours, value: { from: input.quietFrom, to: input.quietTo } },
  ];
  const { error } = await createAdminClient().from("elaya_settings").upsert(rows, { onConflict: "key" });
  if (error) { console.error(`${LOG} save settings failed:`, error.message); return { data: null, error: error.message }; }
  return { data: { keys: rows.map((r) => r.key) }, error: null };
}
