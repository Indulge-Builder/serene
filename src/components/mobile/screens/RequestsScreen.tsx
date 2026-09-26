'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { MobileSegmented, FilterChip } from '../controls';
import { RequestRow, PlacingLoader, ToastPill } from '../content';
import { Fab } from '../buttons';
import { NewRequestSheet } from '../overlays';
import { DEMO_REQUESTS, DEMO_VERTICALS, type DemoVerticalKey } from '../demo-data';

/**
 * Requests — the everyday room. Segmented All / In motion /
 * Attended to, vertical filter chips, request rows with the
 * status-dot language. The FAB raises the NEW REQUEST sheet;
 * placing shows the ✦ loader, then a Confirmed toast floats
 * above the tab bar.
 */

const SEGMENTS = ['All', 'In motion', 'Attended to'];

export function RequestsScreen() {
  const [segment, setSegment] = useState(0);
  const [chips, setChips] = useState<DemoVerticalKey[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!placing) return;
    const t = setTimeout(() => {
      setPlacing(false);
      setToast(true);
    }, 2200);
    return () => clearTimeout(t);
  }, [placing]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const rows = DEMO_REQUESTS.filter((r) => {
    if (segment === 1 && r.status === 'settled') return false;
    if (segment === 2 && r.status !== 'settled') return false;
    if (chips.length > 0 && !chips.includes(r.vertical)) return false;
    return true;
  });

  return (
    <>
      <h1
        className="text-[22px] font-semibold text-(--neu-text-primary) px-1 m-0"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        Requests
      </h1>

      <MobileSegmented options={SEGMENTS} value={segment} onChange={setSegment} />

      <div className="flex gap-2 overflow-x-auto">
        {DEMO_VERTICALS.map((v) => (
          <FilterChip
            key={v.key}
            label={v.label}
            selected={chips.includes(v.key)}
            onToggle={() =>
              setChips((prev) =>
                prev.includes(v.key)
                  ? prev.filter((k) => k !== v.key)
                  : [...prev, v.key],
              )
            }
          />
        ))}
      </div>

      {placing ? (
        <PlacingLoader />
      ) : rows.length > 0 ? (
        rows.map((r) => <RequestRow key={r.ref} request={r} />)
      ) : (
        <EmptyState
          variant="inline"
          title="Nothing here — the house is quiet."
        />
      )}

      {/* FAB floats above the tab bar, right edge */}
      <div
        className="fixed right-5 z-40"
        style={{ bottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 80px)' }}
      >
        <Fab aria-label="New request" onClick={() => setSheetOpen(true)}>
          <Plus size={20} strokeWidth={1.8} />
        </Fab>
      </div>

      {/* Toast floats above the FAB (56px knob + 12px gap), full width */}
      {toast && (
        <div
          className="fixed inset-x-0 z-40 px-5"
          style={{ bottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 148px)' }}
        >
          <div className="mx-auto max-w-[390px]">
            <ToastPill
              tone="confirm"
              title="Confirmed"
              sub="Sara is attending to it"
              actionLabel="View"
              onAction={() => setToast(false)}
            />
          </div>
        </div>
      )}

      <NewRequestSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPlace={() => {
          setSheetOpen(false);
          setPlacing(true);
        }}
      />
    </>
  );
}
