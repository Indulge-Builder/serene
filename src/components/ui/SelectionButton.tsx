'use client';

import React from 'react';
import { choiceStyle, optionStyle } from './material-styles';

export interface SelectionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  appearance?: 'choice' | 'option' | 'row';
  selected?: boolean;
  /** Semantic choices supply a matched fill and ink; never use a pastel as text. */
  tone?: { fill: string; ink: string };
}

/** Shared material for choices and rich rows. Consumers own selection semantics,
 * keyboard navigation, content, and layout; this component does not invent roles. */
export const SelectionButton = React.forwardRef<HTMLButtonElement, SelectionButtonProps>(
  function SelectionButton({ appearance = 'option', selected = false, tone, type = 'button', className, style, onKeyDown, ...props }, ref) {
    const material = appearance === 'choice' ? choiceStyle(selected, tone) : optionStyle(selected);
    return (
      <button
        {...props}
        ref={ref}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || props.role !== 'radio' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          const group = event.currentTarget.closest('[role="radiogroup"]');
          if (!group) return;
          const radios = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'));
          const index = radios.indexOf(event.currentTarget);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + radios.length) % radios.length;
          event.preventDefault();
          radios[next]?.focus();
          radios[next]?.click();
        }}
        type={type}
        className={['serene-selection', className].filter(Boolean).join(' ')}
        data-appearance={appearance}
        data-selected={selected ? 'true' : 'false'}
        style={{
          '--selection-fill': material.background,
          '--selection-ink': material.color,
          '--selection-shadow': material.boxShadow,
          ...style,
        } as React.CSSProperties}
      />
    );
  },
);
