/**
 * notifications-service.ts
 * All DB queries for the notifications inbox.
 * INSERT uses the admin (service-role) client — RLS blocks direct inserts.
 * SELECT/UPDATE use the server client — RLS enforces recipient_id = auth.uid().
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Notification, NotificationType } from "@/lib/types/database";

export interface CreateNotificationPayload {
  recipient_id: string;
  type:         NotificationType;
  title:        string;
  body?:        string;
  action_url?:  string;   // relative path only
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Last 20 unread notifications for `userId`, newest first. */
export async function getUnreadNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[notifications-service] getUnreadNotifications error:", error);
    return [];
  }
  return data ?? [];
}

/** Last 50 notifications (read + unread) for `userId`, newest first. */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[notifications-service] getNotifications error:", error);
    return [];
  }
  return data ?? [];
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Mark a single notification read.
 * Double-gated: service verifies recipient_id matches userId before UPDATE.
 * RLS also enforces this at DB level (Rule A-09).
 */
export async function markNotificationRead(
  id: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", userId)   // two-layer guard
    .is("read_at", null);         // idempotent — no-op if already read

  if (error) {
    console.error("[notifications-service] markNotificationRead error:", error);
    return { error: "Failed to mark notification as read." };
  }
  return { error: null };
}

/**
 * Mark all unread notifications for `userId` as read.
 * WHERE recipient_id = userId is enforced both in code AND by RLS.
 */
export async function markAllNotificationsRead(
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[notifications-service] markAllNotificationsRead error:", error);
    return { error: "Failed to mark all notifications as read." };
  }
  return { error: null };
}

// ─── Create (service role only) ───────────────────────────────────────────────

/**
 * Insert a notification.
 * Uses the admin (service-role) client — INSERT is blocked for all other clients by RLS.
 * Only called from server actions, never directly from components.
 */
export async function createNotification(
  payload: CreateNotificationPayload,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .insert({
      recipient_id: payload.recipient_id,
      type:         payload.type,
      title:        payload.title,
      body:         payload.body ?? null,
      action_url:   payload.action_url ?? null,
    });

  if (error) {
    console.error("[notifications-service] createNotification error:", error);
    return { error: "Failed to create notification." };
  }
  return { error: null };
}
