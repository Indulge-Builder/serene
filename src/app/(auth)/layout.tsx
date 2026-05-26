export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-dvh flex items-center justify-center overflow-hidden"
    >
      {/* Accent glow — radial wash from centre */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 38%, var(--theme-canvas-glow), transparent 72%)",
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
