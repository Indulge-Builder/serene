export function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;

  function score(pw: string): number {
    let s = 0;
    if (pw.length >= 8)  s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9!@#$%^&*]/.test(pw)) s++;
    return s;
  }

  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = [
    "transparent",
    "var(--color-danger)",
    "var(--color-warning)",
    "var(--color-info)",
    "var(--color-success)",
  ];

  const s = score(password);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <div style={{ display: "flex", gap: "var(--space-1)" }}>
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            style={{
              flex:         1,
              height:       "3px",
              borderRadius: "var(--radius-full)",
              background:   s >= level ? colors[s] : "var(--theme-paper-border)",
              transition:   "background var(--duration-base) var(--ease-in-out)",
            }}
          />
        ))}
      </div>
      {s > 0 && (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      colors[s],
            margin:     0,
            transition: "color var(--duration-base) var(--ease-in-out)",
          }}
        >
          {labels[s]}
        </p>
      )}
    </div>
  );
}
