'use client';

// TicketBoard — the live board: one column per status, one card per ticket, the queendom
// picked in the filter bar. Drag a card to a column to move it (the same moveTicketStatusAction
// the ticket page uses; the state machine refuses an illegal move with a toast). Live: a
// Realtime subscription on sia.tickets (RLS-scoped) re-reads the board through the server
// action on any change, debounced, so two genies always see the same columns.

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { ArrowRightLeft } from 'lucide-react';
import { useMediaQuery, MQ } from '@/hooks/useMediaQuery';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { listBoardTicketsAction, moveTicketStatusAction } from '@/lib/actions/tickets';
import { formatRelativeTime } from '@/lib/utils/dates';
import { canTransition, TICKET_TRANSITIONS, TICKET_BOARD_STATUSES, TICKET_CATEGORIES, TICKET_STATUS_TONE, TICKETS_PATH, type TicketStatus } from '@/lib/constants/tickets';
import { PriorityDot } from './TicketStatusPill';
import type { TicketListItem } from '@/lib/types/ticket';
import { EmptyState } from '@/components/ui/EmptyState';

const TONE_DOT: Record<string, string> = { info: 'var(--color-info)', warning: 'var(--color-warning)', success: 'var(--color-success)', danger: 'var(--color-danger)', neutral: 'var(--theme-text-tertiary)' };

function due(t: TicketListItem): { text: string; color: string } | null {
  const d = t.first_response_due_at && !t.first_responded_at ? t.first_response_due_at : t.resolve_due_at;
  if (!d || ['resolved', 'closed', 'dropped', 'proposed'].includes(t.status)) return null;
  const late = new Date(d) < new Date();
  return { text: `${late ? 'late' : 'due'} ${formatRelativeTime(d)}`, color: late ? 'var(--color-danger-text)' : 'var(--theme-text-tertiary)' };
}

type MoveHandler = (t: TicketListItem, to: TicketStatus) => void;

