"use client";

// Stubbed in Phase 4 — toggles render but do nothing.
// Will be wired when the notification system is built.

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
            display:       "flex",
            alignItems:    "center",
            justifyContent:"space-between",
            gap:           "var(--space-4)",
            padding:       "var(--space-4) 0",
            borderBottom:  index < NOTIFICATION_ROWS.length - 1
              ? "1px solid var(--theme-paper-border)"
              : "none",
          }}
        >
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-sm)",
                fontWeight: "var(--weight-medium)",
                color:      "var(--theme-text-primary)",
                margin:     0,
                opacity:    0.45,
              }}
            >
              {row.label}
            </p>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-xs)",
                color:      "var(--theme-text-tertiary)",
                margin:     "var(--space-1) 0 0",
                opacity:    0.45,
              }}
            >
              {row.description}
            </p>
          </div>

          {/* Disabled toggle */}
          <div
            role="switch"
            aria-checked="false"
            aria-disabled="true"
            aria-label={row.label}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "var(--space-2)",
              cursor:       "not-allowed",
              opacity:      0.4,
            }}
          >
            {/* Track */}
            <div
              style={{
                width:        "40px",
                height:       "24px",
                borderRadius: "var(--radius-full)",
                background:   "var(--theme-paper-border)",
                position:     "relative",
                flexShrink:   0,
              }}
            >
              {/* Thumb */}
              <div
                style={{
                  position:     "absolute",
                  top:          "4px",
                  left:         "4px",
                  width:        "16px",
                  height:       "16px",
                  borderRadius: "var(--radius-full)",
                  background:   "white",
                  boxShadow:    "0 1px 3px rgb(0 0 0 / 0.15)",
                }}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Coming soon notice */}
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
