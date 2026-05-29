'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BASE_DURATION, EASE_SPRING } from '@/lib/constants/motion';

export interface AccordionItem {
  id: string;
  trigger: React.ReactNode;
  content: React.ReactNode;
}

export type AccordionType = 'single' | 'multiple';

export interface AccordionProps {
  items: AccordionItem[];
  type?: AccordionType;
  defaultOpen?: string[];
  className?: string;
  style?: React.CSSProperties;
}

export function Accordion({
  items,
  type = 'single',
  defaultOpen = [],
  className,
  style,
}: AccordionProps) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set(defaultOpen));

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (type === 'single') next.clear();
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div
      className={className}
      style={{
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        overflow:     'hidden',
        ...style,
      }}
    >
      {items.map((item, idx) => {
        const isOpen = openIds.has(item.id);
        const isLast = idx === items.length - 1;

        return (
          <div
            key={item.id}
            style={{
              borderBottom: isLast ? 'none' : '1px solid var(--theme-paper-border)',
            }}
          >
            {/* Trigger */}
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(item.id)}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                width:          '100%',
                padding:        'var(--space-4)',
                background:     isOpen ? 'var(--theme-paper-subtle)' : 'var(--theme-paper)',
                border:         'none',
                cursor:         'pointer',
                fontFamily:     'var(--font-sans)',
                fontSize:       'var(--text-sm)',
                fontWeight:     'var(--weight-medium)',
                color:          'var(--theme-text-primary)',
                textAlign:      'left',
                transition:     'background var(--duration-base) var(--ease-in-out)',
                outline:        'none',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-focus)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{item.trigger}</span>
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: BASE_DURATION, ease: EASE_SPRING }}
                style={{ display: 'flex', flexShrink: 0, marginLeft: 'var(--space-3)' }}
              >
                <ChevronDown
                  style={{ width: 16, height: 16, strokeWidth: 1.5, color: 'var(--theme-text-tertiary)' }}
                  aria-hidden="true"
                />
              </motion.span>
            </button>

            {/* Content */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key={`${item.id}-content`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: BASE_DURATION, ease: EASE_SPRING }}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    style={{
                      padding:    'var(--space-4)',
                      fontSize:   'var(--text-sm)',
                      color:      'var(--theme-text-primary)',
                      lineHeight: 'var(--leading-normal)',
                    }}
                  >
                    {item.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
