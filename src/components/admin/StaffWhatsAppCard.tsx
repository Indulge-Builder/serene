// StaffWhatsAppCard — the WhatsApp side of a Serene account: the contacts linked to it by phone
// (services/sia-staff-link.ts), with a "Link now" for a phone just saved. Server component +
// a small client island for the button. Display-only (A-06).
import { MessageSquare } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatRelativeTime } from "@/lib/utils/dates";
import type { StaffWhatsAppLink } from "@/lib/services/sia-staff-link";
import { LinkNowButton } from "@/components/admin/LinkNowButton";

export function StaffWhatsAppCard({ profileId, phone, links, canLink }: { profileId: string; phone: string | null; links: StaffWhatsAppLink[]; canLink: boolean }) {
  return (
    <SectionCard title="WhatsApp" description="Linked by the phone on this account. The link runs every 15 minutes, or now." headerRight={canLink ? <LinkNowButton profileId={profileId} /> : undefined}>
      {!phone ? (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--theme-text-tertiary)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
          No phone on this account yet. Add the company phone above and the WhatsApp contact links itself.
        </p>
      ) : links.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--theme-text-tertiary)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
          No WhatsApp contact with this phone has been seen in the groups yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {links.map((l) => (
            <div key={l.jid} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontSize: "var(--text-sm)" }}>
              <MessageSquare className="w-4 h-4" strokeWidth={1.5} style={{ color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ color: "var(--theme-text-primary)" }}>{l.whatsapp_name ?? "(no WhatsApp name)"}<span style={{ color: "var(--theme-text-tertiary)" }}> · {l.role}</span></span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>
                  {l.hidden_id ? "hidden id" : "phone id"} · in {l.groups} groups · seen {formatRelativeTime(l.last_seen_at)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
