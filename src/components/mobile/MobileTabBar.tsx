'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { getMobileRooms } from '@/lib/constants/mobile-rooms';
import { useMobileSession } from './MobileSessionProvider';
import { hasElayaAccess } from '@/lib/utils/route-access';

/**
 * The bottom tab bar (design_handoff_mobile_system §Navigation).
 * EXACTLY four rooms — resolved per role from the mobile-rooms
 * registry (mobile-ops.md §4; the registry's tuple type makes a fifth
 * tab a compile error) — never more. Floating raised pill, height 64,
 * floating 16px off the bottom safe area. Active route rides a raised
 * 46×46 r16 accent-gradient tile with ink fg; inactive tabs are quiet
 * glyphs.
 *
 * Elaya holds the center: a 52Ø accent knob riding above the bar
 * (−20). She is navigation, not a tab — no active state, ever.
 */

function TabCell({ href, label, icon: Icon, active, onPick }: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPick: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="neu-m-touch-quiet shrink-0"
      onClick={() => onPick(href)}
    >
      {active ? (
        <span
          className="w-[46px] h-[46px] rounded-2xl flex items-center justify-center text-(--neu-accent-fg)"
          style={{
            background: 'var(--neu-accent-gradient)',
            boxShadow:
              '3px 3px 8px rgb(var(--neu-dark) / 0.35), -2px -2px 6px rgb(var(--neu-light) / 0.7)',
          }}
        >
          <Icon size={17} strokeWidth={1.8} />
        </span>
      ) : (
        <span className="w-[46px] h-[46px] rounded-2xl flex items-center justify-center text-(--neu-text-secondary)">
          <Icon size={17} strokeWidth={1.7} />
        </span>
      )}
    </Link>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { role, domain } = useMobileSession();
  const elayaOn = hasElayaAccess({ role, domain });
  const TABS = getMobileRooms(role);
  // The tile moves on the TAP (2026-09-25), not when the server answers: a
  // room waits on its data, and until this the bar looked dead for that wait.
  // The pending pick clears the moment the route lands.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [pathname]);
  const isActive = (href: string) =>
    pending !== null
      ? pending === href
      : href === '/m' ? pathname === '/m' : pathname.startsWith(href);

  return (
    <nav
      aria-label="Rooms"
      className="fixed inset-x-0 z-40 px-5"
      style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      <div
        className="mx-auto max-w-[390px] h-16 px-2 rounded-full bg-(--neu-surface) border border-(--neu-edge-strong) flex items-center justify-around"
        style={{ boxShadow: 'var(--neu-shadow-raised-lg)' }}
      >
        {TABS.slice(0, 2).map((t) => (
          <TabCell key={t.key} href={t.href} label={t.label} icon={t.icon} active={isActive(t.href)} onPick={setPending} />
        ))}
        {elayaOn && <Link
          href="/m/elaya"
          aria-label="Elaya"
          className="neu-m-touch-knob shrink-0 -mt-5 w-[52px] h-[52px] rounded-full border border-(--neu-accent-btn-edge) flex items-center justify-center text-[17px] text-(--neu-accent-fg)"
          style={{
            background: 'var(--neu-accent-gradient)',
            boxShadow:
              '4px 4px 10px rgb(var(--neu-dark) / 0.35), -3px -3px 8px rgb(var(--neu-light) / 0.75)',
          }}
        >
          ✦
        </Link>}
        {TABS.slice(2).map((t) => (
          <TabCell key={t.key} href={t.href} label={t.label} icon={t.icon} active={isActive(t.href)} onPick={setPending} />
        ))}
      </div>
    </nav>
  );
}
