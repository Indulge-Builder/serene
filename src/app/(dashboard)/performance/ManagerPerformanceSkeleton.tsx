// Skeleton for the manager / founder performance view.
// Two-column layout mirrors ManagerPerformancePanel.
// Left: 4 agent card skeletons (avatar + two line shimmer each), stagger 0/80/160/240ms §11.4.
// Right: empty-state panel placeholder (min-height matches PerformanceRosterEmptyState).

const STAGGER = [0, 80, 160, 240];

function AgentCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        "var(--space-3)",
        padding:    "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--theme-paper)",
        border:     "1px solid var(--theme-paper-border)",
      }}
    >
      <div
        className="skeleton"
        style={{
          width:          "44px",
          height:         "44px",
          borderRadius:   "var(--radius-md)",
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
        <div
          className="skeleton"
          style={{
            width:          "120px",
            height:         "13px",
            borderRadius:   "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
        <div
          className="skeleton"
          style={{
            width:          "64px",
            height:         "11px",
            borderRadius:   "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

export function ManagerPerformanceSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        gap:     "var(--space-6)",
        minHeight: "600px",
      }}
    >
      <div
        style={{
          width:        "280px",
          flexShrink:   0,
          display:      "flex",
          flexDirection: "column",
          gap:           "var(--space-2)",
          background:    "var(--theme-paper)",
          border:        "1px solid var(--theme-paper-border)",
          borderRadius:  "var(--radius-lg)",
          padding:       "var(--space-3)",
          boxShadow:     "var(--shadow-1)",
          alignSelf:     "flex-start",
        }}
      >
        <div
          className="skeleton"
          style={{ width: "80px", height: "10px", borderRadius: "var(--radius-xs)", marginBottom: "var(--space-2)" }}
        />
        {STAGGER.map((delay, i) => (
          <AgentCardSkeleton key={i} delay={delay} />
        ))}
      </div>

      <div
        style={{
          flex:           1,
          minWidth:       0,
          minHeight:      "600px",
          borderRadius:   "var(--radius-lg)",
          border:         "1px solid var(--theme-paper-border)",
          background:     "var(--theme-paper-subtle)",
          boxShadow:      "var(--shadow-1)",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            "var(--space-4)",
          padding:        "var(--space-8)",
        }}
      >
        <div
          className="skeleton"
          style={{ width: "64px", height: "64px", borderRadius: "var(--radius-xl)" }}
        />
        <div
          className="skeleton"
          style={{ width: "160px", height: "22px", borderRadius: "var(--radius-xs)" }}
        />
        <div
          className="skeleton"
          style={{ width: "220px", height: "14px", borderRadius: "var(--radius-xs)" }}
        />
      </div>
    </div>
  );
}
