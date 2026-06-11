"use client";

import { useState } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { TabSelector, type TabItem } from "@/components/ui/TabSelector";
import { SectionCard } from "@/components/ui/SectionCard";
import { CreateUserForm, type CreateUserMode } from "./CreateUserForm";

const MODE_TABS: TabItem[] = [
  { id: "password", label: "Set password"     },
  { id: "invite",   label: "Send invite link" },
];

export function NewUserClient() {
  const [mode, setMode] = useState<CreateUserMode>("password");

  return (
    <div
      className="eia-dossier-grid eia-dossier-grid--340"
      style={{ alignItems: "start" }}
    >
      {/* Left column — form */}
      <SectionCard title="Member Details">
        <CreateUserForm mode={mode} />
      </SectionCard>

      {/* Right column — onboarding mode + tips */}
      <aside
        style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "var(--space-5)",
          position:      "sticky",
          top:           "var(--space-6)",
        }}
      >
        <SectionCard
          title="Onboarding Method"
          description="Choose how this member will get access."
        >
          <TabSelector
            tabs={MODE_TABS}
            activeTab={mode}
            onChange={(id) => setMode(id as CreateUserMode)}
            variant="connected"
          />

          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              gap:           "var(--space-3)",
              marginTop:     "var(--space-5)",
              paddingTop:    "var(--space-5)",
              borderTop:     "1px solid var(--theme-paper-border)",
            }}
          >
            {mode === "password" ? (
              <>
                <ReferenceItem
                  icon={<KeyRound style={iconStyle} />}
                  title="You set a temporary password"
                  description="Share it securely with the new member. They can change it after first login."
                />
                <ReferenceItem
                  icon={<ShieldCheck style={iconStyle} />}
                  title="Role & domain"
                  description="Role controls permissions. Domain controls which leads and reports they can see. Both are audited."
                />
              </>
            ) : (
              <>
                <ReferenceItem
                  icon={<Mail style={iconStyle} />}
                  title="Magic link sent by email"
                  description="The member chooses their own password on first sign-in. No need to share a temporary credential."
                />
                <ReferenceItem
                  icon={<ShieldCheck style={iconStyle} />}
                  title="Role & domain"
                  description="Role controls permissions. Domain controls which leads and reports they can see. Both are audited."
                />
              </>
            )}
          </div>
        </SectionCard>
      </aside>
    </div>
  );
}

const iconStyle: React.CSSProperties = {
  width:       16,
  height:      16,
  strokeWidth: 1.5,
  color:       "var(--theme-accent)",
  flexShrink:  0,
};

function ReferenceItem({
  icon,
  title,
  description,
}: {
  icon:        React.ReactNode;
  title:       string;
  description: string;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
      <div style={{ paddingTop: 2 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-sm)",
            fontWeight: "var(--weight-semibold)",
            color:      "var(--theme-text-primary)",
            margin:     0,
            lineHeight: "var(--leading-tight)",
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            margin:     "var(--space-1) 0 0",
            lineHeight: "var(--leading-snug)",
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
