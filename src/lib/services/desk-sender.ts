// desk-sender.ts — runDeskSender(): THE one place a line reaches a speaker (0248, plan section 6).
// Claims queued desk_outbox rows whose time has come, resolves each row's audience to the active
// Alexa devices on the allow-list (desk_devices), calls the Voice Monkey announcement API once per
// device with the row's `spoken`, and settles the row. Fails closed: a device that is not on the
// table is never spoken to, a row with nothing to say for a speaker is settled sent (the TVs read
// it over Realtime), a 429 from Voice Monkey stops the run and leaves the rest queued.
// Env: VOICEMONKEY_TOKEN. Runs from src/trigger/desk-sender.ts (every minute) and after() in the
// announcement action for immediacy. No `server-only` chain.

import { claimableDeskOutbox, expireDeskOutbox, resolveSpeakers } from "@/lib/services/desks-service";
import { settleDeskMessageCore } from "@/lib/services/desk-mutations";
import { getDesksSettings } from "@/lib/services/llm-providers-service";
import { DESK_SENDER_BATCH, DESK_TTS_LANGUAGE, DESK_TTS_VOICE } from "@/lib/constants/desks";
import type { DeskOutboxRow } from "@/lib/types/desks";

const LOG = "[desk-sender]";
const VOICEMONKEY_ANNOUNCE_URL = "https://api-v3.voicemonkey.io/announce";

export type DeskSenderResult = { claimed: number; sent: number; failed: number; refused: number; expired: number; throttled: boolean };

export function isDeskSenderConfigured(): boolean {
  return Boolean(process.env.VOICEMONKEY_TOKEN);
}

/** One announcement on one Echo. Returns ok, or the error code Voice Monkey gave (THROTTLED stops the run). */
async function announce(device: string, speech: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const token = process.env.VOICEMONKEY_TOKEN;
  if (!token) return { ok: false, code: "NOT_CONFIGURED" };
  try {
    const res = await fetch(VOICEMONKEY_ANNOUNCE_URL, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, device, speech, voice: DESK_TTS_VOICE, language: DESK_TTS_LANGUAGE }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    let code = `HTTP_${res.status}`;
    try { const j = (await res.json()) as { error?: string }; if (j.error) code = j.error; } catch { /* keep the status */ }
    return { ok: false, code };
  } catch (e) {
    return { ok: false, code: e instanceof Error ? e.message.slice(0, 80) : "fetch failed" };
  }
}

async function sendOne(row: DeskOutboxRow): Promise<{ status: "sent" | "failed" | "refused"; sentTo: string[]; error: string | null; throttled: boolean }> {
  const speakers = await resolveSpeakers(row.audience);
  if (!row.spoken) return { status: "sent", sentTo: [], error: null, throttled: false }; // TV-only row
  if (speakers.length === 0) return { status: "refused", sentTo: [], error: "no active speaker on the allow-list for this audience", throttled: false };
  const sentTo: string[] = [];
  const errors: string[] = [];
  for (const d of speakers) {
    const r = await announce(d.voicemonkey_device as string, row.spoken);
    if (r.ok) sentTo.push(d.id);
    else {
      errors.push(`${d.label}: ${r.code}`);
      if (r.code === "THROTTLED" || r.code === "MONTHLY_QUOTA_EXCEEDED") return { status: "failed", sentTo, error: errors.join("; "), throttled: true };
    }
  }
  return { status: sentTo.length > 0 ? "sent" : "failed", sentTo, error: errors.length ? errors.join("; ") : null, throttled: false };
}

export async function runDeskSender(opts: { deadlineMs: number }): Promise<DeskSenderResult> {
  const result: DeskSenderResult = { claimed: 0, sent: 0, failed: 0, refused: 0, expired: 0, throttled: false };
  const deadline = Date.now() + opts.deadlineMs;
  const settings = await getDesksSettings();
  if (!settings.enabled) return result;
  result.expired = await expireDeskOutbox();
  const rows = await claimableDeskOutbox(DESK_SENDER_BATCH);
  result.claimed = rows.length;
  for (const row of rows) {
    if (Date.now() > deadline) break;
    const r = await sendOne(row);
    // A throttled run leaves the row queued for the next minute; nothing is settled twice.
    if (r.throttled) { result.throttled = true; console.warn(`${LOG} throttled by Voice Monkey; leaving ${row.id} queued`); break; }
    await settleDeskMessageCore(row.id, r.status, r.sentTo, r.error);
    result[r.status]++;
  }
  return result;
}
