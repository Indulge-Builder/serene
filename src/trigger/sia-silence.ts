/**
 * sia-silence.ts — the Sia watcher alarm (audit P0-2; heartbeat rework 2026-08-27;
 * escalation rework 2026-08-29).
 *
 * Liveness is judged by the watcher's OWN pulse (sia.wag_watcher_status — one
 * row, beat every 60s, migration 0175), never by group traffic: groups sleep at
 * night, and a traffic-based alarm either cries wolf at 3am or reacts slowly by
 * day. With the heartbeat, "process down" and "session lost" are true positives
 * at any hour.
 *
 * Detection is instant AT THE SOURCE (the watcher writes state changes the
 * moment they happen); this task is the dispatcher, ticking EVERY MINUTE, so
 * failure → WhatsApp/in-app is at most ~60 seconds.
 *
 * Five conditions, most severe first (one alert per tick):
 *   banned        — WhatsApp refused the number three times in a row (403, 0249):
 *                   the watcher holds; a HUMAN requests a review on the phone and
 *                   switches to the standby number (Sia console → Session).
 *   down          — no heartbeat for 3+ min (3 missed beats): process not running.
 *   session_lost  — WhatsApp logged the watcher out, or it has sat unpaired
 *                   15+ min: a HUMAN must scan the QR (Sia console → Session).
 *   unreachable   — process alive but stuck connecting 15+ min.
 *   quiet         — connected, but zero events for 6+ hours: worth a glance
 *                   (possible zombie connection). Soft by design.
 *
 * Cadence + escalation (founder decision 2026-08-29):
 *   t0        → the NAMED tech responders (constants/sia-alerts.ts — Arfam,
 *               Ethan, Manu + the tech account), in-app + push + WhatsApp
 *   every 10m → re-reminder until resolved (per-kind Redis latch, 10min TTL)
 *   t+60m     → FOUNDERS join the loop (their own intro, then the 10m cadence)
 *   recovery  → announce once to everyone who was alerted (tier 1 always;
 *               founders only if the incident had escalated)
 */

import { schedules } from "@trigger.dev/sdk/v3";

const BEAT_STALE_MIN = 3;
const STUCK_STATE_MIN = 15;
const QUIET_HOURS = 6;
const REMIND_TTL_SECONDS = 10 * 60;
const ESCALATE_AFTER_MS = 60 * 60_000;

type AlertKind = "banned" | "down" | "session_lost" | "unreachable" | "quiet";

