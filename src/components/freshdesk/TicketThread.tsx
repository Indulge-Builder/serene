// TicketThread — the ticket's conversation as Freshdesk holds it: internal notes and
// public replies, oldest first, with who wrote them. Server component, display-only.

import { Lock, MessageSquare, Paperclip } from 'lucide-react';
import { SectionCard } from '@/components/ui/SectionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils/dates';
import type { FdConversationRow } from '@/lib/types/freshdesk';

export function TicketThread({
  conversations,
  agentNames,
  requesterName,
  requesterId,
  threadSynced,
}: {
  conversations: FdConversationRow[];
  agentNames: Record<number, string>;
  requesterName: string | null;
  requesterId: number;
  threadSynced: boolean;
}) {
  return (
    <SectionCard title="Thread" description={threadSynced ? `${conversations.length} entries` : 'Thread not pulled yet'}>
      {conversations.length === 0 ? (
        <EmptyState
          variant="inline"
          title={threadSynced ? 'Nothing was written on this ticket.' : 'The thread arrives with the next sync.'}
        />
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {conversations.map((c) => {
            const author =
              c.user_id != null
                ? agentNames[c.user_id] ?? (c.user_id === requesterId ? requesterName ?? 'Client' : `User ${c.user_id}`)
                : c.incoming
                  ? requesterName ?? 'Client'
                  : 'Freshdesk';
            const Icon = c.private ? Lock : MessageSquare;
            const attachments = Array.isArray(c.attachments) ? c.attachments : [];
            const text = (c.body_text ?? '').trim();
            return (
              <li
                key={c.id}
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--neu-radius-tile, var(--radius-md))',
                  background: c.private ? 'var(--theme-paper-subtle)' : 'var(--theme-paper)',
                  border: '1px solid var(--theme-paper-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Icon style={{ width: '0.875rem', height: '0.875rem', strokeWidth: 1.5, color: 'var(--theme-text-tertiary)' }} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--theme-text-primary)' }}>{author}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)' }}>
                    {c.private ? 'internal note' : c.incoming ? 'from the client' : 'reply'} · {formatDate(c.fd_created_at, 'd MMM yyyy, h:mm a')}
                  </span>
                </div>
                {text ? (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--theme-text-primary)' }}>{text}</p>
                ) : (
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--theme-text-tertiary)', fontStyle: 'italic' }}>
                    {attachments.length ? 'Attachment only' : 'No text (an inline image or an empty note)'}
                  </p>
                )}
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                    {attachments.map((a, i) => (
                      <span
                        key={a.id ?? i}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-1)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--theme-text-secondary)',
                          padding: '2px var(--space-2)',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--theme-paper-border)',
                        }}
                      >
                        <Paperclip style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                        {a.name ?? 'attachment'}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
