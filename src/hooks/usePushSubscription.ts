"use client";

/**
 * usePushSubscription — owns the Web Push subscribe/unsubscribe lifecycle for one
 * device (migration 0120). Mirrors the useNotificationSound posture: client-only,
 * SSR-safe, reads its real state in an effect after mount.
 *
 * Hard rules baked in here (the failure modes the brief calls out):
 *
 * 1. GESTURE-GATED. subscribe() must be called from a click handler. Browsers
 *    block Notification.requestPermission() outside a user gesture; this hook
 *    never auto-prompts on mount.
 *
 * 2. iOS SILENT-FAILURE TRAP. On iOS, Web Push works ONLY inside the installed
 *    PWA (Add to Home Screen → standalone). In Safari tabs it fails with no error.
 *    `support` reports `'ios-needs-install'` for iOS-not-standalone so the UI shows
 *    the install nudge instead of a Subscribe button — we never let a non-standalone
 *    iOS user reach pushManager.subscribe() and think they succeeded.
 *
 * 3. NON-NEXT_PUBLIC private key stays on the server. Only the PUBLIC VAPID key is
 *    here, via NEXT_PUBLIC_VAPID_PUBLIC_KEY. Absent key → support 'unsupported'.
 */

import { useCallback, useEffect, useState } from "react";
import {
  savePushSubscriptionAction,
  removePushSubscriptionAction,
} from "@/lib/actions/push";

/**
 * - `loading`         — still detecting capability/state on mount.
 * - `unsupported`     — no SW/PushManager/Notification, or no VAPID public key.
 * - `ios-needs-install` — iOS Safari NOT in standalone PWA mode. Show the install
 *                          nudge; subscribing here would silently fail.
 * - `subscribable`    — push is available; subscribe()/unsubscribe() are live.
 */
export type PushSupport = "loading" | "unsupported" | "ios-needs-install" | "subscribable";

interface UsePushSubscriptionReturn {
  support:      PushSupport;
  isSubscribed: boolean;
  /** Browser Notification permission: 'default' | 'granted' | 'denied' | null (pre-detect). */
  permission:   NotificationPermission | null;
  isBusy:       boolean;
  error:        string | null;
  subscribe:    () => Promise<void>;
  unsubscribe:  () => Promise<void>;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Running as an installed PWA (covers iOS `navigator.standalone` + the standard
 *  display-mode media query). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosStandalone || displayStandalone;
}

/** iOS (iPhone/iPad/iPod, incl. iPadOS reporting as Mac with touch). */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iDevice || iPadOs;
}

/** VAPID public key (base64url) → ArrayBuffer-backed Uint8Array for
 *  applicationServerKey. Backed by an explicit ArrayBuffer so the type is
 *  Uint8Array<ArrayBuffer> (a valid BufferSource), not <ArrayBufferLike>. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const [support, setSupport]           = useState<PushSupport>("loading");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission]     = useState<NotificationPermission | null>(null);
  const [isBusy, setIsBusy]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // ── Detect capability + current subscription state on mount ───────────────
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const hasApi =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!hasApi || !VAPID_PUBLIC_KEY) {
        if (!cancelled) setSupport("unsupported");
        return;
      }

      // iOS only delivers push inside the installed PWA. Outside standalone we
      // must NOT offer subscribe — it would fail silently and fake success.
      if (isIos() && !isStandalone()) {
        if (!cancelled) {
          setSupport("ios-needs-install");
          setPermission(Notification.permission);
        }
        return;
      }

      if (!cancelled) {
        setPermission(Notification.permission);
        setSupport("subscribable");
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(existing !== null);
      } catch {
        // Reading state failed — treat as not subscribed; subscribe() can retry.
        if (!cancelled) setIsSubscribed(false);
      }
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Subscribe (must be called from a user gesture) ────────────────────────
  const subscribe = useCallback(async () => {
    setError(null);
    if (support !== "subscribable" || !VAPID_PUBLIC_KEY) return;

    setIsBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Notifications are blocked. Enable them in your browser settings."
            : "Permission was not granted.",
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      const keys = json.keys ?? {};
      if (!json.endpoint || !keys.p256dh || !keys.auth) {
        // Defensive: an incomplete subscription is useless server-side. Roll it
        // back so we never report a false "subscribed".
        await sub.unsubscribe().catch(() => {});
        setError("Could not complete the subscription. Please try again.");
        return;
      }

      const result = await savePushSubscriptionAction({
        endpoint: json.endpoint,
        p256dh:   keys.p256dh,
        auth:     keys.auth,
        userAgent: navigator.userAgent,
      });

      if (result.error) {
        await sub.unsubscribe().catch(() => {});
        setError(result.error);
        return;
      }

      setIsSubscribed(true);
    } catch (err) {
      console.warn("[usePushSubscription] subscribe failed:", err);
      setError("Could not enable push on this device.");
    } finally {
      setIsBusy(false);
    }
  }, [support]);

  // ── Unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe().catch(() => {});
        // Best-effort server cleanup — dispatchPush also prunes dead endpoints on
        // 404/410, so a failure here is recovered automatically on next send.
        await removePushSubscriptionAction(endpoint).catch(() => {});
      }
      setIsSubscribed(false);
    } catch (err) {
      console.warn("[usePushSubscription] unsubscribe failed:", err);
      setError("Could not turn off push on this device.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { support, isSubscribed, permission, isBusy, error, subscribe, unsubscribe };
}
