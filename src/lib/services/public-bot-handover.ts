// THE public bot's hand-over (0252, docs/architecture/indulge-bot-plan.md section 9).
//
// recordConciergeBriefCore is the ONE writer of a `concierge_brief` lead activity: the summary,
// the person's own words, what was sent, what was promised, the next step and the business. The
// lead row is not touched (form_data is written once at creation, a lead note needs a staff
// author); the timeline is append-only, so a second hand-over is a second row and nothing is
// overwritten. alertHandover tells the people who act on it.
//
// No `server-only` (the bench can drive it). Admin client; the bot is the caller.

import { createAdminClient } from '@/lib/supabase/admin';
import { giaDb } from '@/lib/supabase/schemas';
import { invalidateLeadCaches } from '@/lib/services/lead-cache';
import { createNotification } from '@/lib/services/notifications-service';
import { getDomainDecisionMakers } from '@/lib/services/profiles-service';
import { getQueendomSeats } from '@/lib/services/queendom-seats';
import { sendHandoverAlertTemplate } from '@/lib/services/whatsapp-api';
import { HANDOVER_REASONS, PUBLIC_BOT_CALL_WINDOW, type HandoverReason, type PublicBotBusiness } from '@/lib/constants/public-bot';

export const CONCIERGE_BRIEF_ACTION = 'concierge_brief' as const;

export type ConciergeBrief = {
  reason: HandoverReason;
  business: PublicBotBusiness;
  summary: string;
  inTheirWords: string | null;
  interests: string[];
  sent: string[];
  promised: string | null;
  nextStep: string | null;
};

type LeadRef = { id: string; slug: string | null; domain: string | null; first_name: string | null; assigned_to: string | null };

/** The brief on the lead's timeline (one append-only row), then the dossier caches cleared. */
export async function recordConciergeBriefCore(lead: LeadRef, brief: ConciergeBrief): Promise<boolean> {
  const { error } = await giaDb(createAdminClient()).from('lead_activities').insert({
    lead_id: lead.id,
    actor_id: null,
    action_type: CONCIERGE_BRIEF_ACTION,
    details: {
      reason: brief.reason,
      reason_label: HANDOVER_REASONS[brief.reason],
      business: brief.business,
      summary: brief.summary,
      in_their_words: brief.inTheirWords,
      interests: brief.interests,
      sent: brief.sent,
      promised: brief.promised,
      next_step: brief.nextStep,
    },
  });
  if (error) {
    console.error('[public-bot-handover] brief insert failed:', error.message);
    return false;
  }
  await invalidateLeadCaches('recordConciergeBriefCore', { leadId: lead.id, slug: lead.slug, domain: lead.domain ?? undefined }, { activities: true });
  return true;
}

const leadPath = (lead: LeadRef) => `/leads/${lead.slug ?? lead.id}`;

/**
 * Tell the people who act on a hand-over: the lead's assigned agent (in-app + the WhatsApp
 * template when configured) and, for a Shop enquiry, the Shop domain's managers in-app (the Shop
 * lead itself is still opened by them; a sibling Shop lead from the bot is a later step).
 * Press, partner, vendor and job hand-overs alert nobody (plan Decide 5); `quiet` (a test phone)
 * alerts nobody either.
 */
export async function alertHandover(lead: LeadRef, brief: ConciergeBrief, opts: { quiet: boolean; withoutAlert: boolean }): Promise<void> {
  if (opts.quiet || opts.withoutAlert) return;
  const name = (lead.first_name ?? '').trim() || 'A prospect';
  const title = brief.promised ? `${name} is ready for a call` : `${name}: ${HANDOVER_REASONS[brief.reason]}`;
  const body = [brief.summary, brief.inTheirWords ? `In their words: ${brief.inTheirWords}` : null, brief.promised ? `Promised: ${brief.promised}` : null]
    .filter(Boolean)
    .join('\n')
    .slice(0, 900);

  const tasks: Promise<unknown>[] = [];
  if (lead.assigned_to) {
    const agentId = lead.assigned_to;
    tasks.push(createNotification({ recipient_id: agentId, type: 'system', title, body, action_url: leadPath(lead) }));
    tasks.push(
      (async () => {
        const { data } = await createAdminClient().from('profiles').select('phone, full_name').eq('id', agentId).maybeSingle();
        const agent = data as { phone: string | null; full_name: string | null } | null;
        if (!agent?.phone) return;
        await sendHandoverAlertTemplate({
          agentPhone: agent.phone,
          agentFirstName: (agent.full_name ?? '').split(' ')[0] || 'there',
          prospectName: name,
          brief: [brief.summary, brief.inTheirWords ? `In their words: ${brief.inTheirWords}` : null].filter(Boolean).join(' | '),
          promised: brief.promised ?? `A call ${PUBLIC_BOT_CALL_WINDOW}`,
          leadId: lead.id,
          agentId,
        });
      })(),
    );
  }
  if (brief.business === 'shop') {
    const managers = await getDomainDecisionMakers<{ id: string }>('shop', ['manager']);
    for (const m of managers) {
      tasks.push(createNotification({ recipient_id: m.id, type: 'system', title: `${name} asked about Indulge Shop`, body, action_url: leadPath(lead) }));
    }
  }
  await Promise.allSettled(tasks);
}

