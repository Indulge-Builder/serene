'use client';

// SiaMessagesPeek — the mini WhatsApp view (2026-09-26): the messages a suggested ticket rests on,
// shown as the REAL bubbles (SiaMessageBubble, the same component the Sia page renders) inside the
// conversation around them, so a bishop understands the request without leaving the form. The
// burst is ringed; a few messages before and after give the context; "Earlier" / "Later" pull
// more; "Open in Sia" lands on the Sia page with this group open and scrolled to the first message
// (siaMessageHref). Reads go through getSiaMessagesAction, so the queendom scope holds here too.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { SiaDaySeparator, SiaMessageBubble } from '@/components/sia/SiaMessageBubble';
import { getSiaMessagesAction } from '@/lib/actions/sia';
import { siaMessageHref } from '@/lib/constants/sia-roles';
import type { SiaMessageRow } from '@/lib/services/sia-service';

const PANE: React.CSSProperties = { maxHeight: 460, overflowY: 'auto', padding: 'var(--space-3) var(--space-2)', borderRadius: 'var(--radius-md)', background: 'var(--theme-paper-subtle)', border: '1px solid var(--theme-paper-border)' };
const EDGE: React.CSSProperties = { display: 'flex', justifyContent: 'center', padding: 'var(--space-1) 0' };

export function SiaMessagesPeek({ groupJid, messages }: {
  groupJid: string;
  /** The burst: what the ticket rests on. Only ids and moments are needed. */
  messages: { wa_message_id: string; at: string }[];
}) {
  const [rows, setRows] = useState<SiaMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [busy, setBusy] = useState<'earlier' | 'later' | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string>>(new Set());
  const burst = new Set(messages.map((m) => m.wa_message_id));
  const first = messages.length ? [...messages].sort((a, b) => a.at.localeCompare(b.at))[0] : null;

  useEffect(() => {
    if (!first) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    getSiaMessagesAction(groupJid, { around: first.at, radius: 8 }).then((res) => {
      if (!alive) return;
      if (!res.data) { setFailed(true); setLoading(false); return; }
      known.current = new Set(res.data.messages.map((m) => m.id));
      setRows(res.data.messages);
      setHasEarlier(res.data.hasMore);
      setLoading(false);
      requestAnimationFrame(() => {
        const el = paneRef.current?.querySelector(`[data-wa-id="${CSS.escape(first.wa_message_id)}"]`);
        if (el && paneRef.current) {
          const top = (el as HTMLElement).offsetTop - paneRef.current.offsetTop - 24;
          paneRef.current.scrollTop = Math.max(0, top);
        }
      });
    });
    return () => { alive = false; };
  }, [groupJid, first?.at, first?.wa_message_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const merge = (incoming: SiaMessageRow[]) => {
    const fresh = incoming.filter((m) => !known.current.has(m.id));
    for (const m of fresh) known.current.add(m.id);
    return fresh;
  };

  const loadEarlier = useCallback(async () => {
    const oldest = rows[0]?.wa_timestamp;
    if (!oldest || busy) return;
    setBusy('earlier');
    const pane = paneRef.current; const before = pane?.scrollHeight ?? 0;
    const res = await getSiaMessagesAction(groupJid, { before: oldest });
    if (res.data) {
      const fresh = merge(res.data.messages);
      setRows((prev) => [...fresh, ...prev]);
      setHasEarlier(res.data.hasMore);
      requestAnimationFrame(() => { if (pane) pane.scrollTop += pane.scrollHeight - before; });
    }
    setBusy(null);
  }, [rows, busy, groupJid]);

  const loadLater = useCallback(async () => {
    const newest = rows.at(-1)?.wa_timestamp;
    if (!newest || busy) return;
    setBusy('later');
    const res = await getSiaMessagesAction(groupJid, { after: newest });
    if (res.data) { const fresh = merge(res.data.messages); setRows((prev) => [...prev, ...fresh]); }
    setBusy(null);
  }, [rows, busy, groupJid]);

  if (!first) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div ref={paneRef} style={PANE}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}><LogoSpinner /></div>
        ) : failed ? (
          <p style={{ margin: 0, padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--theme-text-secondary)' }}>The conversation could not be loaded. The ticket can still be created from the note on the left.</p>
        ) : (
          <>
            {hasEarlier && <div style={EDGE}><Button variant="ghost" size="xs" onClick={loadEarlier} loading={busy === 'earlier'} loadingLabel="Loading…">Earlier</Button></div>}
            {rows.map((m, i) => {
              const inBurst = burst.has(m.wa_message_id);
              return (
                <div key={m.id} data-wa-id={m.wa_message_id} style={inBurst ? { borderRadius: 'var(--radius-md)', outline: '2px solid var(--theme-accent)', outlineOffset: 2, margin: '2px 0' } : { opacity: 0.82 }}>
                  {(!rows[i - 1] || new Date(rows[i - 1].wa_timestamp).toDateString() !== new Date(m.wa_timestamp).toDateString()) && <SiaDaySeparator ts={m.wa_timestamp} />}
                  <SiaMessageBubble m={m} prev={rows[i - 1]} chatJid={groupJid} />
                </div>
              );
            })}
            <div style={EDGE}><Button variant="ghost" size="xs" onClick={loadLater} loading={busy === 'later'} loadingLabel="Loading…">Later</Button></div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>Ringed messages are the request; the rest is the conversation around it.</span>
        <Link href={siaMessageHref(groupJid, first.wa_message_id)} target="_blank" rel="noopener" className="serene-btn-secondary serene-pressable" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap' }}>
          Open in Sia <ExternalLink style={{ width: '0.8rem', height: '0.8rem', strokeWidth: 1.5 }} />
        </Link>
      </div>
    </div>
  );
}
