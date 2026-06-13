'use client';

// Elaya identity card — the identity sidebar on /elaya. Lives in the right
// 340px column of the canonical .serene-dossier-grid--340 (the /profile sidebar
// pattern; stacks below the main column under lg). Display-only (A-06):
// presence, curated starter prompts (prefill the composer only — never
// auto-send), and what she can see.

import { m as motion } from 'framer-motion';
import { Users, ListChecks, Handshake, TrendingUp, BookOpen } from 'lucide-react';
import { ElayaGlyph } from '@/components/ui/elaya-glyph';
import { ELAYA_STARTER_PROMPTS } from '@/lib/constants/elaya';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

// One row per read-only tool family in src/lib/elaya/tools/registry.ts —
// keep in step when a tool ships or retires.
const CAPABILITIES = [
  { icon: Users, label: 'Your leads' },
  { icon: ListChecks, label: 'Your tasks' },
  { icon: Handshake, label: 'Deals' },
  { icon: TrendingUp, label: 'Performance' },
  { icon: BookOpen, label: 'Case library' },
] as const;

type Props = {
  /** Streaming or cap reached — starter prompts disabled, never mid-flight. */
  busy: boolean;
  onPromptSelect: (prompt: string) => void;
};

export function ElayaIdentityCard({ busy, onPromptSelect }: Props) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ENTER_DURATION, ease: EASE_OUT_EXPO }}
      className="flex flex-col rounded-lg border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
      style={{
        minHeight: 0,
        padding: 'var(--space-6)',
        gap: 'var(--space-5)',
        overflowY: 'auto',
      }}
    >
      {/* Presence — the glyph always breathes while she occupies this card */}
      <div className="flex flex-col items-center text-center" style={{ gap: 'var(--space-3)' }}>
        <span
          className="flex items-center justify-center"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--theme-accent-surface)',
            color: 'var(--theme-accent)',
            flexShrink: 0,
          }}
        >
          <ElayaGlyph size={32} />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-normal)',
            color: 'var(--theme-text-primary)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          Elaya
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--theme-paper-border)' }} />

      {/* Starter prompts — prefill only, the send stays with the user */}
      <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
          Start somewhere
        </span>
        {ELAYA_STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={busy}
            onClick={() => onPromptSelect(prompt)}
            className="serene-pressable w-full text-left border border-(--theme-paper-border) text-(--theme-text-secondary) hover:border-(--theme-accent-muted) hover:text-(--theme-text-primary) disabled:opacity-50 disabled:pointer-events-none"
            style={{
              background: 'transparent',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-xs)',
              lineHeight: 'var(--leading-normal)',
              cursor: 'pointer',
              transition: 'var(--transition-hover)',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* What she can see — pinned to the foot of the card */}
      <div className="flex flex-col" style={{ gap: 'var(--space-3)', marginTop: 'auto' }}>
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
          She can see
        </span>
        {CAPABILITIES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <Icon
              className="w-4 h-4"
              strokeWidth={1.5}
              style={{ color: 'var(--theme-text-tertiary)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </motion.aside>
  );
}
