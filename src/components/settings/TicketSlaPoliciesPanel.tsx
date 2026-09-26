'use client';

// TicketSlaPoliciesPanel — the SLA rows the sentinel walks (sia.ticket_sla_policies). One card
// per policy: its scope (which queendom, category, sub-category, priority; blank = every),
// its five clocks in minutes, business hours or the clock, and the escalation ladder as a
// sentence ("after 15 min → bishop"). The most specific matching row wins for a ticket.
// Edits save on Save; a new policy starts from the defaults; delete keeps at least one active.

import { FormSelect } from '@/components/ui/FormSelect';
import { Input } from '@/components/ui/Field';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { toast } from '@/lib/toast';
import { deleteTicketSlaPolicyAction, upsertTicketSlaPolicyAction } from '@/lib/actions/ticket-settings';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_SUB_CATEGORIES, type TicketCategory } from '@/lib/constants/tickets';
import type { TicketSlaPolicyRow } from '@/lib/types/ticket';
import type { QueendomSummary } from '@/lib/types/member';

type Step = { after_min: number; to: 'bishop' | 'queen' | 'founder' };
type Draft = {
  id: string | null; queendom_id: string | null; category: string | null; sub_category: string | null; priority: string | null;
  first_response_min: number; update_cadence_min: number; vendor_silence_min: number; member_silence_min: number; resolve_target_min: number;
  business_hours: boolean; escalation: Step[]; is_active: boolean;
};


function toDraft(p: TicketSlaPolicyRow): Draft {
  const esc = Array.isArray(p.escalation) ? (p.escalation as Step[]).filter((s) => s && typeof s.after_min === 'number') : [];
  return { id: p.id, queendom_id: p.queendom_id, category: p.category, sub_category: p.sub_category, priority: p.priority, first_response_min: p.first_response_min, update_cadence_min: p.update_cadence_min, vendor_silence_min: p.vendor_silence_min, member_silence_min: p.member_silence_min, resolve_target_min: p.resolve_target_min, business_hours: p.business_hours, escalation: esc, is_active: p.is_active };
}
const NEW: Draft = { id: null, queendom_id: null, category: null, sub_category: null, priority: null, first_response_min: 15, update_cadence_min: 720, vendor_silence_min: 240, member_silence_min: 1440, resolve_target_min: 480, business_hours: true, escalation: [{ after_min: 15, to: 'bishop' }, { after_min: 60, to: 'queen' }], is_active: true };

function scopeLine(d: Draft, queendoms: QueendomSummary[]): string {
  const parts = [
    d.queendom_id ? (queendoms.find((q) => q.id === d.queendom_id)?.name ?? 'one queendom') : 'every queendom',
    d.category ? (TICKET_CATEGORIES.labels[d.category as TicketCategory] ?? d.category) + (d.sub_category ? ` / ${d.sub_category}` : '') : 'every category',
    d.priority ? `${TICKET_PRIORITIES.labels[d.priority as keyof typeof TICKET_PRIORITIES.labels]} priority` : 'every priority',
  ];
  return parts.join(' · ');
}

function Clock({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>
      {label}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Input type="number" min={0} style={{ width: 90 }} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} /> min</span>
    </label>
  );
}

