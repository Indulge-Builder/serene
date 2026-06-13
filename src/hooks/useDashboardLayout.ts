'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  WIDGET_MAP,
  isValidWidgetId,
  DEFAULT_LAYOUT_BY_ROLE,
  type WidgetSize,
  type WidgetColSpan,
} from '@/lib/constants/dashboard-widgets';
import type { UserRole } from '@/lib/types/database';

const STORAGE_KEY_PREFIX = 'serene:dashboard:layout';
// v2 — 2026-06-12 agent dashboard redesign (new grid: snapshot counts, Elaya,
// budget). Versioning the key orphans stale v1 layouts instead of letting
// them fight the new default grid.
const STORAGE_VERSION    = 'v2';

export type WidgetPlacement = {
  widgetId: string;
  col:      number;
  row:      number;
  size:     WidgetSize;
  colSpan:  WidgetColSpan;
};

type StoredLayout = {
  placements: WidgetPlacement[];
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${STORAGE_VERSION}`;
}

function getDefaults(role: UserRole): StoredLayout {
  const widgetIds = DEFAULT_LAYOUT_BY_ROLE[role] ?? [];
  const placements: WidgetPlacement[] = widgetIds.map((id, i) => ({
    widgetId: id,
    col:      i % 2,
    row:      Math.floor(i / 2),
    size:     WIDGET_MAP[id]?.defaultSize ?? 'md',
    colSpan:  WIDGET_MAP[id]?.colSpan ?? 1,
  }));
  return { placements };
}

// Validate stored layout against the registry.
// Unrecognised widget ids are silently dropped.
function sanitizeStored(raw: unknown, role: UserRole): StoredLayout {
  const defaults = getDefaults(role);

  if (!raw || typeof raw !== 'object') return defaults;

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.placements)) return defaults;

  const validSizes: WidgetSize[] = ['sm', 'md', 'lg', 'xl'];

  const validColSpans: WidgetColSpan[] = [1, 2];

  const placements: WidgetPlacement[] = (obj.placements as unknown[])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) =>
      typeof p.widgetId === 'string' &&
      isValidWidgetId(p.widgetId) &&
      WIDGET_MAP[p.widgetId].roles.includes(role),
    )
    .map((p) => ({
      widgetId: p.widgetId as string,
      col:      typeof p.col === 'number' ? p.col : 0,
      row:      typeof p.row === 'number' ? p.row : 0,
      size:     validSizes.includes(p.size as WidgetSize) ? (p.size as WidgetSize) : 'md',
      // colSpan: fall back to the widget definition default for older stored layouts
      colSpan:  validColSpans.includes(p.colSpan as WidgetColSpan)
        ? (p.colSpan as WidgetColSpan)
        : (WIDGET_MAP[p.widgetId as string]?.colSpan ?? 1),
    }));

  return { placements };
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
  layout:           WidgetPlacement[];
  isHydrated:       boolean;
  addWidget:        (widgetId: string) => void;
  removeWidget:     (widgetId: string) => void;
  moveWidget:       (widgetId: string, col: number, row: number) => void;
  resizeWidget:     (widgetId: string, size: WidgetSize) => void;
  resizePlacement:  (widgetId: string, size: WidgetSize, colSpan: WidgetColSpan) => void;
  reorderWidgets:   (newOrder: string[]) => void;
  resetToDefaults:  () => void;
};

export function useDashboardLayout(userId: string, role: UserRole): UseDashboardLayoutReturn {
  const [stored, setStored]         = useState<StoredLayout>(() => getDefaults(role));
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage after mount — prevents SSR layout mismatch.
  // Only calls setStored when the persisted layout actually differs from the
  // default that was already initialised synchronously. This keeps the widget
  // subtree alive (no unmount/remount) when the stored layout matches defaults.
  useEffect(() => {
    const persisted = readFromStorage(userId, role);
    const persistedJson = JSON.stringify(persisted);
    setStored((current) => {
      const currentJson = JSON.stringify(current);
      return persistedJson !== currentJson ? persisted : current;
    });
    setIsHydrated(true);
  }, [userId, role]);

  const persist = useCallback(
    (next: StoredLayout) => {
      setStored(next);
      writeToStorage(userId, next);
    },
    [userId],
  );

  const addWidget = useCallback(
    (widgetId: string) => {
      if (!isValidWidgetId(widgetId)) return;
      if (stored.placements.some((p) => p.widgetId === widgetId)) return;

      const maxRow = stored.placements.reduce((m, p) => Math.max(m, p.row), -1);
      const widget = WIDGET_MAP[widgetId];

      persist({
        placements: [
          ...stored.placements,
          { widgetId, col: 0, row: maxRow + 1, size: widget?.defaultSize ?? 'md', colSpan: widget?.colSpan ?? 1 },
        ],
      });
    },
    [stored, persist],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      persist({
        placements: stored.placements.filter((p) => p.widgetId !== widgetId),
      });
    },
    [stored, persist],
  );

  const moveWidget = useCallback(
    (widgetId: string, col: number, row: number) => {
      persist({
        placements: stored.placements.map((p) =>
          p.widgetId === widgetId ? { ...p, col, row } : p,
        ),
      });
    },
    [stored, persist],
  );

  const resizeWidget = useCallback(
    (widgetId: string, size: WidgetSize) => {
      persist({
        placements: stored.placements.map((p) =>
          p.widgetId === widgetId ? { ...p, size } : p,
        ),
      });
    },
    [stored, persist],
  );

  const resizePlacement = useCallback(
    (widgetId: string, size: WidgetSize, colSpan: WidgetColSpan) => {
      persist({
        placements: stored.placements.map((p) =>
          p.widgetId === widgetId ? { ...p, size, colSpan } : p,
        ),
      });
    },
    [stored, persist],
  );

  const reorderWidgets = useCallback(
    (newOrder: string[]) => {
      const ordered = newOrder
        .filter((id) => isValidWidgetId(id))
        .map((id, i) => {
          const existing = stored.placements.find((p) => p.widgetId === id);
          return {
            widgetId: id,
            col:      i % 2,
            row:      Math.floor(i / 2),
            size:     existing?.size    ?? WIDGET_MAP[id]?.defaultSize ?? 'md',
            colSpan:  existing?.colSpan ?? WIDGET_MAP[id]?.colSpan    ?? 1,
          };
        });
      persist({ placements: ordered });
    },
    [stored, persist],
  );

  const resetToDefaults = useCallback(() => {
    persist(getDefaults(role));
  }, [role, persist]);

  return {
    layout:           stored.placements,
    isHydrated,
    addWidget,
    removeWidget,
    moveWidget,
    resizeWidget,
    resizePlacement,
    reorderWidgets,
    resetToDefaults,
  };
}
