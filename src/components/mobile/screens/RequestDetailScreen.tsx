'use client';

import { MobileButton } from '@/components/mobile/buttons';
import { useState } from 'react';
import { Calendar, Check, MessageCircle, Plane, Trash2 } from 'lucide-react';
import { DetailAppBar } from '../app-bars';
import { MobileActionSheet } from '../overlays';
import { DEMO_CONCIERGE, DEMO_THREAD } from '../demo-data';

/**
 * Request detail (§06) — the thread reads like correspondence.
 * Route card (dashed legs + plane), THE THREAD timeline (accent
 * check discs on a putty connector, breathing current dot,
 * butler-voice timestamps), concierge row, sticky primary CTA.
 * The ··· knob raises the action sheet (destructive in clay).
 */

const DASHED_LEG = {
  height: '1.5px',
  background:
    'repeating-linear-gradient(90deg, rgb(var(--neu-dark) / 0.5) 0 5px, transparent 5px 10px)',
} as const;

function RouteEndpoint({ code, sub, align }: { code: string; sub: string; align: 'start' | 'end' }) {
  return (
    <span className={`flex flex-col ${align === 'start' ? 'items-start' : 'items-end'}`}>
      <span
        className="text-[22px] font-semibold text-(--neu-text-primary)"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {code}
      </span>
      <span className="text-[11px] text-(--neu-text-secondary)">{sub}</span>
    </span>
  );
}

export function RequestDetailScreen({ reference }: { reference: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <main
        className="flex-1 flex flex-col gap-3.5 px-5 pb-[110px]"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
      >
        <DetailAppBar
          title={`REQUEST · ${reference.toUpperCase()}`}
          onMore={() => setSheetOpen(true)}
        />

        {/* Title + status */}
        <div className="flex flex-col gap-2 px-1">
          <h1
            className="text-[22px] font-semibold text-(--neu-text-primary) leading-tight m-0"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Gulfstream — Nice → Riyadh
          </h1>
          <div className="flex items-center gap-2">
            <span
              className="h-[26px] px-3 rounded-full border border-(--neu-edge) inline-flex items-center gap-1.5 text-[11px] font-semibold text-(--neu-sage-deep)"
              style={{
                background: 'color-mix(in srgb, var(--neu-sage) 25%, transparent)',
                boxShadow: 'var(--neu-shadow-chip)',
              }}
            >
              <Check size={10} strokeWidth={2.4} />
              Confirmed
            </span>
            <span className="text-[11px] text-(--neu-text-secondary)">
              Friday 10 July · 09:00 CET
            </span>
          </div>
        </div>

        {/* Route card */}
        <div
          className="flex flex-col gap-3 rounded-3xl bg-(--neu-surface) border border-(--neu-edge) px-4 py-[18px]"
          style={{ boxShadow: 'var(--neu-shadow-raised)' }}
        >
          <div className="flex items-center justify-between">
            <RouteEndpoint code="NCE" sub="Nice · 09:00" align="start" />
            <span className="flex-1 flex items-center gap-1.5 px-3.5">
              <span className="w-1.5 h-1.5 rounded-full bg-(--neu-accent)" />
              <span className="flex-1" style={DASHED_LEG} />
              <Plane size={14} strokeWidth={1.7} className="text-(--neu-accent-deep)" />
              <span className="flex-1" style={DASHED_LEG} />
              <span className="w-1.5 h-1.5 rounded-full bg-(--neu-accent)" />
            </span>
            <RouteEndpoint code="RUH" sub="Riyadh · 15:40" align="end" />
          </div>
          <div className="h-px bg-(--neu-m-hairline)" />
          <div className="flex items-center justify-between text-[11px] text-(--neu-text-secondary)">
            <span>G650 · quiet cabin</span>
            <span className="font-medium text-(--neu-text-primary)">
              4 guests · catering confirmed
            </span>
          </div>
        </div>

        {/* THE THREAD */}
        <div
          className="flex flex-col rounded-3xl bg-(--neu-surface) border border-(--neu-edge) p-4"
          style={{ boxShadow: 'var(--neu-shadow-raised)' }}
        >
          <span
            className="text-[11px] font-semibold text-(--neu-text-secondary) pb-3"
            style={{ letterSpacing: '0.14em' }}
          >
            THE THREAD
          </span>
          {DEMO_THREAD.map((step, i) => {
            const last = i === DEMO_THREAD.length - 1;
            return (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {step.state === 'done' ? (
                    <span
                      className="w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center"
                      style={{
                        background: 'var(--neu-accent-gradient)',
                        boxShadow: '2px 2px 4px rgb(var(--neu-dark) / 0.35)',
                      }}
                    >
                      <Check
                        size={10}
                        strokeWidth={2.6}
                        style={{ color: 'var(--neu-on-accent-soft)' }}
                      />
                    </span>
                  ) : (
                    <span
                      className="w-[22px] h-[22px] shrink-0 rounded-full bg-(--neu-well) flex items-center justify-center"
                      style={{ boxShadow: 'var(--neu-shadow-inset)' }}
                    >
                      <span className="neu-m-breathe-fast w-[7px] h-[7px] rounded-full bg-(--neu-accent)" />
                    </span>
                  )}
                  {!last && <span className="w-[1.5px] flex-1 bg-(--neu-m-putty-line)" />}
                </div>
                <div className={`flex flex-col gap-px ${last ? '' : 'pb-3.5'}`}>
                  <span
                    className={`text-xs font-semibold ${
                      step.state === 'current'
                        ? 'text-(--neu-accent-deep)'
                        : 'text-(--neu-text-primary)'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[11px] text-(--neu-text-tertiary)">{step.micro}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Concierge row */}
        <div
          className="flex items-center gap-3 rounded-[22px] bg-(--neu-surface-high) border border-(--neu-edge) px-3.5 py-3"
          style={{ boxShadow: 'var(--neu-shadow-raised-sm)' }}
        >
          <span
            className="w-[42px] h-[42px] shrink-0 rounded-full flex items-center justify-center text-xs font-semibold text-(--neu-accent-fg)"
            style={{
              background: 'var(--neu-accent-gradient)',
              boxShadow: 'var(--neu-shadow-raised-sm)',
            }}
          >
            {DEMO_CONCIERGE.initials}
          </span>
          <span className="flex flex-col gap-px flex-1">
            <span className="text-[13px] font-semibold text-(--neu-text-primary)">
              {DEMO_CONCIERGE.name}
            </span>
            <span className="text-[11px] text-(--neu-text-secondary)">{DEMO_CONCIERGE.role}</span>
          </span>
          <span
            className="w-10 h-10 shrink-0 rounded-full bg-(--neu-surface) border border-(--neu-edge) flex items-center justify-center text-(--neu-accent-deep)"
            style={{ boxShadow: 'var(--neu-shadow-raised-sm)' }}
          >
            <MessageCircle size={15} strokeWidth={1.7} />
          </span>
        </div>
      </main>

      {/* Sticky primary CTA */}
      <div
        className="fixed inset-x-0 z-40 px-5"
        style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-[390px]">
          <MobileButton
            variant="primary"
            className="neu-m-touch w-full h-[54px] rounded-full border border-(--neu-accent-btn-edge) text-sm font-semibold text-(--neu-accent-fg)"
          >
            Message Sara
          </MobileButton>
        </div>
      </div>

      <MobileActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="GULFSTREAM — NICE → RIYADH"
        items={[
          { label: 'Message Sara', icon: MessageCircle },
          { label: 'Adjust dates', icon: Calendar },
          { label: 'Withdraw request', icon: Trash2, destructive: true },
        ]}
      />
    </>
  );
}
