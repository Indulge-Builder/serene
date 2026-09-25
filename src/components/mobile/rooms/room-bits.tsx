import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Shared mobile-room presentation bits (mobile-ops.md §9). Display-only
 * (A-06), --neu-* tokens exclusively, mobile touch/radius scale (card 24 /
 * tile 18). Composed by all four rooms — never re-inline these shapes.
 */

/** Tracked-caps section label — the ActivityScreen treatment. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[11px] font-semibold text-(--neu-accent-deep) px-1 pt-1"
      style={{ letterSpacing: '0.14em' }}
    >
      {children}
    </span>
  );
}

/** Raised labelled stat tile — serif value over a tracked micro label. */
export function MetricTile({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'danger' | 'sage';
}) {
  const valueColor =
    tone === 'danger'
      ? 'text-(--neu-danger-deep)'
      : tone === 'sage'
        ? 'text-(--neu-sage-deep)'
        : 'text-(--neu-text-primary)';
  return (
    <div
      className="flex flex-col gap-1 p-3.5 rounded-[22px] bg-(--neu-surface) border border-(--neu-edge)"
      style={{ boxShadow: 'var(--neu-shadow-raised)' }}
    >
      <span
        className="text-[10px] font-semibold text-(--neu-text-secondary)"
        style={{ letterSpacing: '0.12em' }}
      >
        {label.toUpperCase()}
      </span>
      <span
        className={`text-[22px] font-semibold leading-none ${valueColor}`}
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        <AnimatedNumber value={value} />
      </span>
      {sub && <span className="text-[11px] text-(--neu-text-tertiary)">{sub}</span>}
    </div>
  );
}

/** Raised list card — rows separated by the mobile hairline. */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col rounded-[22px] bg-(--neu-surface-high) border border-(--neu-edge) px-3.5"
      style={{ boxShadow: 'var(--neu-shadow-raised-sm)' }}
    >
      {children}
    </div>
  );
}

/** One row inside a ListCard — icon tile · title/sub · trailing value. */
export function ListRow({
  icon: Icon,
  iconToken,
  title,
  sub,
  right,
  divider = true,
  href,
}: {
  icon?: LucideIcon;
  iconToken?: string;
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  divider?: boolean;
  /** when set the row navigates (touch-quiet press, 44 floor kept) */
  href?: string;
}) {
  const body = (
    <>
      {Icon && (
        <span
          className="w-9 h-9 shrink-0 rounded-[13px] bg-(--neu-surface) flex items-center justify-center"
          style={{
            color: iconToken ?? 'var(--neu-text-secondary)',
            boxShadow: 'var(--neu-shadow-raised-sm)',
          }}
        >
          <Icon size={14} strokeWidth={1.7} />
        </span>
      )}
      <span className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-(--neu-text-primary) truncate">
          {title}
        </span>
        {sub && <span className="text-[11px] text-(--neu-text-secondary) truncate">{sub}</span>}
      </span>
      {right && <span className="shrink-0">{right}</span>}
    </>
  );

  const rowStyle = divider
    ? { borderBottom: '1px solid var(--neu-m-hairline)' }
    : undefined;

  if (href) {
    return (
      <Link
        href={href}
        className="neu-m-touch-quiet flex items-center gap-3 min-h-[56px] py-2.5"
        style={rowStyle}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 min-h-[56px] py-2.5" style={rowStyle}>
      {body}
    </div>
  );
}

/** Serif trailing count — the drawer-count treatment. */
export function RowCount({ value, token }: { value: string; token?: string }) {
  return (
    <span
      className="text-[15px] font-semibold"
      style={{ fontFamily: 'var(--font-serif)', color: token ?? 'var(--neu-text-primary)' }}
    >
      <AnimatedNumber value={value} />
    </span>
  );
}

/** Pane loading state — the spinning seed mandala (THE loading indicator;
    the same centered-LogoSpinner treatment as the WhatsApp pane). Rooms gate
    it on `!data`, so it only ever shows while a pane is genuinely loading. */
export function PaneLoader() {
  return (
    <div className="flex items-center justify-center py-10">
      <LogoSpinner size="md" />
    </div>
  );
}

/** Pane error state — serif italic line + quiet retry. */
export function PaneError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-10 px-4 text-center">
      <span
        className="text-[13.5px] text-(--neu-text-secondary)"
        style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
      >
        {message}
      </span>
      <button
        onClick={onRetry}
        className="neu-m-touch-quiet h-11 px-4 rounded-full text-[12px] font-medium text-(--neu-accent-deep)"
      >
        Try again
      </button>
    </div>
  );
}

/** A room with nothing to show: the shared compact empty state (ui/EmptyState),
 *  so the mobile rooms read like every other empty in Serene. */
export function RoomEmpty({ children }: { children: string }) {
  return <EmptyState title={children} style={{ padding: 'var(--space-5) var(--space-4)' }} />;
}

/** Mobile room page heading — serif 22, the ActivityScreen treatment. */
export function RoomTitle({ children }: { children: string }) {
  return (
    <h1
      className="text-[22px] font-semibold text-(--neu-text-primary) px-1 m-0"
      style={{ fontFamily: 'var(--font-serif)' }}
    >
      {children}
    </h1>
  );
}

/** Calm placeholder for rooms/roles arriving in a later phase. */
export function ComingSoonCard({ title, line }: { title: string; line: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 px-5 py-8 rounded-3xl bg-(--neu-surface-high) border border-(--neu-edge) text-center"
      style={{ boxShadow: 'var(--neu-shadow-raised-sm)' }}
    >
      <span
        className="text-[16px] font-semibold text-(--neu-text-primary)"
        style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
      >
        {title}
      </span>
      <span className="text-[11.5px] text-(--neu-text-tertiary)">{line}</span>
    </div>
  );
}
