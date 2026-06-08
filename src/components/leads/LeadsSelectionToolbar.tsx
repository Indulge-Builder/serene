'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from '@/lib/toast';
import { exportLeadsAction } from '@/lib/actions/leads';
import { buildLeadsCSV, buildXLSXWorkbook, triggerBrowserDownload } from '@/lib/utils/export';
import { formatDate } from '@/lib/utils/dates';
import { EASE_OUT_EXPO } from '@/lib/constants/motion';

type LeadsSelectionToolbarProps = {
  selectedIds: string[];
  onClear:     () => void;
};

export function LeadsSelectionToolbar({ selectedIds, onClear }: LeadsSelectionToolbarProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport(format: 'csv' | 'xlsx') {
    if (loading) return;
    setLoading(true);

    const result = await exportLeadsAction({
      filters:     {},
      selectedIds,
    });

    setLoading(false);

    if (result.error || !result.data) {
      toast.danger(result.error ?? 'Export failed. Please try again.');
      return;
    }

    const { leads, activities, notes } = result.data;
    const dateStamp = formatDate(new Date(), 'dd-MMM-yyyy');

    try {
      if (format === 'csv') {
        const csv = buildLeadsCSV(leads);
        triggerBrowserDownload(
          `indulge-leads-${dateStamp}.csv`,
          csv,
          'text/csv;charset=utf-8;',
        );
      } else {
        const bytes = await buildXLSXWorkbook(leads, activities, notes);
        triggerBrowserDownload(
          `indulge-leads-${dateStamp}.xlsx`,
          bytes,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      }
      onClear();
      toast.success(`${leads.length} lead${leads.length !== 1 ? 's' : ''} exported.`);
    } catch {
      toast.danger('Failed to build export file. Please try again.');
    }
  }

  const actionBtn: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    height:       '1.75rem',
    padding:      '0 var(--space-3)',
    border:       '1px solid var(--theme-paper-border)',
    borderRadius: 'var(--radius-sm)',
    background:   'transparent',
    color:        'var(--theme-text-primary)',
    fontSize:     'var(--text-xs)',
    fontWeight:   'var(--weight-medium)',
    cursor:       loading ? 'wait' : 'pointer',
    opacity:      loading ? 0.6 : 1,
    transition:   'background var(--duration-fast) var(--ease-in-out)',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-3)',
        padding:      'var(--space-2) var(--space-4)',
        marginBottom: 'var(--space-2)',
        borderRadius: 'var(--radius-sm)',
        background:   'var(--theme-accent-surface)',
        border:       '1px solid var(--theme-paper-border)',
      }}
    >
      <span
        style={{
          fontSize:   'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color:      'var(--theme-text-primary)',
        }}
      >
        {selectedIds.length} lead{selectedIds.length !== 1 ? 's' : ''} selected
      </span>

      <span
        style={{
          width:      1,
          height:     '1.25rem',
          background: 'var(--theme-paper-border)',
          flexShrink: 0,
        }}
      />

      <button
        style={actionBtn}
        onClick={() => handleExport('csv')}
        disabled={loading}
        type="button"
      >
        Export CSV
      </button>

      <button
        style={actionBtn}
        onClick={() => handleExport('xlsx')}
        disabled={loading}
        type="button"
      >
        Export XLSX
      </button>

      <button
        onClick={onClear}
        disabled={loading}
        type="button"
        style={{
          marginLeft: 'auto',
          background: 'none',
          border:     'none',
          fontSize:   'var(--text-xs)',
          color:      'var(--theme-text-tertiary)',
          cursor:     'pointer',
          padding:    0,
        }}
      >
        Clear
      </button>
    </motion.div>
  );
}