function Card({ t, dragging = false, labels, onMove }: { t: TicketListItem; dragging?: boolean; labels?: Record<string, string>; onMove?: MoveHandler }) {
  const d = due(t);
  const nextStatuses = onMove ? TICKET_TRANSITIONS[t.status] ?? [] : [];
  return (
    <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--radius-md)', boxShadow: dragging ? 'var(--shadow-3)' : 'var(--shadow-1)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', cursor: 'grab', opacity: dragging ? 0.95 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>{t.ticket_no}</span>
        <PriorityDot priority={t.priority} approved={Boolean(t.priority_approved_at)} />
      </div>
      <a href={`${TICKETS_PATH}/${t.id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)', lineHeight: 1.35, textDecoration: 'none' }}>{t.title}</a>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-secondary)' }}>{t.member_name} · {TICKET_CATEGORIES.labels[t.category] ?? t.category}</span>
      {t.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {t.tags.map((tag) => <span key={tag} style={{ fontSize: 'var(--text-2xs)', padding: '1px var(--space-2)', borderRadius: 'var(--radius-full)', background: 'var(--theme-accent-surface)', color: 'var(--neu-accent-deep)' }}>{tag}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', fontSize: 'var(--text-2xs)' }}>
        <span style={{ color: t.assignee_name ? 'var(--theme-text-tertiary)' : 'var(--color-warning-text)' }}>{t.assignee_name ?? 'unassigned'}</span>
        {d ? <span style={{ color: d.color }}>{d.text}</span> : <span style={{ color: 'var(--theme-text-tertiary)' }}>{formatRelativeTime(t.updated_at)}</span>}
      </div>
      {onMove && nextStatuses.length > 0 && (
        // The touch way to move a card (mobile audit 2026-09-26): a finger cannot drag and scroll
        // at once, so on a coarse pointer each card carries the legal next statuses as a menu.
        // Same handler as the drag; the state machine already trimmed the list.
        <div onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} style={{ display: 'flex' }}>
          <FilterDropdown
            label="Move to…"
            icon={ArrowRightLeft}
            items={nextStatuses.map((s) => ({ id: s, label: labels?.[s] ?? s }))}
            selected={[]}
            onChange={(sel) => { const to = sel[0] as TicketStatus | undefined; if (to) onMove(t, to); }}
            hideCountBadge
            menuPortal
            className="serene-touch"
            ariaLabel={`Move ${t.ticket_no} to another status`}
          />
        </div>
      )}
    </div>
  );
}

function DraggableCard({ t, labels, onMove }: { t: TicketListItem; labels: Record<string, string>; onMove: MoveHandler | null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, data: { status: t.status } });
  // pan-x pan-y: the finger still scrolls the rail and the page; the TouchSensor's press delay
  // is what turns a hold into a drag (touchAction: none made every card a scroll dead zone).
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'pan-x pan-y' }}>
      <Card t={t} labels={labels} onMove={onMove ?? undefined} />
    </div>
  );
}

function Column({ status, label, tickets, canDrop, labels, onMove }: { status: TicketStatus; label: string; tickets: TicketListItem[]; canDrop: boolean | null; labels: Record<string, string>; onMove: MoveHandler | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const ring = isOver && canDrop === true ? 'var(--theme-accent)' : isOver && canDrop === false ? 'var(--color-danger)' : 'var(--theme-paper-border)';
  return (
    <section ref={setNodeRef} style={{ background: 'var(--theme-paper-subtle)', border: `1px solid ${ring}`, borderRadius: 'var(--neu-radius-card)', padding: 'var(--space-3)', minHeight: 240, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', transition: 'border-color var(--transition-hover)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-1)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: TONE_DOT[TICKET_STATUS_TONE[status]] }} />
        <span className="label-micro" style={{ color: 'var(--theme-text-secondary)' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>{tickets.length}</span>
      </header>
      {tickets.map((t) => <DraggableCard key={t.id} t={t} labels={labels} onMove={onMove} />)}
      {tickets.length === 0 && <EmptyState title="Nothing here." style={{ padding: 'var(--space-6) var(--space-2)' }} />}
    </section>
  );
}

export function TicketBoard({ initial, queendomId, labels }: { initial: TicketListItem[]; queendomId: string | null; labels: Record<string, string> }) {
  const router = useRouter();
  const mountId = useId();
  const [tickets, setTickets] = useState(initial);
  const [active, setActive] = useState<TicketListItem | null>(null);
  const [overStatus, setOverStatus] = useState<TicketStatus | null>(null);
  const [, start] = useTransition();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const isTouch = useMediaQuery(MQ.touch);

  useEffect(() => { setTickets(initial); }, [initial]);

  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      const r = await listBoardTicketsAction({ queendom_id: queendomId });
      if (r.data) setTickets(r.data);
    }, 400);
  }, [queendomId]);

  // The live layer: any change to a ticket row this user may see re-reads the board.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-board:${queendomId ?? 'all'}:${mountId}`)
      .on('postgres_changes', { event: '*', schema: 'sia', table: 'tickets', ...(queendomId ? { filter: `queendom_id=eq.${queendomId}` } : {}) }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [queendomId, mountId, refresh]);

  const byStatus = useMemo(() => {
    const m = new Map<TicketStatus, TicketListItem[]>();
    for (const s of TICKET_BOARD_STATUSES) m.set(s, []);
    for (const t of tickets) m.get(t.status)?.push(t);
    return m;
  }, [tickets]);

  // THE move: the drag drop and the touch "Move to…" menu both land here.
  const move = useCallback<MoveHandler>((t, to) => {
    if (to === t.status) return;
    if (!canTransition(t.status, to)) { toast.warning(`A ticket cannot go from ${labels[t.status]} to ${labels[to]}.`); return; }
    // Optimistic: the card moves now; the server confirms or the board re-reads.
    setTickets((xs) => xs.map((x) => (x.id === t.id ? { ...x, status: to } : x)));
    start(async () => {
      const r = await moveTicketStatusAction({ ticket_id: t.id, status: to, resolution: to === 'resolved' ? 'delivered' : null });
      if (r.error) { toast.danger(r.error); refresh(); return; }
      router.refresh();
    });
  }, [labels, refresh, router]);

  function onDragStart(e: DragStartEvent) { setActive(tickets.find((t) => t.id === e.active.id) ?? null); }
  function onDragEnd(e: DragEndEvent) {
    const t = active; setActive(null); setOverStatus(null);
    const to = e.over?.id as TicketStatus | undefined;
    if (!t || !to) return;
    move(t, to);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={(e) => setOverStatus((e.over?.id as TicketStatus) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); setOverStatus(null); }}>
      <div className="serene-board serene-board--wide">
        {TICKET_BOARD_STATUSES.map((s) => (
          <Column key={s} status={s} label={labels[s] ?? s} tickets={byStatus.get(s) ?? []} canDrop={active && overStatus === s ? canTransition(active.status, s) : null} labels={labels} onMove={isTouch ? move : null} />
        ))}
      </div>
      <DragOverlay>{active ? <div style={{ width: 240 }}><Card t={active} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}
