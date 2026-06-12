'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { exportLeadsAction } from '@/lib/actions/leads';
import { buildLeadsCSV, buildXLSXWorkbook, triggerBrowserDownload } from '@/lib/utils/export';
import { formatDate } from '@/lib/utils/dates';
import { ExportModal } from '@/components/leads/ExportModal';
import type { LeadFilters } from '@/lib/types/database';

type ExportButtonProps = {
  filters: LeadFilters;
};

export function ExportButton({ filters }: ExportButtonProps) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleExport(format: 'csv' | 'xlsx') {
    setLoading(true);

    const result = await exportLeadsAction({
      filters: {
        status:            filters.status ?? undefined,
        last_call_outcome: filters.last_call_outcome ?? undefined,
        domain:            filters.domain ?? undefined,
        agent_id:          filters.agent_id ?? undefined,
        source:            filters.source ?? undefined,
        campaign:          filters.campaign ?? undefined,
        date_from:         filters.date_from ?? undefined,
        date_to:           filters.date_to ?? undefined,
        search:            filters.search ?? undefined,
        sort_order:        filters.sort_order ?? undefined,
      },
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
      setOpen(false);
      toast.success(`${leads.length} lead${leads.length !== 1 ? 's' : ''} exported.`);
    } catch {
      toast.danger('Failed to build export file. Please try again.');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="eia-pressable eia-icon-drop-hover"
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          'var(--space-1)',
          height:       '2.25rem',
          padding:      '0 var(--space-3)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-sm)',
          background:   'transparent',
          color:        'var(--theme-text-secondary)',
          fontSize:     'var(--text-sm)',
          cursor:       'pointer',
          flexShrink:   0,
          transition:   'background var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out), transform var(--duration-instant) var(--ease-spring)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-paper-subtle)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-text-secondary)';
        }}
        aria-label="Export leads"
        type="button"
      >
        <Download style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        <span className="max-md:hidden">Export</span>
      </button>

      <AnimatePresence>
        {open && (
          <ExportModal
            open={open}
            onClose={() => setOpen(false)}
            onExport={handleExport}
            loading={loading}
          />
        )}
      </AnimatePresence>
    </>
  );
}
