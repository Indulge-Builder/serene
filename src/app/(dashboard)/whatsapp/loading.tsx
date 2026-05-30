// Skeleton for the WhatsApp page — two-panel layout.
// Renders immediately on navigation, replaced by the page once data is ready.

const TOPBAR_HEIGHT = 56;

export default function WhatsAppLoading() {
  return (
    <div
      style={{
        display:  "flex",
        height:   `calc(100dvh - ${TOPBAR_HEIGHT}px)`,
        overflow: "hidden",
      }}
    >
      {/* Left panel skeleton */}
      <div
        style={{
          width:         "320px",
          flexShrink:    0,
          display:       "flex",
          flexDirection: "column",
          background:    "var(--theme-paper-subtle)",
          borderRight:   "1px solid var(--theme-paper-border)",
        }}
      >
        {/* Header skeleton */}
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "var(--space-3)",
            padding:      "0 var(--space-5)",
            height:       "64px",
            flexShrink:   0,
            borderBottom: "1px solid var(--theme-paper-border)",
          }}
        >
          <div
            className="skeleton"
            style={{
              width:        "100px",
              height:       "20px",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </div>

        {/* Search skeleton */}
        <div style={{ padding: "var(--space-3) var(--space-4)" }}>
          <div
            className="skeleton"
            style={{
              width:        "100%",
              height:       "32px",
              borderRadius: "var(--radius-md)",
            }}
          />
        </div>

        {/* Conversation row skeletons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                display:    "flex",
                alignItems: "flex-start",
                gap:        "var(--space-3)",
                padding:    "var(--space-3) var(--space-4)",
                animationDelay: `${i * 80}ms`,
              }}
            >
              <div
                className="skeleton"
                style={{
                  width:        "8px",
                  height:       "8px",
                  borderRadius: "50%",
                  marginTop:    "6px",
                  flexShrink:   0,
                }}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <div
                    className="skeleton"
                    style={{
                      width:        "60%",
                      height:       "14px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                  <div
                    className="skeleton"
                    style={{
                      width:        "40px",
                      height:       "12px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                </div>
                <div
                  className="skeleton"
                  style={{
                    width:        "80px",
                    height:       "12px",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel skeleton — empty state placeholder */}
      <div
        style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            "var(--space-4)",
          background:     "var(--theme-paper)",
        }}
      >
        <div
          className="skeleton"
          style={{
            width:        "56px",
            height:       "56px",
            borderRadius: "var(--radius-xl)",
          }}
        />
        <div
          className="skeleton"
          style={{
            width:        "160px",
            height:       "24px",
            borderRadius: "var(--radius-sm)",
          }}
        />
        <div
          className="skeleton"
          style={{
            width:        "220px",
            height:       "14px",
            borderRadius: "var(--radius-sm)",
          }}
        />
      </div>
    </div>
  );
}
