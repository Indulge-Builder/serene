'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';

type ExportFormat = 'csv' | 'xlsx';

type ExportModalProps = {
  open:       boolean;
  onClose:    () => void;
  onExport:   (format: ExportFormat) => void;
  loading:    boolean;
};

export function ExportModal({ open, onClose, onExport, loading }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');

  const pillBase: React.CSSProperties = {
    padding:      'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-sm)',
    fontSize:     'var(--text-sm)',
    fontWeight:   'var(--weight-medium)',
    cursor:       'pointer',
    border:       '1px solid var(--theme-paper-border)',
    transition:   'background var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out), color var(--duration-fast) var(--ease-in-out)',
  };

  const pillActive: React.CSSProperties = {
    background:  'var(--theme-accent-surface)',
    borderColor: 'var(--theme-accent)',
    color:       'var(--theme-accent)',
  };

  const pillInactive: React.CSSProperties = {
    background: 'transparent',
    color:      'var(--theme-text-secondary)',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export Leads"
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onExport(format)}
            loading={loading}
          >
            Export
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color:    'var(--theme-text-secondary)',
            margin:   0,
          }}
        >
          Choose a format. All filtered leads will be exported.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            style={{ ...pillBase, ...(format === 'csv' ? pillActive : pillInactive) }}
            onClick={() => setFormat('csv')}
            type="button"
          >
            CSV
          </button>
          <button
            style={{ ...pillBase, ...(format === 'xlsx' ? pillActive : pillInactive) }}
            onClick={() => setFormat('xlsx')}
            type="button"
          >
            XLSX
          </button>
        </div>

        <p
          style={{
            fontSize: 'var(--text-xs)',
            color:    'var(--theme-text-tertiary)',
            margin:   0,
          }}
        >
          {format === 'xlsx'
            ? 'Three sheets: Leads, Activities, Notes.'
            : 'Leads sheet only. UTF-8 encoded.'}
        </p>
      </div>
    </Modal>
  );
}
