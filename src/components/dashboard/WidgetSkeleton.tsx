import { WIDGET_HEIGHT_BY_SIZE, type WidgetSize } from "@/lib/constants/dashboard-widgets";

type WidgetSkeletonProps = {
  size?: WidgetSize;
};

export function WidgetSkeleton({ size = "md" }: WidgetSkeletonProps) {
  const minHeight = WIDGET_HEIGHT_BY_SIZE[size];

  return (
    <div
      style={{
        minHeight,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--theme-paper-border)",
        background: "var(--theme-paper)",
        boxShadow: "var(--shadow-1)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        overflow: "hidden",
      }}
    >
      {/* Header line */}
      <div
        style={{
          height: "10px",
          width: "35%",
          borderRadius: "var(--radius-full)",
          background: "var(--theme-paper-border)",
          animation: "pulse 1.8s ease-in-out infinite",
        }}
      />
      {/* Title line */}
      <div
        style={{
          height: "20px",
          width: "55%",
          borderRadius: "var(--radius-sm)",
          background: "var(--theme-paper-border)",
          animation: "pulse 1.8s ease-in-out 80ms infinite",
        }}
      />
      {/* Body block */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          marginTop: "var(--space-1)",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: "14px",
              width: `${80 - i * 8}%`,
              borderRadius: "var(--radius-xs)",
              background: "var(--theme-paper-border)",
              animation: `pulse 1.8s ease-in-out ${i * 80}ms infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
