// Skeleton — left rail (title + list) + full-height right pane.

export default function WhatsAppLoading() {
  return (
    <main className="flex min-h-0 flex-1 overflow-hidden">
      <div
        style={{
          width:         "320px",
          flexShrink:    0,
          display:       "flex",
          flexDirection: "column",
          paddingTop:    "var(--space-8)",
          paddingLeft:   "var(--space-8)",
          background:    "var(--theme-paper)",
          borderRight:   "1px solid var(--theme-paper-border)",
        }}
      >
        <div className="mb-6 flex shrink-0 items-center justify-between gap-4" style={{ paddingRight: "var(--space-4)" }}>
          <div
            className="skeleton"
            style={{
              width:        "140px",
              height:       "28px",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            marginRight: "var(--space-4)",
            marginBottom: "var(--space-4)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              padding: "var(--space-3) var(--space-4)",
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div
              className="skeleton"
              style={{
                width: "100%",
                height: "32px",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              border: "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-1)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
          <div
            style={{
              flexShrink: 0,
              padding: "var(--space-3) var(--space-4) var(--space-2)",
              borderBottom: "1px solid var(--theme-paper-border)",
            }}
          >
            <div
              className="skeleton"
              style={{
                width: "100px",
                height: "10px",
                borderRadius: "var(--radius-sm)",
              }}
            />
          </div>
          <div style={{ padding: "var(--space-1)" }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-4)",
                  animationDelay: `${Math.min(i * 35, 280)}ms`,
                }}
              >
                <div
                  className="skeleton"
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "var(--radius-md)",
                    flexShrink: 0,
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    flex: 1,
                    height: "14px",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    width: "36px",
                    height: "12px",
                    borderRadius: "var(--radius-sm)",
                    flexShrink: 0,
                  }}
                />
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      <div
        style={{
          flex:           1,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            "var(--space-5)",
          background:     "var(--theme-paper-subtle)",
        }}
      >
        <div
          className="skeleton"
          style={{
            width:        "64px",
            height:       "64px",
            borderRadius: "var(--radius-xl)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)" }}>
          <div
            className="skeleton"
            style={{
              width:        "150px",
              height:       "24px",
              borderRadius: "var(--radius-sm)",
            }}
          />
          <div
            className="skeleton"
            style={{
              width:        "200px",
              height:       "14px",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </div>
      </div>
    </main>
  );
}