function PolicyCard({ initial, queendoms, onDone }: { initial: Draft; queendoms: QueendomSummary[]; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  function save() {
    start(async () => {
      const r = await upsertTicketSlaPolicyAction(d);
      if (r.error) { toast.danger(r.error); return; }
      toast.success(d.id ? 'Policy saved.' : 'Policy added.');
      onDone();
    });
  }
  function remove() {
    if (!d.id) { onDone(); return; }
    start(async () => {
      const r = await deleteTicketSlaPolicyAction({ id: d.id });
      if (r.error) { toast.danger(r.error); return; }
      toast.success('Policy removed.');
      onDone();
    });
  }
  const subs = d.category ? TICKET_SUB_CATEGORIES[d.category as TicketCategory] ?? [] : [];

  return (
    <div style={{
      border: '1px solid var(--theme-paper-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      background: d.is_active ? 'var(--theme-paper)' : 'var(--theme-paper-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)' }}>{scopeLine(d, queendoms)}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Toggle size="sm" checked={d.is_active} onChange={(v) => set('is_active', v)} label="Active" />
          <Button variant="ghost" size="xs" onClick={remove} loading={pending} iconMotion="drop"><Trash2 style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} /></Button>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <FormSelect aria-label="Queendom" fullWidth={false} value={d.queendom_id ?? ''} onValueChange={(nextValue) => set('queendom_id', nextValue || null)}>
          <option value="">Every queendom</option>{queendoms.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </FormSelect>
        <FormSelect aria-label="Category" fullWidth={false} value={d.category ?? ''} onValueChange={(nextValue) => { set('category', nextValue || null); set('sub_category', null); }}>
          <option value="">Every category</option>{TICKET_CATEGORIES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </FormSelect>
        {subs.length > 0 && (
          <FormSelect aria-label="Sub-category" fullWidth={false} value={d.sub_category ?? ''} onValueChange={(nextValue) => set('sub_category', nextValue || null)}>
            <option value="">Any sub-category</option>{subs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FormSelect>
        )}
        <FormSelect aria-label="Priority" fullWidth={false} value={d.priority ?? ''} onValueChange={(nextValue) => set('priority', nextValue || null)}>
          <option value="">Every priority</option>{TICKET_PRIORITIES.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </FormSelect>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Clock label="First response" value={d.first_response_min} onChange={(n) => set('first_response_min', n)} />
        <Clock label="Update the member every" value={d.update_cadence_min} onChange={(n) => set('update_cadence_min', n)} />
        <Clock label="Vendor silent" value={d.vendor_silence_min} onChange={(n) => set('vendor_silence_min', n)} />
        <Clock label="Member silent" value={d.member_silence_min} onChange={(n) => set('member_silence_min', n)} />
        <Clock label="Resolve within" value={d.resolve_target_min} onChange={(n) => set('resolve_target_min', n)} />
        <Toggle size="sm" checked={d.business_hours} onChange={(v) => set('business_hours', v)} label="Business hours" description="Mon to Sat, 9 to 7 IST" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="label-micro" style={{ color: 'var(--theme-text-tertiary)' }}>After a breach, escalate</span>
        {d.escalation.map((s, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            <span>after</span>
            <Input type="number" min={0} style={{ width: 90 }} value={s.after_min} onChange={(e) => set('escalation', d.escalation.map((x, j) => (j === i ? { ...x, after_min: Math.max(0, Number(e.target.value) || 0) } : x)))} />
            <span>min →</span>
            <FormSelect aria-label="Escalation recipient" fullWidth={false} value={s.to} onValueChange={(nextValue) => set('escalation', d.escalation.map((x, j) => (j === i ? { ...x, to: nextValue as Step['to'] } : x)))}>
              <option value="bishop">the bishop</option><option value="queen">the queen</option><option value="founder">the founder</option>
            </FormSelect>
            <Button
              variant="ghost"
              iconOnly size="sm"
              type="button"
              onClick={() => set('escalation', d.escalation.filter((_, j) => j !== i))}
              aria-label="Remove step"
            ><Trash2 style={{ width: 12, height: 12 }} /></Button>
          </div>
        ))}
        {d.escalation.length < 5 && <Button variant="ghost" size="xs" onClick={() => set('escalation', [...d.escalation, { after_min: 60, to: 'queen' }])}><Plus style={{ width: '0.75rem', height: '0.75rem' }} /> Step</Button>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        {!d.id && <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
        <Button size="sm" onClick={save} loading={pending} disabled={!dirty && Boolean(d.id)}>{d.id ? 'Save' : 'Add policy'}</Button>
      </div>
    </div>
  );
}

export function TicketSlaPoliciesPanel({ initialPolicies, queendoms }: { initialPolicies: TicketSlaPolicyRow[]; queendoms: QueendomSummary[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const done = () => { setAdding(false); router.refresh(); };
  return (
    <SectionCard title="Service targets" description="The clocks the sentinel watches, and who it escalates to. The most specific matching policy wins for a ticket." headerRight={<Button size="sm" variant="secondary" onClick={() => setAdding(true)} iconMotion="rotate"><Plus style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5 }} /> New policy</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {adding && <PolicyCard key="new" initial={NEW} queendoms={queendoms} onDone={done} />}
        {initialPolicies.map((p) => <PolicyCard key={`${p.id}:${p.updated_at}`} initial={toDraft(p)} queendoms={queendoms} onDone={done} />)}
      </div>
    </SectionCard>
  );
}
