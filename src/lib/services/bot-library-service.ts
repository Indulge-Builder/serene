// THE library send (0252, docs/architecture/indulge-bot-plan.md section 8).
//
// The library is what the onboarding team used to send by hand: brochures, testimonial videos,
// the podcast, the app links, the standard messages. It lives in public.elaya_training_assets
// (kinds in TRAINING_LIBRARY_KINDS). sendLibraryItemCore is the ONE way a library item reaches
// WhatsApp, for the public bot and for an agent's Library button alike: the WhatsApp type comes
// from the file (never from the kind), a ready message goes as its text then its attachments in
// order, every send is a gia.whatsapp_messages row carrying training_asset_id, and the send leaves
// from the conversation's own line.
//
// No `server-only`: the bench and the orchestrator share it. Admin client; the CALLER gates (the
// bot by construction, the action by the session's access to the conversation).

import { createAdminClient } from '@/lib/supabase/admin';
import { giaDb } from '@/lib/supabase/schemas';
import { mapRows } from '@/lib/utils/rows';
import { resolveOutboundMediaType } from '@/lib/constants/whatsapp';
import { isLibraryKind, READY_MESSAGE_NAME_TOKEN, TRAINING_BUCKET } from '@/lib/constants/elaya-training';
import { PUBLIC_BOT_LIMITS } from '@/lib/constants/public-bot';
import { sendLibraryMedia, sendPublicBotText } from '@/lib/services/whatsapp-api';
import type { WhatsAppLine } from '@/lib/constants/whatsapp-lines';
import type { TrainingAssetRow } from '@/lib/types/elaya-training';

