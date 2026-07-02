"use client";

/**
 * useNotifications — manages the persistent notification inbox.
 * This is ONE OF TWO allowed places to own notification state.
 * (The other is toast.ts for ephemeral toasts.)
 *
 * Initial data is seeded from a server-fetched prop.
 * Realtime subscription filtered strictly by recipient_id to prevent
 * receiving other users' notifications (pre-mortem item 1).
 *
 * Display contract: the bell shows UNREAD only. Opening a notification marks
 * it read (optimistic) which drops it from the displayed list — it "goes away"
 * once actioned, with no lingering read-history row. The full array is kept
 * internally so a failed mark-read rolls the item back into view.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  markNotificationReadAction,
  markAllReadAction,
} from "@/lib/actions/notifications";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import type { Notification } from "@/lib/types/database";

interface UseNotificationsOptions {
  userId:       string;
  initialData:  Notification[];
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount:   number;
  markRead:      (id: string) => Promise<void>;
  markAllRead:   () => Promise<void>;
  isLoading:     boolean;
}

export function useNotifications({
  userId,
  initialData,
}: UseNotificationsOptions): UseNotificationsReturn {
  // `allNotifications` holds the full set (read + unread) so a failed mark-read
  // can roll an item back. The bell only ever renders the unread slice below.
  const [allNotifications, setNotifications] = useState<Notification[]>(initialData);
  const [isLoading, setIsLoading]            = useState(false);

  // Strict Mode runs setup→teardown→setup; the mount nonce makes the second
  // setup create a fresh channel instead of re-`.on()`ing a subscribed one (P-06).
  const mountId = useId();

  const sound = useNotificationSound();

  // Latest-ref for the chime: `play` is recreated when the sound pref hydrates/
  // changes, but the channel subscription must NOT re-run on that — the ref keeps
  // the handler on the current `play` without adding it to the effect deps.
  const playRef = useRef(sound.play);
  playRef.current = sound.play;

  // Displayed list = unread only. Marking read drops the item from view.
  const notifications = allNotifications.filter((n) => n.read_at === null);
  const unreadCount    = notifications.length;

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();

    // Filter strictly at channel level — not in JS after event arrives.
    // Wrong filter = all users' notifications broadcast to all clients (pre-mortem item 1).
    const channel = supabase
      .channel(`notifications:${userId}:${mountId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new as Notification;
          setNotifications((prev) => [incoming, ...prev].slice(0, 50));
          playRef.current();
        },
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, mountId]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );

    const result = await markNotificationReadAction(id);
    if (result.error) {
      // Rollback on failure
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)),
      );
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();

    // Optimistic update — clears dot and all row indicators immediately
    setNotifications((prev) =>
      prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)),
    );

    setIsLoading(true);
    const result = await markAllReadAction();
    setIsLoading(false);

    if (result.error) {
      // Rollback on failure
      setNotifications((prev) =>
        prev.map((n) =>
          n.read_at === now ? { ...n, read_at: null } : n,
        ),
      );
    }
  }, []);

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    isLoading,
  };
}
