'use client';

// RevealId — THE hidden-identifier affordance. An id from another system (a Freshdesk
// contact, a Zoho customer, an app member) is noise on a card; the person wants the
// link, not the number. This renders a small icon: hovering shows the id in a tooltip,
// clicking shows it inline in mono with a copy button, clicking again hides it.
// Display-only (A-06). Tooltip is the charcoal pill; copy mirrors InfoRow's.

import { useState } from 'react';
import { Check, Copy, Hash } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { Tooltip } from '@/components/ui/Tooltip';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

const ICON: React.CSSProperties = { width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 };
const BUTTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
  background: 'transparent', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
  color: 'var(--theme-text-tertiary)', padding: 0, transition: 'color var(--transition-hover)',
};

export function RevealId({ value, label }: { value: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied: the id is visible on screen, nothing else to do.
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', verticalAlign: 'middle' }}>
      <Tooltip label={open ? `Hide ${label}` : `${label}: ${value}`} side="top">
        <motion.button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={open}
          whileTap={{ scale: 0.85 }}
          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
          style={{ ...BUTTON, color: open ? 'var(--neu-accent-deep)' : 'var(--theme-text-tertiary)' }}
        >
          <Hash style={ICON} />
        </motion.button>
      </Tooltip>
      {open && (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </span>
          <motion.button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Copied' : `Copy ${label}`}
            whileTap={{ scale: 0.85 }}
            transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
            style={{ ...BUTTON, color: copied ? 'var(--color-success-text)' : 'var(--theme-text-tertiary)' }}
          >
            {copied ? <Check style={ICON} /> : <Copy style={ICON} />}
          </motion.button>
        </>
      )}
    </span>
  );
}
