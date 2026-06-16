// notification-categories.ts — THE canonical catalog for the per-user
// notification control plane (migration 0133).
//
// One entry per notification CATEGORY the user can start/stop. A category is an
// (event × recipient-role-that-differs) pair: the same event reaching two roles
// gets two entries when an individual should be able to silence one without the
// other (e.g. a founder killing their cross-domain "new lead" WhatsApp flood
// must NOT also mute an agent's assignment alert — different category keys).
//
// This file is the SINGLE SOURCE the three layers key on:
//   * the UI (NotificationPreferences.tsx) iterates CATEGORIES, filtered to the
//     rows whose `roles` include the current user;
//   * the gate (notification-prefs-service.ts) resolves a recipient's channels by
//     this `key`;
//   * the SQL CHECK on notification_preferences.notification_key mirrors `keys`
//     (keep in sync — a new category = one entry here + a CHECK-extending migration).
//
// `channels` lists which channels this category can EVER fire on — the UI renders
// a checkbox only for those (no dead toggles; e.g. lead_won is in-app only).
//
// NEVER-SILENCEABLE events (lead_initiation = opens the legal 24h WhatsApp window
// and can throw; elaya_reply = a direct reply to a staff message) are TRANSACTIONAL,
// not preferences — they are deliberately ABSENT from this catalog. The gate has no
// key for them, so they can never be muted.

import type { UserRole } from '@/lib/types/database';

export type NotificationChannel = 'in_app' | 'whatsapp';

export interface NotificationCategory {
  /** Stable semantic key — never rename after ship. SQL CHECK + pref rows key on it. */
  key:         string;
  /** UI row label (user-facing, plain). */
  label:       string;
  /** One-line helper copy under the label. */
  description: string;
  /** Channels this category can fire on → the only checkboxes the UI renders. */
  channels:    NotificationChannel[];
  /** Roles that can RECEIVE this category → the only rows the UI shows that user. */
  roles:       UserRole[];
}

// Order = display order in the panel, grouped by domain (Leads · Deals · Tasks · SLA).
export const NOTIFICATION_CATEGORIES = [
  // ── Leads ──────────────────────────────────────────────────────────────────
  {
    key:         'lead_assigned',
    label:       'New lead assigned to me',
    description: 'When a lead is routed or reassigned to you.',
    channels:    ['in_app', 'whatsapp'],
    roles:       ['agent', 'manager'], // lead-carriers (LEAD_ASSIGNABLE_ROLES)
  },
  {
    key:         'new_lead_founder_alert',
    label:       'New lead alerts (all domains)',
    description: 'A WhatsApp ping for every new lead across every domain.',
    channels:    ['whatsapp'],
    roles:       ['founder'],
  },
  {
    key:         'lead_won',
    label:       'Lead won',
    description: 'When a lead in your domain is marked won.',
    channels:    ['in_app'],
    roles:       ['manager', 'admin', 'founder'],
  },
  // ── Deals ──────────────────────────────────────────────────────────────────
  {
    key:         'deal_created',
    label:       'New deal created',
    description: 'When a deal or walk-in is recorded in your domain.',
    channels:    ['in_app'],
    roles:       ['manager', 'admin', 'founder'],
  },
  // ── Tasks ──────────────────────────────────────────────────────────────────
  {
    key:         'task_assigned',
    label:       'Task assigned to me',
    description: 'When someone assigns you a task or subtask.',
    channels:    ['in_app'],
    roles:       ['agent', 'manager', 'admin', 'founder'],
  },
  {
    key:         'task_due',
    label:       'My task is due',
    description: 'A reminder when one of your tasks reaches its due time.',
    channels:    ['in_app', 'whatsapp'],
    roles:       ['agent', 'manager', 'admin', 'founder'],
  },
  {
    key:         'task_overdue_manager',
    label:       'A team task went overdue',
    description: 'When a follow-up task in your domain passes its deadline.',
    channels:    ['in_app', 'whatsapp'],
    roles:       ['manager', 'admin', 'founder'],
  },
  // ── SLA / Gia engine (the notification the engine emits — not the engine rule) ─
  {
    key:         'sla_breach',
    label:       'SLA breach on my lead',
    description: 'When one of your leads breaches its follow-up SLA.',
    channels:    ['in_app', 'whatsapp'],
    roles:       ['agent', 'manager'],
  },
  {
    key:         'sla_escalation',
    label:       'SLA escalation (team)',
    description: 'When a lead in your domain escalates for missing its SLA.',
    channels:    ['in_app', 'whatsapp'],
    roles:       ['manager', 'admin', 'founder'],
  },
] as const satisfies readonly NotificationCategory[];

export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORIES)[number]['key'];

/** All category keys — mirrors the SQL CHECK on notification_preferences. */
export const NOTIFICATION_CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map(
  (c) => c.key,
) as NotificationCategoryKey[];

/** Non-empty tuple for z.enum() in the validation schema. */
export const NOTIFICATION_CATEGORY_ENUM = NOTIFICATION_CATEGORY_KEYS as [
  NotificationCategoryKey,
  ...NotificationCategoryKey[],
];

const CATEGORY_BY_KEY: Record<string, NotificationCategory> = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c]),
);

/** Lookup a category by key (undefined for an unknown/transactional key). */
export function getNotificationCategory(
  key: string,
): NotificationCategory | undefined {
  return CATEGORY_BY_KEY[key];
}

/** The categories a given role can receive — the rows the UI renders for them. */
export function categoriesForRole(role: UserRole): NotificationCategory[] {
  // `as const` narrows c.roles to a readonly literal tuple; widen to readonly
  // UserRole[] so .includes accepts the param (values are already UserRoles).
  return NOTIFICATION_CATEGORIES.filter((c) =>
    (c.roles as readonly UserRole[]).includes(role),
  );
}

/** True when `key` is a real, gateable category (not transactional/unknown). */
export function isNotificationCategoryKey(
  key: string,
): key is NotificationCategoryKey {
  return key in CATEGORY_BY_KEY;
}
