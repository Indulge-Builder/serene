export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="layout-canvas relative min-h-dvh flex items-center justify-center overflow-hidden"
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

      {/* Engraved mandala — 8-fold Seed-of-Life rosette: eight circles whose
          edges all pass through one central point hidden behind the card.
          A conic beam rotates inside the statically-masked lit layer (120s),
          so the line-work catches the light without the pattern spinning. */}
      <div className="serene-auth-mandala-wrap pointer-events-none absolute" aria-hidden="true">
        <div className="serene-auth-mandala" />
        <div className="serene-auth-mandala-lit">
          <div className="serene-auth-mandala-beam" />
        </div>
      </div>

      {/* Floating orb A — upper right, 24s drift + breathe. Transform only. */}
      <div className="serene-auth-orb-a pointer-events-none absolute" aria-hidden="true" />

      {/* Floating orb B — lower left, 30s counter-drift + breathe. Transform only. */}
      <div className="serene-auth-orb-b pointer-events-none absolute" aria-hidden="true" />

      {children}
    </div>
  );
}
