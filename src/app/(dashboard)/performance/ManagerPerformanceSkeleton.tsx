// Skeleton for the manager / founder performance view.
// Two-column layout mirrors ManagerPerformancePanel.
// Left: 4 agent card skeletons (avatar + two line shimmer each), stagger 0/80/160/240ms §11.4.
// Right: header (large circle + two lines) + 5-col stat strip + two bar skeletons.
// All shimmer uses the same .skeleton class pattern as PerformanceSkeleton.tsx.

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
      {/* Avatar circle */}
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
      {/* Name + conversion pill */}
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

function StatStripSkeleton() {
  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        borderBottom:        "1px solid var(--theme-paper-border)",
        paddingBottom:       "var(--space-5)",
        marginBottom:        "var(--space-5)",
        gap:                 "var(--space-2)",
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
          <div
            className="skeleton"
            style={{ width: "48px", height: "28px", borderRadius: "var(--radius-xs)", animationDelay: `${i * 60}ms` }}
          />
          <div
            className="skeleton"
            style={{ width: "64px", height: "10px", borderRadius: "var(--radius-xs)", animationDelay: `${i * 60}ms` }}
          />
        </div>
      ))}
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
      {/* Left column — agent list */}
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
        {/* Roster label */}
        <div
          className="skeleton"
          style={{ width: "80px", height: "10px", borderRadius: "var(--radius-xs)", marginBottom: "var(--space-2)" }}
        />
        {STAGGER.map((delay, i) => (
          <AgentCardSkeleton key={i} delay={delay} />
        ))}
      </div>

      {/* Right column — detail panel */}
      <div
        style={{
          flex:          1,
          minWidth:      0,
          background:    "var(--theme-paper)",
          border:        "1px solid var(--theme-paper-border)",
          borderRadius:  "var(--radius-lg)",
          padding:       "var(--space-6)",
          boxShadow:     "var(--shadow-1)",
        }}
      >
        {/* Header row: large avatar + name lines */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
          <div
            className="skeleton"
            style={{ width: "72px", height: "72px", borderRadius: "var(--radius-md)", flexShrink: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="skeleton" style={{ width: "180px", height: "24px", borderRadius: "var(--radius-xs)" }} />
            <div className="skeleton" style={{ width: "96px", height: "12px", borderRadius: "var(--radius-xs)" }} />
          </div>
        </div>

        {/* 5-col stat strip */}
        <StatStripSkeleton />

        {/* Two bar skeletons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div
            className="skeleton"
            style={{ width: "100%", height: "80px", borderRadius: "var(--radius-md)" }}
          />
          <div
            className="skeleton"
            style={{ width: "100%", height: "80px", borderRadius: "var(--radius-md)" }}
          />
        </div>
      </div>
    </div>
  );
}