export const siaSilenceWatchTask = schedules.task({
  id: "sia-silence-watch",
  cron: { pattern: "* * * * *" },
  maxDuration: 60,
  run: async () => {
    // Dynamic imports — keep server-only modules out of the Trigger.dev module scan.
    const { getSiaWatcherStatus, getSiaLastEventAt } = await import("@/lib/services/sia-service");
    const { getAssignableUsers } = await import("@/lib/services/profiles-service");
    const { createNotification } = await import("@/lib/services/notifications-service");
    const { sendSiaAlertNotification } = await import("@/lib/services/whatsapp-api");
    const { redis } = await import("@/lib/redis");
    const { REDIS_KEYS, SIA_ALERT_KINDS } = await import("@/lib/constants/redis-keys");

    const now = Date.now();
    const status = await getSiaWatcherStatus();
    const beatAgeMin = status ? (now - new Date(status.beat_at).getTime()) / 60_000 : Infinity;
    const stateForMin = status ? (now - new Date(status.state_since).getTime()) / 60_000 : Infinity;

    // ── Classify (most severe first; exactly one active condition) ──
    let kind: AlertKind | null = null;
    let title = "";
    let body = "";
    if (status?.state === "banned" && beatAgeMin <= BEAT_STALE_MIN) {
      // The watcher itself said it: it is alive, holding, and must not reconnect.
      kind = "banned";
      title = "Sia watcher number is banned";
      body = `WhatsApp refused the number ${status.close_streak} times in a row. Request a review on the watcher phone, then switch to the standby number from Sia → Session → Change watcher number. Serene is not capturing group messages until then.`;
    } else if (beatAgeMin > BEAT_STALE_MIN) {
      kind = "down";
      title = "Sia watcher is down";
      body = status
        ? `No heartbeat for ${Math.floor(beatAgeMin)} minutes — the capture process is not running. Check the Fargate service.`
        : "The watcher has never reported a heartbeat. Check the Fargate service.";
    } else if (
      status!.state === "logged_out" ||
      (status!.state === "pairing" && stateForMin > STUCK_STATE_MIN)
    ) {
      kind = "session_lost";
      title = "Sia session needs pairing";
      body =
        status!.state === "logged_out"
          ? "WhatsApp logged the watcher out. Open Serene → Sia → the gear icon → Session, and scan the QR with the watcher phone."
          : `The watcher has been waiting unpaired for ${Math.floor(stateForMin)} minutes. Scan the QR in Serene → Sia → Session when ready.`;
    } else if (status!.state === "connecting" && stateForMin > STUCK_STATE_MIN) {
      kind = "unreachable";
      title = "Sia watcher can't reach WhatsApp";
      body = `The process is alive but has been stuck connecting for ${Math.floor(stateForMin)} minutes.`;
    } else if (status!.state === "connected") {
      const lastEventAt = await getSiaLastEventAt();
      const eventAgeHr = lastEventAt ? (now - new Date(lastEventAt).getTime()) / 3_600_000 : Infinity;
      if (eventAgeHr > QUIET_HOURS) {
        kind = "quiet";
        title = "Sia capture looks quiet";
        body = `Connected, but no group events for ${Math.floor(eventAgeHr)} hours. Worth a glance — could be a stale connection.`;
      }
    }

    const { SIA_ALERT_TIER1_PROFILE_IDS } = await import("@/lib/constants/sia-alerts");

    // Tier 1 = the NAMED tech responders (Arfam, Ethan, Manu + the tech
    // account) — every channel, 10-min cadence. Founders join after 1 hour.
    const notifyTier = async (audience: "tier1" | "founders" | "both", t: string, b: string) => {
      const ids = new Set<string>();
      if (audience !== "founders") for (const id of SIA_ALERT_TIER1_PROFILE_IDS) ids.add(id);
      if (audience !== "tier1") {
        for (const f of await getAssignableUsers({ roles: ["founder"] })) ids.add(f.id);
      }
      await Promise.all([
        ...[...ids].map((id) =>
          createNotification({ recipient_id: id, type: "system", title: t, body: b, action_url: "/sia" }),
        ),
        // WhatsApp channel — resolves its own recipients for the audience,
        // no-ops until the template is registered, never throws.
        sendSiaAlertNotification(t, b, audience),
      ]);
      return ids.size;
    };

    // ── Alert (10-min latch per kind; founders join after 1 hour) ──
    if (kind) {
      const latchKey = REDIS_KEYS.siaAlert(kind);
      const sinceKey = REDIS_KEYS.siaAlertSince(kind);

      const [latched, sinceRaw] = await Promise.all([
        redis.get(latchKey).catch(() => null),
        redis.get(sinceKey).catch(() => null),
      ]);
      const since = sinceRaw ? Number(sinceRaw) : now;
      if (!sinceRaw) await redis.set(sinceKey, String(now)).catch(() => {});
      const escalated = now - since >= ESCALATE_AFTER_MS;
      const tier: "t1" | "t2" = escalated ? "t2" : "t1";

      // Crossing the 1-hour line mid-latch: founders get their intro NOW, not
      // at the next 10-minute boundary.
      if (latched === "t1" && escalated) {
        await notifyTier("founders", title, `Unresolved for over an hour — ${body}`);
        await redis.setex(latchKey, REMIND_TTL_SECONDS, "t2").catch(() => {});
        return { state: kind, note: "escalated to founders" };
      }
      if (latched) return { state: kind, note: "reminder window open" };

      const alerted = await notifyTier(escalated ? "both" : "tier1", title, body);
      try {
        await redis.setex(latchKey, REMIND_TTL_SECONDS, tier);
      } catch (e) {
        console.warn("[sia-alarm] latch set failed (may re-alert next tick):", e);
      }
      return { state: kind, alerted, tier };
    }

    // ── Healthy: clear latches + since stamps, announce recovery once ──
    const latchKeys = SIA_ALERT_KINDS.map((k) => REDIS_KEYS.siaAlert(k));
    const sinceKeys = SIA_ALERT_KINDS.map((k) => REDIS_KEYS.siaAlertSince(k));
    const [latchValues, sinceValues] = await Promise.all([
      Promise.all(latchKeys.map((k) => redis.get(k).catch(() => null))),
      Promise.all(sinceKeys.map((k) => redis.get(k).catch(() => null))),
    ]);
    const hadIncident = latchValues.some((v) => v !== null) || sinceValues.some((v) => v !== null);
    if (hadIncident) {
      const oldestSince = Math.min(...sinceValues.filter((v) => v !== null).map((v) => Number(v)), now);
      const foundersWereIn =
        now - oldestSince >= ESCALATE_AFTER_MS || latchValues.some((v) => v === "t2");
      await Promise.all([...latchKeys, ...sinceKeys].map((k) => redis.del(k).catch(() => {})));
      const alerted = await notifyTier(foundersWereIn ? "both" : "tier1", "Sia watcher recovered", "Heartbeat and connection are healthy again.");
      return { state: "recovered", alerted };
    }
    return { state: "healthy", watcher: status!.state };
  },
});
