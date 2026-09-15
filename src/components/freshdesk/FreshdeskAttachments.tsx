// FreshdeskAttachments — THE attachment strip on a mirrored note or ticket (0197): images as
// thumbnails, video and audio playable, everything else a chip that opens the file. A file
// not copied yet shows its name only, with the reason on hover. Links are one-hour signed
// urls minted by the read path; nothing here talks to storage. Server-component-safe.

import { Paperclip, ImageOff } from 'lucide-react';
import { fdAttachmentKind } from '@/lib/constants/freshdesk';
import { formatBytes } from '@/lib/utils/numbers';
import type { FdAttachment } from '@/lib/types/freshdesk';

const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)',
  padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', border: '1px solid var(--theme-paper-border)',
  color: 'var(--theme-text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

export function FreshdeskAttachments({ attachments }: { attachments: FdAttachment[] }) {
  if (!attachments.length) return null;
  const media = attachments.filter((a) => a.signed_url && fdAttachmentKind(a) !== 'file');
  const files = attachments.filter((a) => !media.includes(a));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
      {media.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {media.map((a, i) => {
            const kind = fdAttachmentKind(a);
            const key = a.storage_path ?? `${a.id ?? i}`;
            if (kind === 'image') {
              return (
                <a key={key} href={a.signed_url ?? undefined} target="_blank" rel="noreferrer" title={a.name} style={{ display: 'block', lineHeight: 0 }}>
                  <img src={a.signed_url ?? undefined} alt={a.name ?? 'image'} loading="lazy" style={{ maxHeight: 180, maxWidth: 260, borderRadius: 'var(--radius-md)', border: '1px solid var(--theme-paper-border)', objectFit: 'cover' }} />
                </a>
              );
            }
            if (kind === 'video') {
              return <video key={key} src={a.signed_url ?? undefined} controls preload="metadata" style={{ maxHeight: 220, maxWidth: 320, borderRadius: 'var(--radius-md)', border: '1px solid var(--theme-paper-border)', background: 'var(--theme-paper-subtle)' }} />;
            }
            return <audio key={key} src={a.signed_url ?? undefined} controls preload="metadata" style={{ maxWidth: 320 }} />;
          })}
        </div>
      )}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {files.map((a, i) => {
            const label = `${a.name ?? 'attachment'}${a.size ? ` · ${formatBytes(a.size)}` : ''}`;
            return a.signed_url ? (
              <a key={a.storage_path ?? `${a.id ?? i}`} href={a.signed_url} target="_blank" rel="noreferrer" style={{ ...CHIP, color: 'var(--neu-accent-deep)' }} title={a.name}>
                <Paperclip style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5, flexShrink: 0 }} />{label}
              </a>
            ) : (
              <span key={`${a.id ?? i}`} style={{ ...CHIP, color: 'var(--theme-text-tertiary)' }} title={a.store_error ? `Not copied yet: ${a.store_error}` : 'Not copied yet'}>
                <ImageOff style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5, flexShrink: 0 }} />{label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
