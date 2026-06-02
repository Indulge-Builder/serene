export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-dvh flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--theme-canvas)" }}
    >
      {/* Primary ambient glow — 62% 38%, not centred.
          A centred glow is a spotlight. Off-centre is a window. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 62% 38%, var(--theme-canvas-glow), transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Secondary depth glow — counter-corner for spatial depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 55% 45% at 18% 78%, var(--theme-canvas-glow), transparent 68%)",
          opacity:    0.55,
        }}
        aria-hidden="true"
      />

      {/* Floating orb A — upper right, 24s drift. Transform only. */}
      <div className="eia-auth-orb-a pointer-events-none absolute" aria-hidden="true" />

      {/* Floating orb B — lower left, 30s counter-drift. Transform only. */}
      <div className="eia-auth-orb-b pointer-events-none absolute" aria-hidden="true" />

      {children}
    </div>
  );
}
