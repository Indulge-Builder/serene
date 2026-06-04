// Skeleton for the manager / founder performance view.
// Two-column layout mirrors ManagerPerformancePanel.
// Left: 4 agent card skeletons (avatar + two line shimmer each), stagger 0/80/160/240ms §11.4.
// Right: 2×2 grid of domain health card skeletons matching DomainHealthGrid initial state.
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

      {/* Right column — domain health overview skeleton (2×2 grid) */}
      <div
        style={{
          flex:                1,
          minWidth:            0,
          display:             "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap:                 "var(--space-4)",
          alignContent:        "start",
        }}
      >
        {[0, 80, 160, 240].map((delay, i) => (
          <div
            key={i}
            style={{
              background:   "var(--theme-paper)",
              border:       "1px solid var(--theme-paper-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow:    "var(--shadow-1)",
              padding:      "var(--space-5)",
              display:      "flex",
              flexDirection: "column",
              gap:          "var(--space-4)",
            }}
          >
            {/* Eyebrow + pip */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="skeleton" style={{ width: "72px", height: "10px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
              <div className="skeleton" style={{ width: "8px",  height: "8px",  borderRadius: "var(--radius-full)", animationDelay: `${delay}ms` }} />
            </div>
            {/* Primary stat */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="skeleton" style={{ width: "56px", height: "36px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
              <div className="skeleton" style={{ width: "64px", height: "10px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
            </div>
            {/* Secondary */}
            <div style={{ display: "flex", gap: "var(--space-5)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div className="skeleton" style={{ width: "40px", height: "14px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
                <div className="skeleton" style={{ width: "60px", height: "10px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div className="skeleton" style={{ width: "40px", height: "14px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
                <div className="skeleton" style={{ width: "72px", height: "10px", borderRadius: "var(--radius-xs)", animationDelay: `${delay}ms` }} />
              </div>
            </div>
            {/* Badge */}
            <div className="skeleton" style={{ width: "80px", height: "22px", borderRadius: "var(--radius-full)", animationDelay: `${delay}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
