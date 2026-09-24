'use client';

// RevealId — THE hidden-identifier affordance. An id from another system (a Freshdesk
// contact, a Zoho customer, an app member) is noise on a card; the person wants the
// link, not the number. This renders a small icon: hovering shows the id in a tooltip,
// clicking shows it inline in mono with a copy button, clicking again hides it.
// Display-only (A-06). Tooltip is the charcoal pill; copy mirrors InfoRow's.

import { MotionButton } from '@/components/ui/MotionButton';
import { useState } from 'react';
import { Check, Copy, Hash } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { FAST_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

const ICON: React.CSSProperties = { width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 };


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
        <MotionButton
          variant="ghost" size="sm" iconOnly
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={open}
          whileTap={{ scale: 0.85 }}
          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
        >
          <Hash style={ICON} />
        </MotionButton>
      </Tooltip>
      {open && (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </span>
          <MotionButton
          variant={copied ? "success" : "ghost"} size="sm" iconOnly
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy ${label}`}
          whileTap={{ scale: 0.85 }}
          transition={{ duration: FAST_DURATION, ease: EASE_OUT_EXPO }}
        >
            {copied ? <Check style={ICON} /> : <Copy style={ICON} />}
          </MotionButton>
        </>
      )}
    </span>
  );
}
