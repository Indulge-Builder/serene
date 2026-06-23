'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  resolveWidgetDensity,
  GRID_ROW_HEIGHT,
  type WidgetDensity,
} from '@/lib/constants/dashboard-widgets';

/**
 * Widget density — THE adaptive-content mechanism (v4 spatial dashboard,
 * 2026-06-24).
 *
 * Each widget cell is measured live (ResizeObserver) and resolved to one of
 * three tiers — compact / standard / rich — via `resolveWidgetDensity`. A widget
 * reads its tier with `useWidgetDensityTier()` and renders a layout to match:
 * a headline number when tiny, a sparkline when short, the full chart when
 * large. This is what makes a resized widget feel *designed* at every size
 * rather than a single layout scaled to fit.
 *
 * The slot owns the measurement (`useWidgetDensity` + `<WidgetDensityProvider>`);
 * widgets only consume the value, so a widget never wires its own observer.
 */

const WidgetDensityContext = createContext<WidgetDensity>('standard');

export const WidgetDensityProvider = WidgetDensityContext.Provider;

/** Read the current density tier for the surrounding widget cell. */
export function useWidgetDensityTier(): WidgetDensity {
  return useContext(WidgetDensityContext);
}

/**
 * Measure an element's box and resolve its density tier. Returns the tier and a
 * ref to attach to the measured node. rAF-throttled so a drag-resize (which
 * fires ResizeObserver every frame) re-resolves at most once per frame, and
 * setState only fires when the tier actually crosses a threshold — not on every
 * pixel — so widget content re-renders only at the 2 tier boundaries, never
 * continuously during a drag.
 */
export function useWidgetDensity<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [tier, setTier] = useState<WidgetDensity>('standard');
  // `measured` gates the widget render: a Recharts ResponsiveContainer measures
  // its parent SYNCHRONOUSLY on first render and reads -1 before any height has
  // resolved (react-grid-layout sets the item height via inline style AFTER
  // React commits). Withholding the widget until the slot has a real pixel box
  // means the chart's first measure is always against a resolved size — no -1.
  const [measured, setMeasured] = useState(false);
  const rafRef = useRef<number | null>(null);
  const tierRef = useRef<WidgetDensity>('standard');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      // No observer available (SSR/old browser) — render anyway, don't block.
      setMeasured(true);
      return;
    }

    const measure = () => {
      rafRef.current = null;
      const rect = node.getBoundingClientRect();
      // Only treat as measured once BOTH axes are real AND the height is at least
      // one grid row tall. RGL mounts the item collapsed (WidthProvider resolves
      // width first; the row height lands on a later commit), and during that gap
      // ResizeObserver can fire with a positive-but-tiny height — mounting the
      // chart there still reads a near-zero box and trips Recharts' -1 warning.
      // The one-row floor (GRID_ROW_HEIGHT) is below every widget's minH, so a
      // real cell always clears it while a transient collapsed box never does.
      if (rect.width > 0 && rect.height >= GRID_ROW_HEIGHT) {
        setMeasured(true);
        const next = resolveWidgetDensity(rect.width, rect.height);
        if (next !== tierRef.current) {
          tierRef.current = next;
          setTier(next);
        }
      }
    };

    const ro = new ResizeObserver(() => {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(measure);
    });
    ro.observe(node);
    // Initial measure (observer also fires once on observe, but be explicit).
    measure();

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { ref, tier, measured };
}
