// Skeleton for the redesigned performance page.
// Tier 1: 4 KPI cards in a single row (each with sparkline space)
// Tier 2: 4 compact effort cards
// Tier 3: 1 wide call outcome card (donut + legend layout)
// Stagger: 0 / 60 / 120 / 180ms across cards per §11.4.
// V-08: minimum 150ms enforced by the Suspense boundary above.

const STAGGER = [0, 60, 120, 180];

function KpiCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-1)",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* eyebrow + icon row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          className="skeleton"
          style={{
            width: "96px",
            height: "10px",
            borderRadius: "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
        <div
          className="skeleton"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            animationDelay: `${delay}ms`,
          }}
        />
      </div>

      {/* value + sparkline */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)" }}>
        <div
          className="skeleton"
          style={{
            width: "72px",
            height: "36px",
            borderRadius: "var(--radius-xs)",
            animationDelay: `${delay}ms`,
            flexShrink: 0,
          }}
        />
        <div
          className="skeleton"
          style={{
            flex: 1,
            height: "40px",
            borderRadius: "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
      </div>

      {/* delta line */}
      <div
        className="skeleton"
        style={{
          width: "140px",
          height: "12px",
          borderRadius: "var(--radius-xs)",
          animationDelay: `${delay}ms`,
        }}
      />

      {/* sub-label */}
      <div
        className="skeleton"
        style={{
          width: "120px",
          height: "10px",
          borderRadius: "var(--radius-xs)",
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

function CompactCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-4)",
        boxShadow: "var(--shadow-1)",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* icon + eyebrow */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <div
          className="skeleton"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-sm)",
            animationDelay: `${delay}ms`,
            flexShrink: 0,
          }}
        />
        <div
          className="skeleton"
          style={{
            width: "80px",
            height: "10px",
            borderRadius: "var(--radius-xs)",
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      {/* value */}
      <div
        className="skeleton"
        style={{
          width: "48px",
          height: "28px",
          borderRadius: "var(--radius-xs)",
          animationDelay: `${delay}ms`,
        }}
      />
      {/* fill bar */}
      <div
        className="skeleton"
        style={{
          width: "100%",
          height: "3px",
          borderRadius: "var(--radius-full)",
          animationDelay: `${delay}ms`,
        }}
      />
      {/* description */}
      <div
        className="skeleton"
        style={{
          width: "110px",
          height: "10px",
          borderRadius: "var(--radius-xs)",
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

function OutcomeCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--theme-paper)",
        border: "1px solid var(--theme-paper-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-1)",
        display: "flex",
        gap: "var(--space-6)",
        alignItems: "center",
      }}
    >
      {/* Left: legend rows */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div className="skeleton" style={{ width: "140px", height: "10px", borderRadius: "var(--radius-xs)" }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              width: "100%",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              animationDelay: `${i * 40}ms`,
            }}
          />
        ))}
      </div>
      {/* Right: donut placeholder */}
      <div
        className="skeleton"
        style={{
          width: "180px",
          height: "180px",
          borderRadius: "var(--radius-full)",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function SectionLabelSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-1)" }}>
      <div className="skeleton" style={{ width: "160px", height: "10px", borderRadius: "var(--radius-xs)" }} />
      <div style={{ flex: 1, height: "1px", background: "var(--theme-paper-border)" }} />
    </div>
  );
}

export function PerformanceSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      {/* Tier 1 — KPI row */}
      <div>
        <SectionLabelSkeleton />
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          {STAGGER.map((delay, i) => (
            <KpiCardSkeleton key={i} delay={delay} />
          ))}
        </div>
      </div>

      {/* Tier 2 — effort cards */}
      <div>
        <SectionLabelSkeleton />
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          {STAGGER.map((delay, i) => (
            <CompactCardSkeleton key={i} delay={delay} />
          ))}
        </div>
      </div>

      {/* Tier 3 — call outcome */}
      <div>
        <SectionLabelSkeleton />
        <OutcomeCardSkeleton />
      </div>
    </div>
  );
}
