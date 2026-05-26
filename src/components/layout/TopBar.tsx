import { LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import type { Profile } from "@/lib/types/database";

type TopBarProps = {
  profile: Profile | null;
  title?: string;
};

export function TopBar({ profile, title }: TopBarProps) {
  return (
    <header
      style={{
        height:               "56px",
        borderBottom:         "1px solid var(--theme-paper-border)",
        background:           "var(--theme-paper)",
        display:              "flex",
        alignItems:           "center",
        justifyContent:       "space-between",
        paddingLeft:          "var(--space-6)",
        paddingRight:         "var(--space-6)",
        position:             "sticky",
        top:                  0,
        zIndex:               "var(--z-sticky)",
        backdropFilter:       "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {title && (
        <h1
          style={{
            fontFamily:    "var(--font-serif)",
            fontSize:      "var(--text-xl)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-tight)",
            lineHeight:    "var(--leading-tight)",
            color:         "var(--theme-text-primary)",
            margin:        0,
          }}
        >
          {title}
        </h1>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {profile && (
          <>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize:   "var(--text-sm)",
                color:      "var(--theme-text-secondary)",
              }}
            >
              {profile.full_name}
            </span>
            <div
              style={{
                width:          "32px",
                height:         "32px",
                borderRadius:   "var(--radius-full)",
                background:     "var(--theme-accent-surface)",
                border:         "1px solid var(--theme-paper-border)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontFamily:     "var(--font-sans)",
                fontSize:       "var(--text-xs)",
                fontWeight:     "var(--weight-semibold)",
                color:          "var(--theme-accent)",
                flexShrink:     0,
              }}
            >
              {profile.full_name.charAt(0).toUpperCase()}
            </div>

            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  width:        "32px",
                  height:       "32px",
                  border:       "1px solid var(--theme-paper-border)",
                  borderRadius: "var(--radius-sm)",
                  background:   "transparent",
                  color:        "var(--theme-text-tertiary)",
                  cursor:       "pointer",
                  transition:   "var(--transition-interactive)",
                  flexShrink:   0,
                }}
              >
                <LogOut style={{ width: "14px", height: "14px", strokeWidth: 1.5 }} />
              </button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
