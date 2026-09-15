// HealthPill — THE happiness score at list and card density (client-ticket-plan 5.5).
// Bands: under 50 danger, 50 to 74 warning, 75 and up success; null renders an em dash.

export function healthTone(score: number | null): { bg: string; fg: string } {
  if (score == null) return { bg: 'var(--color-neutral-light)', fg: 'var(--theme-text-tertiary)' };
  if (score < 50) return { bg: 'var(--color-danger-light)', fg: 'var(--color-danger-text)' };
  if (score < 75) return { bg: 'var(--color-warning-light)', fg: 'var(--color-warning-text)' };
  return { bg: 'var(--color-success-light)', fg: 'var(--color-success-text)' };
}

export function HealthPill({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'lg' }) {
  const tone = healthTone(score);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: size === 'lg' ? 56 : 36,
        padding: size === 'lg' ? '6px var(--space-3)' : '2px var(--space-2)',
        borderRadius: 'var(--radius-full)',
        background: tone.bg,
        color: tone.fg,
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: size === 'lg' ? 'var(--text-xl)' : 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
      }}
      aria-label={score == null ? 'No health score yet' : `Health ${score} of 100`}
    >
      {score == null ? '—' : score}
    </span>
  );
}
