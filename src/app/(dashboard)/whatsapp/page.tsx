import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getConversations, getUnreadCount } from "@/lib/services/whatsapp-service";
import { WhatsAppShell } from "@/components/whatsapp/WhatsAppShell";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import { parseWhatsAppPeriodFromSearchParams } from "@/lib/utils/whatsapp-period";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WhatsAppPage({ searchParams }: PageProps) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "guest") redirect("/dashboard");

  const params = await searchParams;
  const periodParams = parseWhatsAppPeriodFromSearchParams({
    get: (key) => {
      const v = params[key];
      return typeof v === "string" ? v : null;
    },
  });

  const [{ conversations }, unreadCount] = await Promise.all([
    getConversations({
      limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE,
      period:     periodParams.period ?? undefined,
      customFrom: periodParams.customFrom,
      customTo:   periodParams.customTo,
    }),
    getUnreadCount(),
  ]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <WhatsAppShell
        initialConversations={conversations}
        unreadCount={unreadCount}
        callerProfile={{
          id:         profile.id,
          full_name:  profile.full_name,
          avatar_url: profile.avatar_url,
          role:       profile.role,
        }}
      />
    </main>
  );
}
