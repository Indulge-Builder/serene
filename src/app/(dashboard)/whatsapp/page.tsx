import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getConversations, getUnreadCount } from "@/lib/services/whatsapp-service";
import { WhatsAppShell } from "@/components/whatsapp/WhatsAppShell";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";
import { parseWhatsAppPeriodFromSearchParams } from "@/lib/utils/whatsapp-period";

export const metadata = { title: "WhatsApp" };

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
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 lg:p-8">
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
