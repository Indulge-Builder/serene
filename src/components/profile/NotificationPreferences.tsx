"use client";

// Stubbed in Phase 4 — toggles render but do nothing.
// Will be wired when the notification system is built.

import { Toggle } from '@/components/ui/Toggle';

type NotificationRow = {
  id:          string;
  label:       string;
  description: string;
};

const NOTIFICATION_ROWS: NotificationRow[] = [
  {
    id:          "notif_whatsapp",
    label:       "WhatsApp Notifications",
    description: "Receive lead updates and task reminders via WhatsApp.",
  },
  {
    id:          "notif_email",
    label:       "Daily Email Digest",
    description: "A summary of your leads and tasks delivered each morning.",
  },
];

export function NotificationPreferences() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {NOTIFICATION_ROWS.map((row, index) => (
        <div
          key={row.id}
          style={{
            padding:      "var(--space-4) 0",
            borderBottom: index < NOTIFICATION_ROWS.length - 1
              ? "1px solid var(--theme-paper-border)"
              : "none",
            opacity: 0.45,
          }}
        >
          <Toggle
            checked={false}
            onChange={() => {}}
            disabled
            label={row.label}
            description={row.description}
          />
        </div>
      ))}

      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-xs)",
          color:      "var(--theme-text-tertiary)",
          margin:     "var(--space-4) 0 0",
          fontStyle:  "italic",
        }}
      >
        Notification controls will be available in a future update.
      </p>
    </div>
  );
}
