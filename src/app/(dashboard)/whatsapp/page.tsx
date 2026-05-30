import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { getConversations, getUnreadCount } from "@/lib/services/whatsapp-service";
import { WhatsAppShell } from "@/components/whatsapp/WhatsAppShell";
import { WHATSAPP_CONVERSATIONS_PAGE_SIZE } from "@/lib/constants/whatsapp";

export default async function WhatsAppPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "guest") redirect("/dashboard");

  const [{ conversations }, unreadCount] = await Promise.all([
    getConversations({ limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE }),
    getUnreadCount(),
  ]);

  return (
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
  );
}
