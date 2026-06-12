import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  countUserMessagesToday,
  getConversationMessages,
  getOrCreateActiveConversation,
} from '@/lib/services/elaya-service';
import { getDailyMessageCap, getSessionExpiryHours } from '@/lib/services/llm-providers-service';
import { getElayaTimeGreeting, pickElayaDailyLine } from '@/lib/constants/elaya';
import { ElayaChatShell } from '@/components/elaya/ElayaChatShell';
import type { ElayaUiMessage } from '@/components/elaya/ElayaMessageBubble';

// /elaya — Elaya's chat surface (all roles; '/elaya' is in ALWAYS_ALLOWED_PREFIXES).
// Server Component: resolves the active conversation (24h server-side expiry),
// seeds the transcript, and computes the deterministic greeting. Streaming
// happens client-side against POST /api/elaya/chat.
export default async function ElayaPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const expiryHours = await getSessionExpiryHours();
  const conversation = await getOrCreateActiveConversation(profile.id, expiryHours);

  const [rows, sentToday, cap] = await Promise.all([
    getConversationMessages(conversation.id),
    countUserMessagesToday(profile.id),
    getDailyMessageCap(),
  ]);

  const initialMessages: ElayaUiMessage[] = rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

  const now = new Date();
  const firstName = profile.full_name.split(' ')[0] ?? profile.full_name;
  const dailyLine = pickElayaDailyLine(profile.id, now);
  const greeting = `${getElayaTimeGreeting(now)}, ${firstName}. ${dailyLine}`;

  return (
    // flex column + min-h-0 so ElayaChatShell can flex-fill the remaining
    // paper height exactly — no dvh offset math, no bottom gap.
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="type-page-title m-0">
          Elaya<span className="page-title-dot">.</span>
        </h1>
      </div>

      <ElayaChatShell
        conversationId={conversation.id}
        initialMessages={initialMessages}
        greeting={greeting}
        remainingToday={Math.max(0, cap - sentToday)}
      />
    </main>
  );
}
