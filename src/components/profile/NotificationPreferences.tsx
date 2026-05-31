"use client";

import { Toggle } from "@/components/ui/Toggle";
import { useNotificationSound } from "@/hooks/useNotificationSound";

type NotificationRow = {
  id:          string;
  label:       string;
  description: string;
};

const STUB_ROWS: NotificationRow[] = [
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
  const sound = useNotificationSound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Sound toggle — live, localStorage-backed. Hidden until hydrated (avoids flicker). */}
      {sound.enabled !== null && (
        <div
          style={{
            padding:      "var(--space-4) 0",
            borderBottom: "1px solid var(--theme-paper-border)",
          }}
        >
          <Toggle
            checked={sound.enabled}
            onChange={sound.setEnabled}
            label="Notification sound"
            description="A short chime when new notifications arrive"
          />
        </div>
      )}

      {/* Stubbed rows — not yet wired to DB */}
      {STUB_ROWS.map((row, index) => (
        <div
          key={row.id}
          style={{
            padding:      "var(--space-4) 0",
            borderBottom: index < STUB_ROWS.length - 1
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
        Additional notification controls will be available in a future update.
      </p>
    </div>
  );
}
