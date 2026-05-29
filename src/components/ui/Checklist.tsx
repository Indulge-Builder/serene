'use client';

import React from 'react';
import { ProgressBar } from './ProgressBar';
import { ChecklistItem } from './ChecklistItem';

export interface ChecklistEntry {
  id: string;
  label: string;
  checked: boolean;
  secondaryText?: string;
}

export interface ChecklistProps {
  items: ChecklistEntry[];
  onToggle: (id: string) => void;
  showProgress?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Checklist({
  items,
  onToggle,
  showProgress = true,
  disabled = false,
  className,
  style,
}: ChecklistProps) {
  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', ...style }}>
      {showProgress && total > 0 && (
        <div style={{ paddingBottom: 'var(--space-2)' }}>
          <ProgressBar
            value={pct}
            label={`${done} / ${total} complete`}
            showLabel
          />
        </div>
      )}

      <div role="list">
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <ChecklistItem
              id={item.id}
              label={item.label}
              checked={item.checked}
              onToggle={onToggle}
              secondaryText={item.secondaryText}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
