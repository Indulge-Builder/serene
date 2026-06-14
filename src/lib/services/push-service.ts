/**
 * push-service.ts — Web Push (VAPID) delivery, the SECOND notification channel.
 *
 * SERVER ONLY, NODE RUNTIME ONLY. `web-push` is a Node library (it uses node
 * crypto + https) — it throws under the Edge runtime. Every caller of
 * createNotification (which calls dispatchPush) runs on Node: the server actions
 * in lib/actions/* and the Trigger.dev jobs in src/trigger/*. There is NO edge
 * route in this app — never call dispatchPush from one.
 *
 * dispatchPush(recipientId, payload) is invoked INSIDE createNotification, after
 * the in-app row insert. That is the single fan-out seam: every existing
 * createNotification call site (lead-assignment-notify, lead-mutations, sla,
 * tasks, task-reminders) gets push for free, with zero call-site edits.
 *
 * NON-FATAL CONTRACT: push is a best-effort second channel. The in-app row is the
 * source of truth and must succeed even if every push send fails. dispatchPush
 * NEVER throws — it logs and returns. createNotification mirrors the existing
 * fire-and-forget posture (the row insert already happened before we get here).
 *
 * DEAD-ENDPOINT PRUNE (mandatory, not nice-to-have): push endpoints expire
 * constantly (reinstall, token rotation, permission revoke). The push service
 * answers 404 (Not Found) / 410 (Gone) for a dead endpoint. We DELETE that
 * subscription row on those codes — otherwise the table fills with corpses and
 * every fan-out re-sends to (and waits on) endpoints that will never deliver.
 */

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Shared payload shape ───────────────────────────────────────────────────

/**
 * The JSON the service worker's `push` handler parses. Kept deliberately small —
 * it mirrors the in-app Notification row. `url` is the relative action path the
 * `notificationclick` handler navigates to (same relative-only contract as
 * NotificationItem's action_url validation).
 */
export interface PushPayload {
  title: string;
  body?: string;
  /** Relative action path (e.g. "/leads/abc"). Validated again client-side. */
  url?: string;
}

// ─── VAPID configuration — once, lazily, gracefully ─────────────────────────

let vapidConfigured: boolean | null = null;

/**
 * Configure web-push with the VAPID keys exactly once. Returns false (and logs a
 * single warning) when the keys are absent — so a deploy without VAPID set up
 * degrades to "no push", never to a thrown error inside the notification path.
 */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;

  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn(
      "[push-service] VAPID keys not configured — push delivery disabled. " +
        "Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT to enable.",
    );
    vapidConfigured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } catch (err) {
    console.error("[push-service] setVapidDetails failed (push disabled):", err);
    vapidConfigured = false;
  }
  return vapidConfigured;
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

/**
 * Send `payload` as a Web Push to every registered device of `recipientId`.
 *
 * - Reads the recipient's subscriptions via the ADMIN client (cross-user read +
 *   prune — RLS would scope a session client to the caller, who is rarely the
 *   recipient; same service-role posture as createNotification's insert).
 * - Sends to all endpoints in parallel.
 * - Prunes endpoints that answer 404/410 (dead) in one batched delete.
 *
 * Never throws. Best-effort. The in-app notification row already exists.
 */
export async function dispatchPush(
  recipientId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const admin = createAdminClient();

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", recipientId);

  if (error) {
    console.warn("[push-service] subscription lookup failed (non-fatal):", error);
    return;
  }
  if (!subscriptions || subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  const deadIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err) {
        // 404 Not Found / 410 Gone → the endpoint is permanently dead. Mark it
        // for deletion. Any other status (e.g. 429 throttle, 5xx) is transient —
        // leave the row so a later notification can retry.
        const statusCode =
          err instanceof webpush.WebPushError ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          deadIds.push(sub.id);
        } else {
          console.warn(
            `[push-service] send failed (status ${statusCode ?? "?"}) — kept:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    const { error: pruneError } = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", deadIds);
    if (pruneError) {
      console.warn("[push-service] dead-endpoint prune failed (non-fatal):", pruneError);
    }
  }
}
