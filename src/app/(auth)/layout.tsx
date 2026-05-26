export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden">

      {/* Canvas noise texture — baseFrequency 0.9, opacity 0.04 per design DNA */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize:   "256px 256px",
        }}
        aria-hidden="true"
      />

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

      {/* Diagonal accent line 1 — upper sweep */}
      <div className="eia-auth-line-1 pointer-events-none absolute" aria-hidden="true" />

      {/* Diagonal accent line 2 — lower sweep */}
      <div className="eia-auth-line-2 pointer-events-none absolute" aria-hidden="true" />

      {children}
    </div>
  );
}
