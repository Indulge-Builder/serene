'use client';

// MemberFactsCard — the twin's facts at dossier density, grouped by facet, each with its
// source and date, plus "correct" (a new fact that supersedes the old — the old row stays in
// the ledger). New facts come in through the Observation box (MemberObservationCard), never
// a form here. One component, two mounts: Essentials and Preferences.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// A server page cannot pass a component to a member card; it passes a name.
const ICONS: Record<'compass' | 'heart', LucideIcon> = { compass: Compass, heart: Heart };
import { CardHeader } from '@/components/leads/CardHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/lib/toast';
import { addMemberFactAction } from '@/lib/actions/members';
import { formatDate } from '@/lib/utils/dates';
import { CLIENT_FACETS, FACT_SOURCES, FACT_KEY_LABELS, type MemberFacet } from '@/lib/constants/member-facets';
import type { MemberFactView } from '@/lib/types/member';

function keyLabel(facet: string, key: string): string {
  return FACT_KEY_LABELS[`${facet}.${key}`] ?? (key ? key.replace(/_/g, ' ') : CLIENT_FACETS.labels[facet as MemberFacet] ?? facet);
}

export function MemberFactsCard({ clientId, facts, facets, title, icon }: { clientId: string; facts: MemberFactView[]; facets: readonly MemberFacet[]; title: string; icon: 'compass' | 'heart' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [composing, setComposing] = useState<{ facet: MemberFacet; key: string; polarity: 'likes' | 'dislikes' | 'neutral'; value: string; supersedes: string | null } | null>(null);

  const groups = useMemo(() => {
    const byKey = new Map<string, MemberFactView[]>();
    for (const f of facts) {
      if (!facets.includes(f.facet)) continue;
      const k = `${f.facet}|${f.key}`;
      byKey.set(k, [...(byKey.get(k) ?? []), f]);
    }
    return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [facts, facets]);

  function submit() {
    if (!composing || !composing.value.trim()) return;
    start(async () => {
      const res = await addMemberFactAction({ member_id: clientId, facet: composing.facet, key: composing.key, value: composing.value, polarity: composing.polarity, supersedes_id: composing.supersedes });
      if (res.error) { toast.danger(res.error); return; }
      setComposing(null);
      router.refresh();
    });
  }

  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--neu-radius-card)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <CardHeader icon={ICONS[icon]} label={title} />
      <div style={{ padding: 'var(--space-4) var(--space-6) var(--space-5)' }}>
        {groups.length === 0 && !composing && (
          <EmptyState variant="inline" title="Nothing recorded yet." description="Write an observation above; what it says lands here, with who said it and when." />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4) var(--space-6)' }}>
          {groups.map(([k, list]) => {
            const [facet, key] = k.split('|');
            return (
              <div key={k} style={{ minWidth: 0 }}>
                <div className="label-micro" style={{ color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-1)' }}>{keyLabel(facet, key)}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {list.map((f) => (
                    <li key={f.id} style={{ fontSize: 'var(--text-sm)', color: f.polarity === 'dislikes' ? 'var(--color-danger-text)' : 'var(--theme-text-primary)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span>{f.polarity === 'dislikes' ? 'Avoids ' : ''}{f.value}</span>
                      <span title={`${f.sources.map((src) => FACT_SOURCES.labels[src] ?? src).join(' and ')}, ${formatDate(f.observed_at, 'd MMM yyyy')}${f.created_by_name ? `, by ${f.created_by_name}` : ''}, confidence ${Math.round(f.confidence * 100)}%`}
                        style={{ fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        {f.source === 'agent_note' ? <ShieldCheck style={{ width: 10, height: 10 }} /> : <Sparkles style={{ width: 10, height: 10 }} />}
                        {formatDate(f.observed_at, 'MMM yy')}{f.sources.length > 1 ? ` · ${f.sources.length} sources` : ''}
                      </span>
                      <button type="button" onClick={() => setComposing({ facet: f.facet, key: f.key, polarity: f.polarity, value: f.value, supersedes: f.id })}
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 'var(--text-2xs)', color: 'var(--neu-accent-deep)' }}>
                        correct
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {composing && (
          <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--theme-paper-border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <select className="serene-input neu-input" value={composing.facet} onChange={(e) => setComposing({ ...composing, facet: e.target.value as MemberFacet })} style={{ width: 140 }} disabled={Boolean(composing.supersedes)}>
                {facets.map((f) => <option key={f} value={f}>{CLIENT_FACETS.labels[f]}</option>)}
              </select>
              <input className="serene-input neu-input" value={composing.key} onChange={(e) => setComposing({ ...composing, key: e.target.value })} placeholder="what (e.g. seat, cuisine, home)" style={{ width: 200 }} disabled={Boolean(composing.supersedes)} />
              <select className="serene-input neu-input" value={composing.polarity} onChange={(e) => setComposing({ ...composing, polarity: e.target.value as 'likes' | 'dislikes' | 'neutral' })} style={{ width: 110 }}>
                <option value="neutral">is</option><option value="likes">likes</option><option value="dislikes">avoids</option>
              </select>
            </div>
            <input className="serene-input neu-input" value={composing.value} onChange={(e) => setComposing({ ...composing, value: e.target.value })} placeholder="the value" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} autoFocus maxLength={2000} />
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="xs" onClick={() => setComposing(null)}>Cancel</Button>
              <Button size="xs" onClick={submit} loading={pending} disabled={!composing.value.trim()}>{composing.supersedes ? 'Correct' : 'Add'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
