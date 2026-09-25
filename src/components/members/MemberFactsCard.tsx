'use client';

// MemberFactsCard — the twin's facts at dossier density. One section per facet (Family,
// Dietary, …), each a quiet label → value list; the source and date sit beside the value
// and the whole provenance is in its tooltip. Double-click a value to correct it in place
// (the lead dossier's inline-edit look, ui/InlineEdit): Enter or leaving the field saves,
// Esc cancels. A correction is a new fact that supersedes the old; the old row and its
// duplicates stay in the ledger. New facts come in through the Observation box
// (MemberObservationCard), never a form here. One component, two mounts: Essentials and
// Preferences.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CardHeader } from '@/components/leads/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { EditableValueText, FieldSaveFeedback, INLINE_EDIT_INPUT_STYLE } from '@/components/ui/InlineEdit';
import { addMemberFactAction } from '@/lib/actions/members';
import { formatDate } from '@/lib/utils/dates';
import { CLIENT_FACETS, FACT_SOURCES, FACT_KEY_LABELS, type MemberFacet } from '@/lib/constants/member-facets';
import type { MemberFactView } from '@/lib/types/member';

// A server page cannot pass a component to a member card; it passes a name.
const ICONS: Record<'compass' | 'heart', LucideIcon> = { compass: Compass, heart: Heart };

const SUCCESS_HOLD_MS = 2000;

function keyLabel(facet: string, key: string): string {
  const label = FACT_KEY_LABELS[`${facet}.${key}`] ?? (key ? key.replace(/_/g, ' ') : CLIENT_FACETS.labels[facet as MemberFacet] ?? facet);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function provenance(f: MemberFactView): string {
  const sources = f.sources.map((src) => FACT_SOURCES.labels[src] ?? src).join(' and ');
  return `${sources}, ${formatDate(f.observed_at, 'd MMM yyyy')}${f.created_by_name ? `, by ${f.created_by_name}` : ''}, confidence ${Math.round(f.confidence * 100)}%`;
}

export function MemberFactsCard({ clientId, facts, facets, title, icon }: { clientId: string; facts: MemberFactView[]; facets: readonly MemberFacet[]; title: string; icon: 'compass' | 'heart' }) {
  // facet → key → facts, in the card's facet order; keys A→Z inside a facet.
  const sections = useMemo(() => {
    const byFacet = new Map<MemberFacet, Map<string, MemberFactView[]>>();
    for (const f of facts) {
      if (!facets.includes(f.facet)) continue;
      const keys = byFacet.get(f.facet) ?? new Map<string, MemberFactView[]>();
      keys.set(f.key, [...(keys.get(f.key) ?? []), f]);
      byFacet.set(f.facet, keys);
    }
    return facets
      .filter((facet) => byFacet.has(facet))
      .map((facet) => ({
        facet,
        rows: [...byFacet.get(facet)!.entries()].sort(([a], [b]) => a.localeCompare(b)),
      }));
  }, [facts, facets]);

  return (
    <div style={{
      background: 'var(--theme-paper)',
      border: '1px solid var(--theme-paper-border)',
      borderRadius: 'var(--neu-radius-card)',
      boxShadow: 'var(--shadow-1)',
      overflow: 'hidden',
    }}>
      <CardHeader icon={ICONS[icon]} label={title} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {sections.length === 0 && (
          <EmptyState variant="inline" title="Nothing recorded yet." description="Write an observation above; what it says lands here, with who said it and when." />
        )}
        {sections.map(({ facet, rows }) => {
          const facetLabel = CLIENT_FACETS.labels[facet];
          return (
            <section key={facet} style={{ minWidth: 0 }}>
              <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-2)' }}>{facetLabel}</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {rows.map(([key, list], i) => {
                  const label = keyLabel(facet, key);
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(88px, 30%) minmax(0, 1fr)',
                        columnGap: 'var(--space-4)',
                        padding: 'var(--space-2) 0',
                        borderTop: i === 0 ? 'none' : '1px solid var(--theme-paper-border)',
                      }}
                    >
                      {/* A key that only repeats its facet ("Dietary" under Dietary) shows no label. */}
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)', lineHeight: 'var(--leading-normal)', paddingTop: 1 }}>
                        {label.toLowerCase() === facetLabel.toLowerCase() ? '' : label}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                        {list.map((f, idx) => (
                          // Keyed by position: a correction comes back from the server under a
                          // new id, and the row keeps its "saved" check across the refresh.
                          <FactValue key={`${key}:${idx}`} clientId={clientId} fact={f} label={label} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FactValue({ clientId, fact, label }: { clientId: string; fact: MemberFactView; label: string }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState(fact.value);
  const [draft, setDraft] = useState(fact.value);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Disabling the focused input mid-save fires a blur; the ref stops it saving twice.
  const inFlight = useRef(false);

  useEffect(() => { setDisplay(fact.value); setDraft(fact.value); }, [fact.value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function open() {
    if (saving) return;
    setDraft(display);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setDraft(display);
    setError(null);
    setEditing(false);
  }

  async function commit() {
    const next = draft.trim();
    if (inFlight.current) return;
    if (!next || next === display.trim()) { cancel(); return; }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    const res = await addMemberFactAction({
      member_id: clientId, facet: fact.facet, key: fact.key, value: next, polarity: fact.polarity, supersedes_id: fact.id,
    });
    inFlight.current = false;
    setSaving(false);
    // The draft stays open on error, so nothing typed is lost.
    if (res.error) { setError(res.error); return; }
    setDisplay(next);
    setEditing(false);
    setSuccess(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSuccess(false), SUCCESS_HOLD_MS);
    startRefresh(() => router.refresh());
  }

  const avoids = fact.polarity === 'dislikes';

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', minWidth: 0 }}>
        {avoids && (
          <span style={{
            flexShrink: 0,
            padding: '1px var(--space-2)',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-danger-light)',
            color: 'var(--color-danger-text)',
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-medium)',
          }}>
            Avoids
          </span>
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            disabled={saving}
            maxLength={2000}
            aria-label={`Correct ${label}`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            style={{ ...INLINE_EDIT_INPUT_STYLE, flex: 1, minWidth: 0 }}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            aria-label={`${label}: ${display}. Double-click to correct.`}
            title={`${provenance(fact)}\nDouble-click to correct.`}
            onDoubleClick={open}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 'var(--text-sm)',
              lineHeight: 'var(--leading-normal)',
              color: 'var(--theme-text-primary)',
              wordBreak: 'break-word',
              cursor: saving ? 'wait' : 'text',
            }}
          >
            <EditableValueText hovered={hovered}>{display}</EditableValueText>
          </span>
        )}
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', alignSelf: 'center' }}>
          <FieldSaveFeedback saving={saving} success={success} error={null} />
          {!editing && !saving && !success && (
            <span
              title={provenance(fact)}
              style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}
            >
              {fact.source === 'agent_note'
                ? <ShieldCheck style={{ width: 10, height: 10, strokeWidth: 1.5 }} />
                : <Sparkles style={{ width: 10, height: 10, strokeWidth: 1.5 }} />}
              {formatDate(fact.observed_at, 'MMM yy')}{fact.sources.length > 1 ? ` · ${fact.sources.length}` : ''}
            </span>
          )}
        </span>
      </div>
      {error && (
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>{error}</p>
      )}
    </div>
  );
}
