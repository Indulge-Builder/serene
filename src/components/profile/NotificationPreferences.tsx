"use client";

/**
 * NotificationPreferences — the per-user notification control matrix on /profile
 * (migration 0133). Each row is one notification CATEGORY the current user can
 * receive; the In-app / WhatsApp checkboxes decide whether that channel fires for
 * THEM. All on by default — a row in notification_preferences exists only as an
 * opt-out, so an unchecked box = a stored mute, a checked box = the implicit-on
 * default (no row).
 *
 * Display-only chrome (tokens only, Toggle/checkbox primitives). Save semantics
 * mirror SlaPoliciesPanel: flip optimistically, disable the row while in-flight,
 * revert + toast on error. Writes via setNotificationPrefAction (A-15 — the panel
 * imports the action, never the service).
 *
 * Role-aware: only categories whose catalog `roles` include the user are rendered,
 * and within a row only the channels that category can ever fire on get a checkbox
 * — no dead toggles.
 */

import { useMemo, useState, useTransition } from "react";
import {
  categoriesForRole,
  type NotificationChannel,
} from "@/lib/constants/notification-categories";
import { setNotificationPrefAction } from "@/lib/actions/notification-prefs";
import { toast } from "@/lib/toast";
import type { UserRole } from "@/lib/types/database";

interface SeedPref {
  notification_key: string;
  in_app:           boolean;
  whatsapp:         boolean;
}

interface NotificationPreferencesProps {
  role:         UserRole;
  initialPrefs: SeedPref[];
}

// Local per-category channel state. Absence of a seed row = both on.
type ChannelState = { in_app: boolean; whatsapp: boolean };

export function NotificationPreferences({ role, initialPrefs }: NotificationPreferencesProps) {
  const categories = useMemo(() => categoriesForRole(role), [role]);

  // Seed: start every visible category on, then apply stored opt-outs.
  const [state, setState] = useState<Record<string, ChannelState>>(() => {
    const base: Record<string, ChannelState> = {};
    for (const cat of categories) base[cat.key] = { in_app: true, whatsapp: true };
    for (const pref of initialPrefs) {
      if (base[pref.notification_key]) {
        base[pref.notification_key] = { in_app: pref.in_app, whatsapp: pref.whatsapp };
      }
    }
    return base;
  });

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function setPending(key: string, on: boolean) {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggle(key: string, channel: NotificationChannel) {
    const current = state[key];
    if (!current) return;

    const optimistic: ChannelState = { ...current, [channel]: !current[channel] };
    const previous = current;

    // Optimistic flip + disable the row.
    setState((s) => ({ ...s, [key]: optimistic }));
    setPending(key, true);

    startTransition(async () => {
      const res = await setNotificationPrefAction({
        notificationKey: key,
        inApp:           optimistic.in_app,
        whatsapp:        optimistic.whatsapp,
      });
      if (res.error) {
        setState((s) => ({ ...s, [key]: previous })); // revert
        toast.danger(res.error);
      }
      setPending(key, false);
    });
  }

  if (categories.length === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle:  "italic",
          fontSize:   "var(--text-sm)",
          color:      "var(--theme-text-tertiary)",
        }}
      >
        No notifications to configure for your role.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-xs)",
          color:      "var(--theme-text-tertiary)",
          margin:     0,
        }}
      >
        Choose how each notification reaches you. Unchecking a box stops that channel
        for you only — everyone else is unaffected.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {categories.map((cat) => {
          const channels = state[cat.key];
          const pending = pendingKeys.has(cat.key);
          if (!channels) return null;

          return (
            <div
              key={cat.key}
              style={{
                display:        "grid",
                gridTemplateColumns: "1fr auto",
                alignItems:     "center",
                gap:            "var(--space-4)",
                padding:        "var(--space-3) var(--space-4)",
                borderRadius:   "var(--radius-md)",
                border:         "1px solid var(--theme-paper-border)",
                background:     "var(--theme-paper-subtle)",
                opacity:        pending ? 0.6 : 1,
                transition:     "opacity var(--duration-fast) var(--ease-in-out)",
              }}
            >
              {/* Label + description */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-sm)",
                    fontWeight: "var(--weight-medium)",
                    color:      "var(--theme-text-primary)",
                  }}
                >
                  {cat.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize:   "var(--text-xs)",
                    color:      "var(--theme-text-tertiary)",
                  }}
                >
                  {cat.description}
                </span>
              </div>

              {/* Channel checkboxes — only those this category can fire on */}
              <div style={{ display: "flex", gap: "var(--space-4)", justifySelf: "end" }}>
                {cat.channels.map((channel) => {
                  const checked = channels[channel];
                  return (
                    <label
                      key={channel}
                      style={{
                        display:    "flex",
                        alignItems: "center",
                        gap:        "var(--space-2)",
                        fontFamily: "var(--font-sans)",
                        fontSize:   "var(--text-xs)",
                        color:      checked
                          ? "var(--theme-text-primary)"
                          : "var(--theme-text-tertiary)",
                        cursor:     pending ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={() => toggle(cat.key, channel)}
                        style={{ accentColor: "var(--theme-accent)" }}
                      />
                      {channel === "in_app" ? "In-app" : "WhatsApp"}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
