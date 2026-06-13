'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  LEAD_COLUMNS,
  DEFAULT_COLUMN_ORDER,
  LEAD_COLUMN_MAP,
  isValidLeadColumnId,
  type LeadColumnId,
} from '@/lib/constants/lead-columns';

const STORAGE_KEY_PREFIX = 'serene:leads:columns';
const STORAGE_VERSION    = 'v1';

type StoredPreferences = {
  visibleColumns: LeadColumnId[];
  columnOrder: LeadColumnId[];
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${STORAGE_VERSION}`;
}

function getDefaults(): StoredPreferences {
  return {
    visibleColumns: LEAD_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id),
    columnOrder:    DEFAULT_COLUMN_ORDER,
  };
}

// Validate and sanitize stored data against the registry.
// Unrecognised column ids are silently dropped (security: user cannot inject columns).
function sanitizeStored(raw: unknown): StoredPreferences {
  const defaults = getDefaults();

  if (!raw || typeof raw !== 'object') return defaults;

  const obj = raw as Record<string, unknown>;

  const visibleColumns: LeadColumnId[] = Array.isArray(obj.visibleColumns)
    ? (obj.visibleColumns as unknown[])
        .filter((id): id is string => typeof id === 'string')
        .filter(isValidLeadColumnId)
    : defaults.visibleColumns;

  // Locked columns are always visible — enforce regardless of stored value
  const lockedIds = LEAD_COLUMNS.filter((c) => c.locked).map((c) => c.id);
  const mergedVisible = [
    ...lockedIds,
    ...visibleColumns.filter((id) => !LEAD_COLUMN_MAP[id].locked),
  ];
  const uniqueVisible = [...new Set(mergedVisible)] as LeadColumnId[];

  const columnOrder: LeadColumnId[] = Array.isArray(obj.columnOrder)
    ? (obj.columnOrder as unknown[])
        .filter((id): id is string => typeof id === 'string')
        .filter(isValidLeadColumnId)
    : defaults.columnOrder;

  // Ensure every known column appears in the order array (add missing ones at the end)
  const missingFromOrder = DEFAULT_COLUMN_ORDER.filter((id) => !columnOrder.includes(id));

  return {
    visibleColumns: uniqueVisible,
    columnOrder:    [...columnOrder, ...missingFromOrder] as LeadColumnId[],
  };
}

function readFromStorage(userId: string): StoredPreferences {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return getDefaults();
    return sanitizeStored(JSON.parse(raw));
  } catch {
    return getDefaults();
  }
}

function writeToStorage(userId: string, prefs: StoredPreferences): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable in some environments — fail silently
  }
}

export type UseLeadColumnPreferencesReturn = {
  visibleColumns: LeadColumnId[];
  columnOrder:    LeadColumnId[];
  toggleColumn:   (id: LeadColumnId) => void;
  reorderColumns: (newOrder: LeadColumnId[]) => void;
  resetToDefaults: () => void;
};

export function useLeadColumnPreferences(userId: string): UseLeadColumnPreferencesReturn {
  const [prefs, setPrefs] = useState<StoredPreferences>(getDefaults);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setPrefs(readFromStorage(userId));
  }, [userId]);

  const persist = useCallback(
    (next: StoredPreferences) => {
      setPrefs(next);
      writeToStorage(userId, next);
    },
    [userId],
  );

  const toggleColumn = useCallback(
    (id: LeadColumnId) => {
      const col = LEAD_COLUMN_MAP[id];
      if (col.locked) return; // locked columns cannot be toggled

      setPrefs((prev) => {
        const isVisible = prev.visibleColumns.includes(id);
        const next: StoredPreferences = {
          ...prev,
          visibleColumns: isVisible
            ? prev.visibleColumns.filter((v) => v !== id)
            : [...prev.visibleColumns, id],
        };
        writeToStorage(userId, next);
        return next;
      });
    },
    [userId],
  );

  const reorderColumns = useCallback(
    (newOrder: LeadColumnId[]) => {
      // Locked columns are always fixed at the front — strip and re-prepend
      const lockedIds  = LEAD_COLUMNS.filter((c) => c.locked).map((c) => c.id);
      const unlocked   = newOrder.filter((id) => !LEAD_COLUMN_MAP[id].locked);
      const finalOrder = [...lockedIds, ...unlocked] as LeadColumnId[];

      persist({ ...prefs, columnOrder: finalOrder });
    },
    [prefs, persist],
  );

  const resetToDefaults = useCallback(() => {
    persist(getDefaults());
  }, [persist]);

  return { visibleColumns: prefs.visibleColumns, columnOrder: prefs.columnOrder, toggleColumn, reorderColumns, resetToDefaults };
}
