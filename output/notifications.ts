"use server";

/**
 * notifications.ts — server actions for the notification inbox.
 * All actions begin with Zod validation (Rule 02).
 * Authorization reads only from profiles (Rule 09).
 * Returns { data, error } — never throws (Rule 10).
 */

import { z } from "zod";
import { requireProfile } from "@/lib/actions/_auth";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/services/notifications-service";
import type { ActionResult } from "@/lib/types/index";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const markReadSchema = z.object({
  id: z.string().uuid("Invalid notification ID."),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Validates ownership: the caller must be the recipient.
 */
export async function markNotificationReadAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  // Zod validation — Rule 02
  const parsed = markReadSchema.safeParse({ id });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Session auth — Rule 09
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const { error } = await markNotificationRead(parsed.data.id, profile.id);
  if (error) return { data: null, error };

  return { data: { id: parsed.data.id }, error: null };
}

/**
 * Mark all unread notifications as read for the current session user.
 * Session-scoped — no input parameter needed.
 */
export async function markAllReadAction(): Promise<ActionResult<{ success: true }>> {
  // Zod validation — Rule 02 (no schema needed — session-scoped, no untrusted input)
  const parsed = z.object({}).safeParse({});
  if (!parsed.success) {
    return { data: null, error: "Invalid input." };
  }

  // Session auth — Rule 09
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const { error } = await markAllNotificationsRead(profile.id);
  if (error) return { data: null, error };

  return { data: { success: true }, error: null };
}
