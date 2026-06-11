import { getConversationByLeadId, getMessages } from '@/lib/services/whatsapp-service';
import { LeadWhatsAppCard } from '@/components/leads/LeadWhatsAppCard';

type Props = {
  leadId:        string;
  leadPhone:     string | null;
  leadName:      string;
  callerProfile: { id: string; role: string };
};

/**
 * Async server component — direct child of <Suspense>. The conversation →
 * messages hop is inherently serial (messages need the conversation id);
 * keeping it inside this boundary takes it off the page's critical path
 * (perf audit 2026-06-11 item B — getMessages was a third blocking wave).
 */
export async function LeadWhatsAppCardAsync({ leadId, leadPhone, leadName, callerProfile }: Props) {
  const conversation = await getConversationByLeadId(leadId);
  const messages = conversation
    ? await getMessages(conversation.id, { limit: 30 })
    : [];

  return (
    <LeadWhatsAppCard
      leadId={leadId}
      leadPhone={leadPhone}
      leadName={leadName}
      callerProfile={callerProfile}
      initialConversation={conversation}
      initialMessages={messages}
    />
  );
}
