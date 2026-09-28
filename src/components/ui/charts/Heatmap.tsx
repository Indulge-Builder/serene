'use client';

import React from 'react';

/**
 * Heatmap — THE rows × columns intensity grid (the Jokers' "Best time to send" and "When clients
 * are talking": weekday × hour). One accent hue, darker = more; an empty cell sits on the paper's
 * sunken tone. A cell with a value is a real button when `onCellClick` is given (keyboard + screen
 * reader: its title is its label). Display-only otherwise. Never more than one colour.
 */
export interface HeatmapProps {
  /** Row labels, top to bottom (e.g. Mon … Sun). */
  rows: string[];
  /** Column labels, left to right (e.g. 8 am … 11 pm). */
  cols: string[];
  /** values[row][col]; 0 = empty. */
  values: number[][];
  /** Intensity of a cell, 0..1 (default: value / the largest value). */
  intensity?: (value: number, row: number, col: number) => number;
  /** The words a cell carries (tooltip + accessible name). */
  cellLabel: (row: number, col: number, value: number) => string;
  onCellClick?: (row: number, col: number) => void;
  /** Print every n-th column label (the grid stays readable at 24 columns). */
  colLabelEvery?: number;
  /** Accessible name of the whole grid. */
  ariaLabel: string;
  /** Minimum width before the grid scrolls sideways inside its own container. */
  minWidth?: number;
  /** The height of one cell (a CSS length); 1.5rem by default. */
  cellHeight?: string;
}

export function Heatmap({
  rows,
  cols,
  values,
  intensity,
  cellLabel,
  onCellClick,
  colLabelEvery = 1,
  ariaLabel,
  minWidth = 480,
  cellHeight = '1.5rem',
}: HeatmapProps) {
  const max = Math.max(1, ...values.flat());
  const level = intensity ?? ((v: number) => v / max);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        role="group"
        aria-label={ariaLabel}
        style={{
          display:             'grid',
          gridTemplateColumns: `2.5rem repeat(${cols.length}, minmax(0, 1fr))`,
          gap:                 'var(--space-1)',
          alignItems:          'center',
          minWidth,
        }}
      >
        <span />
        {cols.map((c, ci) => (
          <span
            key={`h-${c}`}
            aria-hidden="true"
            style={{
              // A label wider than its column hangs over its neighbours (hidden ones) instead
              // of widening the grid: zero width, centred on the column.
              fontSize:       'var(--text-2xs)',
              color:          'var(--theme-text-tertiary)',
              whiteSpace:     'nowrap',
              width:          0,
              justifySelf:    'center',
              display:        'flex',
              justifyContent: 'center',
            }}
          >
            {/* Only every n-th label is printed; an unprinted one takes no room (a hidden label
                still hangs past the edge and scrolls the grid). */}
            {ci % colLabelEvery === 0 ? c : ''}
          </span>
        ))}
        {rows.map((r, ri) => (
          <React.Fragment key={`r-${r}`}>
            <span aria-hidden="true" style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{r}</span>
            {cols.map((c, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              const label = cellLabel(ri, ci, v);
              const pct = Math.round(10 + Math.min(1, Math.max(0, level(v, ri, ci))) * 84);
              const style: React.CSSProperties = {
                height:       cellHeight,
                minWidth:     0,
                borderRadius: 'var(--radius-xs)',
                border:       0,
                padding:      0,
                background:   v ? `color-mix(in srgb, var(--theme-accent) ${pct}%, var(--theme-paper))` : 'var(--theme-paper-subtle)',
              };
              return v && onCellClick ? (
                <button
                  key={`c-${r}-${c}`}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => onCellClick(ri, ci)}
                  className="serene-heatmap-cell"
                  style={{ ...style, cursor: 'pointer' }}
                />
              ) : (
                <span key={`c-${r}-${c}`} title={label} aria-label={v ? label : undefined} role={v ? 'img' : undefined} style={style} />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/** The legend strip for a Heatmap: "Label  [fewer → more]". */
export function HeatmapScale({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>
      {label}
      <span
        aria-hidden="true"
        style={{
          width:        80,
          height:       8,
          borderRadius: 'var(--radius-full)',
          background:   'linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 10%, var(--theme-paper)), var(--theme-accent))',
        }}
      />
      fewer → more
    </span>
  );
}
