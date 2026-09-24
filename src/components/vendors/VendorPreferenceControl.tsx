'use client';

// VendorPreferenceControl — the sticky note (migration 0191).
//
// "Anisha is comfortable with this vendor." Two chips — Preferred / Avoid —
// set the CURRENT user's stance; a one-line note says why; the rest of the
// team's takes sit underneath. One mark feeds three things at once: the
// sentiment component of the score (every mark), the ranker's agent layer
// (the marker's own avoid removes the vendor from THEIR answers, their
// preferred lifts it), and Elaya's find_vendors for that person.
//
// Optimistic with revert — the chip flips immediately and flips back on error,
// the error going to the app toast — because a stance that silently failed to
// save is worse than one that never changed (the category picker's rule). The
// note saves on blur / Enter, and only when it actually changed.
//
// A client island inside the server-rendered score card, the way the category
// picker sits inside the identity card. Deliberately short: the score card
// must stay level with the identity card beside it.

import { SelectionButton } from '@/components/ui/SelectionButton';
import { useRef, useState, useTransition } from 'react';
import { ThumbsUp, ThumbsDown, type LucideIcon } from 'lucide-react';
import { toast } from '@/lib/toast';
import { setAgentPreferenceAction, removeAgentPreferenceAction } from '@/lib/actions/vendors';
import { PREFERENCE_STANCE_LABELS, type PreferenceStance } from '@/lib/constants/vendors';
import type { VendorAgentPreferenceWithAgent } from '@/lib/types/vendor';

const STANCE_STYLE: Record<PreferenceStance, { bg: string; fg: string; icon: LucideIcon; verb: string }> = {
  preferred: { bg: 'var(--color-success-light)', fg: 'var(--color-success-text)', icon: ThumbsUp,   verb: 'Prefers' },
  avoid:     { bg: 'var(--color-danger-light)',  fg: 'var(--color-danger-text)',  icon: ThumbsDown, verb: 'Avoids'  },
};

/** Teammates listed before "+N more". */
const TEAM_TAKES_SHOWN = 3;

export function VendorPreferenceControl({
  vendorId,
  preferences,
  currentUserId,
}: {
  vendorId: string;
  preferences: VendorAgentPreferenceWithAgent[];
  currentUserId: string;
}) {
  const mine = preferences.find((p) => p.agent_id === currentUserId) ?? null;
  const others = preferences.filter((p) => p.agent_id !== currentUserId);

  const [stance, setStance] = useState<PreferenceStance | null>(mine?.stance ?? null);
  const [note, setNote] = useState(mine?.note ?? '');
  const savedNote = useRef(mine?.note ?? '');
  const [, startTransition] = useTransition();

  function apply(next: PreferenceStance | null) {
    const previous = stance;
    setStance(next);                                   // optimistic
    startTransition(async () => {
      const res = next
        ? await setAgentPreferenceAction({ vendor_id: vendorId, stance: next, note: note.trim() || null })
        : await removeAgentPreferenceAction({ vendor_id: vendorId });
      if (res.error) {
        setStance(previous);                           // never leave a lie on screen
        toast.danger(res.error);
      }
    });
  }

  function saveNote() {
    const trimmed = note.trim();
    if (!stance || trimmed === savedNote.current) return;
    startTransition(async () => {
      const res = await setAgentPreferenceAction({ vendor_id: vendorId, stance, note: trimmed || null });
      if (res.error) toast.danger(res.error);
      else savedNote.current = trimmed;
    });
  }

  return (
    <div>
      <span
        className="label-micro"
        style={{
          display: 'block',
          color: 'var(--theme-text-tertiary)',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--theme-paper-border)',
          marginBottom: 'var(--space-3)',
        }}
      >
        Your take
      </span>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {(Object.keys(STANCE_STYLE) as PreferenceStance[]).map((s) => {
          const active = stance === s;
          const S = STANCE_STYLE[s];
          const Icon = S.icon;
          return (
            <SelectionButton
              tone={{ fill: S.bg, ink: S.fg }}
              appearance="choice"
              selected={active}
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => apply(active ? null : s)}
              className="serene-pressable"
              style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: 'var(--text-xs)',
                  }}
            >
              <Icon style={{ width: 13, height: 13, strokeWidth: 1.5 }} />
              {PREFERENCE_STANCE_LABELS[s]}
            </SelectionButton>
          );
        })}
      </div>

      {stance && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();                    // blur saves
            }
          }}
          placeholder="Why? (optional)"
          aria-label="Why"
          maxLength={500}
          style={{
            marginTop: 'var(--space-3)',
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--theme-paper-border)',
            background: 'var(--theme-paper-subtle)',
            color: 'var(--theme-text-primary)',
            fontSize: 'var(--text-xs)',
          }}
        />
      )}

      {others.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 'var(--space-3) 0 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {others.slice(0, TEAM_TAKES_SHOWN).map((p) => (
            <li
              key={p.id}
              title={p.note ?? undefined}
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--theme-text-secondary)',
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'baseline',
                minWidth: 0,
              }}
            >
              <span style={{ color: STANCE_STYLE[p.stance].fg, fontWeight: 'var(--weight-medium)', flexShrink: 0 }}>
                {STANCE_STYLE[p.stance].verb}
              </span>
              <span style={{ color: 'var(--theme-text-primary)', flexShrink: 0 }}>
                {p.agent_name ?? 'A teammate'}
              </span>
              {p.note && (
                <span
                  style={{
                    color: 'var(--theme-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  — {p.note}
                </span>
              )}
            </li>
          ))}
          {others.length > TEAM_TAKES_SHOWN && (
            <li style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
              +{others.length - TEAM_TAKES_SHOWN} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