/** An existing member wrote to the public number: their queen hears about it, in-app. */
export async function alertMemberQueen(member: { id: string; full_name: string | null; queendom_id: string | null }, firstMessage: string): Promise<void> {
  const seats = await getQueendomSeats(member.queendom_id);
  const recipients = [seats.queen, ...seats.bishops].filter((x): x is string => !!x);
  await Promise.allSettled(
    recipients.map((id) =>
      createNotification({
        recipient_id: id,
        type: 'system',
        title: `${member.full_name ?? 'A member'} wrote to the public Indulge number`,
        body: firstMessage.slice(0, 400),
        action_url: `/members/${member.id}`,
      }),
    ),
  );
}

/**
 * Who answers a public-line chat (0252): `bot` hands it back to the concierge (bot_active on,
 * bot_state active), `team` keeps it with people (bot_active off). An opted-out chat stays opted
 * out. The caller has already checked the person may open this conversation.
 */
export async function setPublicChatHandlerCore(conversationId: string, handler: 'bot' | 'team', profileId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await giaDb(createAdminClient())
    .from('whatsapp_conversations')
    .update(
      handler === 'bot'
        ? { bot_active: true, bot_state: 'active', bot_paused_by: null, bot_paused_at: null, updated_at: now }
        : { bot_active: false, bot_paused_by: profileId, bot_paused_at: now, updated_at: now },
    )
    .eq('id', conversationId)
    .neq('bot_state', 'opted_out')
    .select('id')
    .maybeSingle();
  if (error) console.error('[public-bot-handover] handler change failed:', error.message);
  return !error && !!data;
}

/** One correction from the inbox: what she said, what she should have said (the Teach queue). */
export async function recordBotCorrectionCore(input: {
  messageId: string;
  conversationId: string;
  leadId: string;
  whatSheSaid: string;
  shouldHaveSaid: string;
  note: string | null;
  createdBy: string;
}): Promise<boolean> {
  const { error } = await createAdminClient().from('bot_corrections').insert({
    message_id: input.messageId,
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    what_she_said: input.whatSheSaid,
    should_have_said: input.shouldHaveSaid,
    note: input.note,
    created_by: input.createdBy,
  });
  if (error) console.error('[public-bot-handover] correction not saved:', error.message);
  return !error;
}

export type BotCorrectionRow = {
  id: string;
  what_she_said: string;
  should_have_said: string;
  note: string | null;
  status: string;
  created_at: string;
  lead_id: string | null;
};

/** The open corrections, newest first (the Teach queue on the library page). */
export async function listOpenBotCorrections(limit = 50): Promise<BotCorrectionRow[]> {
  const { data } = await createAdminClient()
    .from('bot_corrections')
    .select('id, what_she_said, should_have_said, note, status, created_at, lead_id')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as BotCorrectionRow[];
}

/** Close a correction once it became a pack edit (applied) or was not a mistake (dismissed). */
export async function resolveBotCorrectionCore(id: string, status: 'applied' | 'dismissed', profileId: string, note: string | null): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('bot_corrections')
    .update({ status, resolved_by: profileId, resolved_at: new Date().toISOString(), resolution_note: note })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  return !error && !!data;
}

/** The text of one bot message in a conversation (null when it is not the bot's). */
export async function getBotMessageText(conversationId: string, messageId: string): Promise<{ text: string; leadId: string } | null> {
  const { data } = await giaDb(createAdminClient())
    .from('whatsapp_messages')
    .select('content, lead_id, is_bot')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  const row = data as { content: string | null; lead_id: string; is_bot: boolean } | null;
  if (!row || !row.is_bot) return null;
  return { text: row.content ?? '', leadId: row.lead_id };
}
