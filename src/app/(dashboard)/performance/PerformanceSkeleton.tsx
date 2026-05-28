// Skeleton for the performance page.
// Layout: 2×2 Tier-1 stat card skeletons + 4 compact Tier-2 skeletons + 1 wide Tier-3 skeleton.
// Stagger: 0 / 80 / 160 / 240ms across Tier 1 per §11.4.
// Visible minimum 150ms enforced by Suspense boundary (V-08).
//
// hasBenchmark: the three rate/time cards carry two extra skeleton lines
// (benchmark value + "across N agents") below the delta line.
// Leads Won does not.

const STAGGER = [0, 80, 160, 240];

function StatCardSkeleton({ delay, hasBenchmark }: { delay: number; hasBenchmark: boolean }) {
  return (
    <div
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-5)",
        boxShadow:    "var(--shadow-1)",
      }}
    >
      {/* eyebrow label */}
      <div
        className="skeleton"
        style={{
          width:          "96px",
          height:         "10px",
          borderRadius:   "var(--radius-xs)",
          marginBottom:   "var(--space-3)",
          animationDelay: `${delay}ms`,
        }}
      />
      {/* primary number */}
      <div
        className="skeleton"
        style={{
          width:          "72px",
          height:         "36px",
          borderRadius:   "var(--radius-xs)",
          marginBottom:   "var(--space-3)",
          animationDelay: `${delay}ms`,
        }}
      />
      {/* stats group */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* delta badge */}
        <div
          className="skeleton"
          style={{
            width:          "56px",
            height:         "14px",
            borderRadius:   "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
        {/* benchmark value — only on rate/time cards */}
        {hasBenchmark && (
          <div
            className="skeleton"
            style={{
              width:          "112px",
              height:         "14px",
              borderRadius:   "var(--radius-xs)",
              animationDelay: `${delay}ms`,
            }}
          />
        )}
        {/* "across N agents" micro line */}
        {hasBenchmark && (
          <div
            className="skeleton"
            style={{
              width:          "64px",
              height:         "10px",
              borderRadius:   "var(--radius-xs)",
              animationDelay: `${delay}ms`,
            }}
          />
        )}
        {/* sub-label */}
        <div
          className="skeleton"
          style={{
            width:          "128px",
            height:         "10px",
            borderRadius:   "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

function CompactCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-4) var(--space-4)",
        boxShadow:    "var(--shadow-1)",
      }}
    >
      <div
        className="skeleton"
        style={{
          width:          "80px",
          height:         "10px",
          borderRadius:   "var(--radius-xs)",
          marginBottom:   "var(--space-3)",
          animationDelay: `${delay}ms`,
        }}
      />
      <div
        className="skeleton"
        style={{
          width:          "56px",
          height:         "28px",
          borderRadius:   "var(--radius-xs)",
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

function WideBlockSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background:   "var(--theme-paper)",
        border:       "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding:      "var(--space-5)",
        boxShadow:    "var(--shadow-1)",
        height:       "160px",
      }}
    >
      <div
        className="skeleton"
        style={{
          width:          "120px",
          height:         "10px",
          borderRadius:   "var(--radius-xs)",
          marginBottom:   "var(--space-4)",
          animationDelay: `${delay}ms`,
        }}
      />
      <div
        className="skeleton"
        style={{
          width:          "100%",
          height:         "80px",
          borderRadius:   "var(--radius-sm)",
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

export function PerformanceSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Tier 1 — 2×2 Core Four stat cards
            Order matches CoreFourGrid: Leads Won, Touch Rate, Avg Response Time, Conversion Rate
            hasBenchmark: false for Leads Won (index 0), true for the other three */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap:                 "var(--space-4)",
        }}
      >
        {STAGGER.map((delay, i) => (
          <StatCardSkeleton key={i} delay={delay} hasBenchmark={i !== 0} />
        ))}
      </div>

      {/* Tier 2 — 4 compact effort cards */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 "var(--space-4)",
        }}
      >
        {STAGGER.map((delay, i) => (
          <CompactCardSkeleton key={i} delay={delay} />
        ))}
      </div>

      {/* Tier 3 — 1 wide call outcome bar */}
      <WideBlockSkeleton delay={0} />
    </div>
  );
}