/** A file in the public library bucket, or the item's own external link. */
export function assetPublicUrl(asset: Pick<TrainingAssetRow, 'url' | 'storage_path'>): string | null {
  if (asset.url) return asset.url;
  if (!asset.storage_path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${TRAINING_BUCKET}/${asset.storage_path}`;
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac',
};

/**
 * How an item goes out on WhatsApp: a file of a WhatsApp type (from its recorded MIME type, else
 * its file extension), or a link sent as text. A kind of `url` is always a link; so is a file
 * whose type WhatsApp would refuse.
 */
export function sendShapeOf(asset: Pick<TrainingAssetRow, 'kind' | 'mime_type' | 'storage_path' | 'url'>): 'image' | 'video' | 'document' | 'audio' | 'link' {
  if (asset.kind === 'url') return 'link';
  const ext = (asset.storage_path ?? asset.url ?? '').split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const mime = asset.mime_type || EXT_MIME[ext] || '';
  return resolveOutboundMediaType(mime) ?? 'link';
}

export type LibraryItem = Pick<
  TrainingAssetRow,
  'id' | 'kind' | 'title' | 'description' | 'when_to_send' | 'url' | 'storage_path' | 'mime_type' | 'attachments' | 'send_order'
> & { publicUrl: string | null };

const LIBRARY_COLUMNS = 'id, kind, title, description, when_to_send, url, storage_path, mime_type, attachments, send_order, status, active';

/** Approved, active library items by id (unknown or unapproved ids are simply absent). */
export async function getLibraryItems(ids: readonly string[]): Promise<Map<string, LibraryItem>> {
  const out = new Map<string, LibraryItem>();
  if (ids.length === 0) return out;
  const { data } = await createAdminClient()
    .from('elaya_training_assets')
    .select(LIBRARY_COLUMNS)
    .in('id', [...new Set(ids)])
    .eq('status', 'approved')
    .eq('active', true);
  for (const r of mapRows<TrainingAssetRow, TrainingAssetRow>(data, (x) => x)) {
    if (!isLibraryKind(r.kind)) continue;
    out.set(r.id, { ...r, publicUrl: assetPublicUrl(r) });
  }
  return out;
}

/** Every approved library item, for the agent's Library picker (send order, then title). */
export async function listLibraryItems(): Promise<LibraryItem[]> {
  const { data } = await createAdminClient()
    .from('elaya_training_assets')
    .select(LIBRARY_COLUMNS)
    .eq('status', 'approved')
    .eq('active', true)
    .order('send_order', { ascending: true })
    .order('title', { ascending: true });
  return mapRows<TrainingAssetRow, TrainingAssetRow>(data, (x) => x)
    .filter((r) => isLibraryKind(r.kind))
    .map((r) => ({ ...r, publicUrl: assetPublicUrl(r) }));
}

/** The library items this conversation has already received (the bot never sends one twice). */
export async function getSentAssetIds(conversationId: string): Promise<Set<string>> {
  const { data } = await giaDb(createAdminClient())
    .from('whatsapp_messages')
    .select('training_asset_id')
    .eq('conversation_id', conversationId)
    .not('training_asset_id', 'is', null);
  return new Set(((data ?? []) as { training_asset_id: string | null }[]).map((r) => r.training_asset_id).filter((x): x is string => !!x));
}

export type LibrarySender = { kind: 'bot' } | { kind: 'agent'; profileId: string };

export type ConversationRef = { id: string; lead_id: string; wa_id: string; line: WhatsAppLine };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A ready message's text, its one blank filled ("{first_name}" → the name, or "there"). */
export function fillReadyMessage(body: string, firstName: string | null | undefined): string {
  const name = (firstName ?? '').trim() || 'there';
  return body.split(READY_MESSAGE_NAME_TOKEN).join(name);
}

async function recordSend(args: {
  conversation: ConversationRef;
  sender: LibrarySender;
  messageType: 'text' | 'image' | 'video' | 'document' | 'audio';
  content: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  waMessageId: string | null;
  assetId: string;
}): Promise<void> {
  const { error } = await giaDb(createAdminClient())
    .from('whatsapp_messages')
    .insert({
      conversation_id: args.conversation.id,
      lead_id: args.conversation.lead_id,
      direction: 'outbound',
      sender_type: args.sender.kind === 'bot' ? 'bot' : 'agent',
      sender_id: args.sender.kind === 'agent' ? args.sender.profileId : null,
      wa_message_id: args.waMessageId,
      message_type: args.messageType,
      content: args.content,
      media_url: args.mediaUrl,
      media_mime_type: args.mediaMime,
      status: 'sent',
      status_at: new Date().toISOString(),
      is_bot: args.sender.kind === 'bot',
      training_asset_id: args.assetId,
    });
  if (error) console.error('[bot-library] send recorded failed:', error.message);
}

/** One item (never a ready message's attachments; the caller walks those). */
async function sendOne(item: LibraryItem, conversation: ConversationRef, sender: LibrarySender, logType: 'public_media' | 'library_send'): Promise<boolean> {
  const shape = sendShapeOf(item);
  const to = conversation.wa_id;
  if (shape === 'link') {
    const link = item.publicUrl;
    if (!link) return false;
    const text = `${item.title}\n${link}`;
    const { delivered, messageId } = await sendPublicBotText(to, text, conversation.lead_id, conversation.line);
    if (delivered) await recordSend({ conversation, sender, messageType: 'text', content: text, mediaUrl: null, mediaMime: null, waMessageId: messageId, assetId: item.id });
    return delivered;
  }
  if (!item.publicUrl) return false;
  const filename = shape === 'document' ? `${item.title.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'Indulge'}.pdf` : undefined;
  const { delivered, messageId } = await sendLibraryMedia({
    to,
    type: shape,
    url: item.publicUrl,
    caption: shape === 'audio' ? undefined : item.title,
    filename,
    leadId: conversation.lead_id,
    line: conversation.line,
    logType,
  });
  if (delivered) await recordSend({ conversation, sender, messageType: shape, content: item.title, mediaUrl: item.publicUrl, mediaMime: item.mime_type, waMessageId: messageId, assetId: item.id });
  return delivered;
}

/**
 * THE library send. A file goes as its WhatsApp type with its title as the caption; a link as
 * text with the preview on; a ready message as its text (the one blank filled) and then each
 * attachment in order, two seconds apart so they arrive in order. Returns what was delivered.
 * A closed 24-hour window makes Gupshup refuse every send: the caller tells the agent.
 */
export async function sendLibraryItemCore(args: {
  conversation: ConversationRef;
  item: LibraryItem;
  sender: LibrarySender;
  firstName?: string | null;
}): Promise<{ delivered: number; failed: number }> {
  const logType = args.sender.kind === 'bot' ? 'public_media' : 'library_send';
  let delivered = 0;
  let failed = 0;

  if (args.item.kind === 'ready_message') {
    const body = fillReadyMessage(args.item.description ?? '', args.firstName);
    if (body.trim()) {
      const { delivered: ok, messageId } = await sendPublicBotText(args.conversation.wa_id, body, args.conversation.lead_id, args.conversation.line);
      if (!ok) return { delivered: 0, failed: 1 };
      delivered += 1;
      await recordSend({ conversation: args.conversation, sender: args.sender, messageType: 'text', content: body, mediaUrl: null, mediaMime: null, waMessageId: messageId, assetId: args.item.id });
    }
    const attachments = await getLibraryItems(args.item.attachments ?? []);
    for (const id of args.item.attachments ?? []) {
      const att = attachments.get(id);
      if (!att || att.kind === 'ready_message') continue;
      await sleep(PUBLIC_BOT_LIMITS.sendGapMs);
      if (await sendOne(att, args.conversation, args.sender, logType)) delivered += 1;
      else failed += 1;
    }
    return { delivered, failed };
  }

  if (await sendOne(args.item, args.conversation, args.sender, logType)) delivered += 1;
  else failed += 1;
  return { delivered, failed };
}
