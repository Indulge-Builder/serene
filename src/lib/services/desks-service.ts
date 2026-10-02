// desks-service.ts — ALL reads of desk_devices and desk_outbox (0248; docs/architecture/desks-plan.md).
// Admin client throughout: the CALLER gates (the /settings/desks page is admin/founder; the sender
// and the sweep are sessionless). No `server-only` chain: the sender runs from Trigger.dev.

import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import type { DeskAudience } from "@/lib/constants/desks";
import type { DeskDeviceRow, DeskOutboxRow } from "@/lib/types/desks";

const LOG = "[desks-service]";

// The tables are not in the generated types until the next regen; one loose handle (the media-readings posture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any };
const db = (): Loose => createAdminClient() as unknown as Loose;

export async function listDeskDevices(opts: { activeOnly?: boolean } = {}): Promise<DeskDeviceRow[]> {
  let q = db().from("desk_devices").select("*").order("label");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) { console.error(`${LOG} list devices failed:`, error.message); return []; }
  return mapRows<DeskDeviceRow, DeskDeviceRow>(data, (r) => r);
}

export async function getDeskDeviceByAlexaId(alexaDeviceId: string): Promise<DeskDeviceRow | null> {
  const { data, error } = await db().from("desk_devices").select("*").eq("alexa_device_id", alexaDeviceId).eq("is_active", true).maybeSingle();
  if (error) { console.error(`${LOG} device by alexa id failed:`, error.message); return null; }
  return (data as DeskDeviceRow | null) ?? null;
}

export async function getDeskDeviceForProfile(profileId: string): Promise<DeskDeviceRow | null> {
  const { data, error } = await db().from("desk_devices").select("*").eq("profile_id", profileId).eq("is_active", true).maybeSingle();
  if (error) { console.error(`${LOG} device for profile failed:`, error.message); return null; }
  return (data as DeskDeviceRow | null) ?? null;
}

/** The active Alexa devices a row's audience resolves to: the allow-list the sender speaks to. */
export async function resolveSpeakers(audience: DeskAudience): Promise<DeskDeviceRow[]> {
  let q = db().from("desk_devices").select("*").eq("kind", "alexa").eq("is_active", true).not("voicemonkey_device", "is", null);
  if ("device_id" in audience) q = q.eq("id", audience.device_id);
  else if ("queendom_id" in audience) q = q.eq("queendom_id", audience.queendom_id);
  const { data, error } = await q;
  if (error) { console.error(`${LOG} resolve speakers failed:`, error.message); return []; }
  return mapRows<DeskDeviceRow, DeskDeviceRow>(data, (r) => r);
}

export async function listDeskOutbox(opts: { limit?: number } = {}): Promise<DeskOutboxRow[]> {
  const { data, error } = await db().from("desk_outbox").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 60);
  if (error) { console.error(`${LOG} list outbox failed:`, error.message); return []; }
  return mapRows<DeskOutboxRow, DeskOutboxRow>(data, (r) => r);
}

/** The queued rows whose time has come and whose moment has not passed, oldest first. */
export async function claimableDeskOutbox(limit: number): Promise<DeskOutboxRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await db().from("desk_outbox").select("*").eq("status", "queued").lte("not_before", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`).order("severity", { ascending: false }).order("not_before").limit(limit);
  if (error) { console.error(`${LOG} claimable failed:`, error.message); return []; }
  return mapRows<DeskOutboxRow, DeskOutboxRow>(data, (r) => r);
}

/** Queued rows whose moment has passed: marked refused so the ledger says why nothing was said. */
export async function expireDeskOutbox(): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await db().from("desk_outbox").update({ status: "refused", error: "expired before it could be spoken" })
    .eq("status", "queued").lt("expires_at", now).select("id");
  if (error) { console.error(`${LOG} expire failed:`, error.message); return 0; }
  return (data ?? []).length;
}
