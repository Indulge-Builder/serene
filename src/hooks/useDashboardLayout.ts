'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  WIDGET_MAP,
  isValidWidgetId,
  DEFAULT_GRID_BY_ROLE,
  GRID_COLS,
  type GridPlacement,
} from '@/lib/constants/dashboard-widgets';
import type { UserRole } from '@/lib/types/database';

const STORAGE_KEY_PREFIX = 'serene:dashboard:layout';
// v5 — 2026-06-24 the Campaign Budget widget became the fuel gauge and grew from
// {w:3,h:5} to {w:6,h:8}; a stored v4 layout would keep the old cramped footprint
// (RGL restores the saved w/h, not the new minW), so the gauge would render
// squeezed. Bumping resets stale layouts to the corrected role default — the same
// honest reset v4 documented (a partial reconcile would leave the gauge cramped).
// v4 — 2026-06-24 spatial grid. Layout is now a 2-D {x,y,w,h} grid (grid units,
// 12-col) instead of an ordered flow list. v2 (size enum) and v3 (free heightPx,
// still 2-column flow) layouts cannot be mapped to arbitrary 2-D placement.
const STORAGE_VERSION = 'v5';

/** One widget's footprint on the grid (grid units). */
export type WidgetPlacement = GridPlacement;

type StoredLayout = {
  placements: WidgetPlacement[];
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${STORAGE_VERSION}`;
}

function getDefaults(role: UserRole): StoredLayout {
  // Clone so callers can never mutate the shared default array.
  const placements = (DEFAULT_GRID_BY_ROLE[role] ?? []).map((p) => ({ ...p }));
  return { placements };
}

// Validate a stored layout against the registry + the caller's role.
// Unrecognised / role-forbidden / malformed placements are silently dropped.
function sanitizeStored(raw: unknown, role: UserRole): StoredLayout {
  if (!raw || typeof raw !== 'object') return getDefaults(role);

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.placements)) return getDefaults(role);

  const seen = new Set<string>();
  const placements: WidgetPlacement[] = (obj.placements as unknown[])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter(
      (p) =>
        typeof p.widgetId === 'string' &&
        isValidWidgetId(p.widgetId) &&
        WIDGET_MAP[p.widgetId].roles.includes(role),
    )
    .map((p) => {
      const def = WIDGET_MAP[p.widgetId as string];
      const minW = def.defaultGrid.minW ?? 1;
      const minH = def.defaultGrid.minH ?? 1;
      // Coerce + clamp every geometry field defensively.
      const w = clampInt(p.w, minW, GRID_COLS, def.defaultGrid.w);
      const x = clampInt(p.x, 0, GRID_COLS - w, 0);
      const h = Math.max(minH, toInt(p.h, def.defaultGrid.h));
      const y = Math.max(0, toInt(p.y, 0));
      return { widgetId: p.widgetId as string, x, y, w, h };
    })
    // de-dupe by widgetId (a corrupted store could repeat one)
    .filter((p) => (seen.has(p.widgetId) ? false : (seen.add(p.widgetId), true)));

  // An empty result from a non-empty default role → fall back to defaults.
  if (placements.length === 0 && (DEFAULT_GRID_BY_ROLE[role] ?? []).length > 0) {
    return getDefaults(role);
  }
  return { placements };
}

function toInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
}
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = toInt(v, fallback);
  return Math.min(Math.max(n, min), Math.max(min, max));
}

function readFromStorage(userId: string, role: UserRole): StoredLayout {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return getDefaults(role);
    return sanitizeStored(JSON.parse(raw), role);
  } catch {
    return getDefaults(role);
  }
}

function writeToStorage(userId: string, layout: StoredLayout): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(layout));
  } catch {
    // localStorage may be unavailable in some environments — fail silently
  }
}

export type UseDashboardLayoutReturn = {
  layout: WidgetPlacement[];
  isHydrated: boolean;
  /** Commit a full new layout (react-grid-layout hands us every item on change). */
  applyLayout: (placements: WidgetPlacement[]) => void;
  addWidget: (widgetId: string) => void;
  removeWidget: (widgetId: string) => void;
  resetToDefaults: () => void;
};

export function useDashboardLayout(userId: string, role: UserRole): UseDashboardLayoutReturn {
  const [stored, setStored] = useState<StoredLayout>(() => getDefaults(role));
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage after mount — prevents SSR layout mismatch.
  // Only calls setStored when the persisted layout actually differs from the
  // default already initialised synchronously, keeping the widget subtree alive.
  useEffect(() => {
    const persisted = readFromStorage(userId, role);
    const persistedJson = JSON.stringify(persisted);
    setStored((current) =>
      persistedJson !== JSON.stringify(current) ? persisted : current,
    );
    setIsHydrated(true);
  }, [userId, role]);

  const persist = useCallback(
    (next: StoredLayout) => {
      setStored(next);
      writeToStorage(userId, next);
    },
    [userId],
  );

  // react-grid-layout emits the COMPLETE layout on every drag/resize. We keep
  // only the geometry fields and re-pair with the stored widgetIds (RGL items
  // carry their id as `i`). Items not currently in our set are ignored.
  const applyLayout = useCallback(
    (placements: WidgetPlacement[]) => {
      const valid = placements.filter(
        (p) => isValidWidgetId(p.widgetId) && WIDGET_MAP[p.widgetId].roles.includes(role),
      );
      // Only persist if something actually changed (RGL fires on mount too).
      const sameLength = valid.length === stored.placements.length;
      const unchanged =
        sameLength &&
        valid.every((p) => {
          const prev = stored.placements.find((q) => q.widgetId === p.widgetId);
          return prev && prev.x === p.x && prev.y === p.y && prev.w === p.w && prev.h === p.h;
        });
      if (unchanged) return;
      persist({ placements: valid });
    },
    [stored, persist, role],
  );

  const addWidget = useCallback(
    (widgetId: string) => {
      if (!isValidWidgetId(widgetId)) return;
      if (stored.placements.some((p) => p.widgetId === widgetId)) return;

      const def = WIDGET_MAP[widgetId];
      // Drop the new widget at the bottom-left; RGL compaction tucks it in.
      const maxY = stored.placements.reduce((m, p) => Math.max(m, p.y + p.h), 0);
      persist({
        placements: [
          ...stored.placements,
          { widgetId, x: 0, y: maxY, w: def.defaultGrid.w, h: def.defaultGrid.h },
        ],
      });
    },
    [stored, persist],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      persist({ placements: stored.placements.filter((p) => p.widgetId !== widgetId) });
    },
    [stored, persist],
  );

  const resetToDefaults = useCallback(() => {
    persist(getDefaults(role));
  }, [role, persist]);

  return {
    layout: stored.placements,
    isHydrated,
    applyLayout,
    addWidget,
    removeWidget,
    resetToDefaults,
  };
}
