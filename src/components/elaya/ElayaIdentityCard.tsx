'use client';

// Elaya identity card — the identity sidebar on /elaya. Lives in the right
// 340px column of the canonical .serene-dossier-grid--340 (the /profile sidebar
// pattern; stacks below the main column under lg). Display-only (A-06):
// presence, starter prompts picked for the viewer's role (prefill the composer only — never
// auto-send), and what she can read for them (lib/constants/elaya.ts).

import { Button } from '@/components/ui/Button';
import { m as motion } from 'framer-motion';
import {
  Users, ListChecks, Handshake, TrendingUp, BookOpen, MessageSquare, LifeBuoy, Ticket, Store,
  MessagesSquare, Megaphone, Activity, Landmark, CreditCard, Sparkles, type LucideIcon,
} from 'lucide-react';
import { ElayaGlyphDisc } from '@/components/ui/elaya-glyph';
import {
  getElayaStarters, getElayaCapabilities, ELAYA_CAPABILITY_LABELS, type ElayaViewer, type ElayaCapabilityKey,
} from '@/lib/constants/elaya';
import { ENTER_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

// One icon per capability key; the keys, labels and who-sees-what live in lib/constants/elaya.ts,
// in step with the tools in lib/elaya/tools/registry.ts.
const CAPABILITY_ICONS: Record<ElayaCapabilityKey, LucideIcon> = {
  members: Users, groups: MessagesSquare, freshdesk: LifeBuoy, tickets: Ticket, vendors: Store,
  leads: Users, lead_chats: MessageSquare, tasks: ListChecks, deals: Handshake, performance: TrendingUp,
  campaigns: Megaphone, activity: Activity, books: Landmark, subscriptions: CreditCard, cases: BookOpen,
  analyst: Sparkles,
};

type Props = {
  /** Streaming or cap reached — starter prompts disabled, never mid-flight. */
  busy: boolean;
  onPromptSelect: (prompt: string) => void;
  /** Who is looking; null = the generic lists. */
  viewer?: ElayaViewer | null;
};

export function ElayaIdentityCard({ busy, onPromptSelect, viewer = null }: Props) {
  const starters = getElayaStarters(viewer);
  const capabilities = getElayaCapabilities(viewer);
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
        // Scrolls down only; nothing in the card may push it sideways.
        overflowX: 'hidden',
      }}
    >
      {/* Presence — the glyph always breathes while she occupies this card */}
      <div className="flex flex-col items-center text-center" style={{ gap: 'var(--space-3)' }}>
        <ElayaGlyphDisc size={64} glyphSize={32} style={{ borderRadius: 'var(--radius-lg)' }} />
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
          Ask her
        </span>
        {starters.map((prompt) => (
          <Button
            variant="control"
            size="sm"
            key={prompt}
            type="button"
            disabled={busy}
            onClick={() => onPromptSelect(prompt)}
            className="serene-pressable w-full text-left border border-(--theme-paper-border) text-(--theme-text-secondary) hover:border-(--theme-accent-muted) hover:text-(--theme-text-primary) disabled:opacity-50 disabled:pointer-events-none"
            // A prompt is a sentence, not a label: it wraps inside the pill and the pill
            // grows to fit (Button defaults to one nowrap line at a fixed 32px).
            style={{
              height: 'auto',
              minHeight: '2rem',
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
              justifyContent: 'flex-start',
              textAlign: 'left',
              lineHeight: 'var(--leading-snug)',
              padding: 'var(--space-2) var(--space-3)',
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {prompt}
          </Button>
        ))}
      </div>

      {/* What she can see — pinned to the foot of the card */}
      <div className="flex flex-col" style={{ gap: 'var(--space-3)', marginTop: 'auto' }}>
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>
          She can read
        </span>
        {capabilities.map((key) => { const Icon = CAPABILITY_ICONS[key]; const label = ELAYA_CAPABILITY_LABELS[key]; return (
          <div key={key} className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <Icon
              className="w-4 h-4"
              strokeWidth={1.5}
              style={{ color: 'var(--theme-text-tertiary)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
              {label}
            </span>
          </div>
        ); })}
      </div>
    </motion.aside>
  );
}
