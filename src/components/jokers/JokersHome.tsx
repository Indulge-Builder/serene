import Link from "next/link";
import { ArrowRight, Activity, Send } from "lucide-react";
import { JOKERS_ACTIVITY_PATH, JOKERS_RE_PATH } from "@/lib/constants/joker-engagement";

const BOARDS = [
  { href: JOKERS_RE_PATH, label: "Recommendations & Engagement", icon: Send },
  { href: JOKERS_ACTIVITY_PATH, label: "Activity", icon: Activity },
];

/**
 * The Jokers page (owner, 2026-09-28): two compact blocks side by side, title only, no data.
 * A block opens its dashboard. Display only.
 */
export function JokersHome() {
  return (
    <nav aria-label="Jokers dashboards" className="grid grid-cols-1 sm:grid-cols-[repeat(2,minmax(0,22.5rem))] gap-3">
      {BOARDS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="serene-stat-tile--action" style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "var(--space-3)",
          padding:        "var(--space-3) var(--space-4)",
          borderRadius:   "var(--neu-radius-tile)",
          border:         "1px solid var(--theme-paper-border)",
          background:     "var(--theme-paper)",
          boxShadow:      "var(--shadow-1)",
          color:          "var(--theme-text-primary)",
          textDecoration: "none",
        }}>
          <span aria-hidden="true" style={{
            width:          "2.125rem",
            height:         "2.125rem",
            flexShrink:     0,
            display:        "grid",
            placeItems:     "center",
            borderRadius:   "var(--radius-md)",
            background:     "var(--neu-accent-gradient)",
            color:          "var(--theme-accent-fg)",
            boxShadow:      "var(--neu-shadow-chip)",
          }}>
            <Icon style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
          </span>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <ArrowRight aria-hidden="true" style={{ marginLeft: "auto", width: 16, height: 16, strokeWidth: 1.5, color: "var(--theme-text-tertiary)", flexShrink: 0 }} />
        </Link>
      ))}
    </nav>
  );
}
