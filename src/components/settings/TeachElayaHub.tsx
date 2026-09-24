// TeachElayaHub — the doors to teaching Elaya (2026-09-22; Requests added 2026-09-25): Training (what
// she can show and say to customers), Playbooks (how she answers the team), Requests (what the team
// told her she got wrong), Exam (how well she does).
// Display-only (A-06): a server component of links and copy; every door's page owns its own
// data and its own gate. Tokens only.
import Link from "next/link";
import { GraduationCap, BookOpen, ClipboardCheck, MessageSquareWarning, ChevronRight, type LucideIcon } from "lucide-react";
import { ELAYA_PLAYBOOKS_PATH, ELAYA_TRAINING_PATH } from "@/lib/constants/elaya";
import { ELAYA_REQUESTS_PATH } from "@/lib/constants/elaya-memory";

type Door = {
  icon: LucideIcon;
  title: string;
  oneLine: string;
  does: string[];
  who: string;
  href: string | null;
  soon?: string;
};

const DOORS: Door[] = [
  {
    icon: GraduationCap,
    title: "Training",
    oneLine: "What Elaya can show and say to customers.",
    does: [
      "A library of brochures, work examples, testimonials, reviews, podcasts, images, videos, documents, company facts and links, per domain.",
      "When a new lead replies on WhatsApp, Elaya sends the right material from here.",
      "Nothing in this library changes how she answers the team.",
    ],
    who: "Managers curate their own domain; admin and founder see every domain.",
    href: ELAYA_TRAINING_PATH,
  },
  {
    icon: BookOpen,
    title: "Playbooks",
    oneLine: "How Elaya answers the team.",
    does: [
      "One playbook per kind of question: example questions the way people really ask, and the method in plain words (which time window, which records, which tools, what to lead with).",
      "Speak it or type it; Elaya drafts it; you approve it. Live on the next message, no deploy.",
      "A playbook is a method, never a source of facts: every number still comes from her tools.",
    ],
    who: "Admin and founder.",
    href: ELAYA_PLAYBOOKS_PATH,
  },
  {
    icon: MessageSquareWarning,
    title: "Requests",
    oneLine: "What the team told Elaya she got wrong.",
    does: [
      "When someone corrects her about the system (a wrong number, the wrong time frame, something she says she cannot do), she still answers the corrected question and logs the request here with the question, her answer and her own guess at the cause.",
      "Decide each one: fixed, declined, or turned into a playbook, with a note. Open ones are shown to her as known issues so she stops repeating them; your note is what she reads once it is fixed.",
      "How each person likes things (tone, length, name, language) is not here: that is remembered per person, on their profile.",
    ],
    who: "Admin and founder.",
    href: ELAYA_REQUESTS_PATH,
  },
  {
    icon: ClipboardCheck,
    title: "Exam",
    oneLine: "How well Elaya does, before a change ships.",
    does: [
      "Real questions from the team, replayed against the brain: right route, right tools, a time window stated, no all-time totals, no apology for a true answer, numbers that match the tool.",
      "Every playbook's example questions join the exam automatically.",
      "A brain that scores lower than the last one does not ship.",
    ],
    who: "Runs from the engineering side today; the in-app view is next.",
    href: null,
    soon: "Not in the app yet",
  },
];

export function TeachElayaHub() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-6)" }}>
      {DOORS.map((d) => {
        const Icon = d.icon;
        const body = (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "var(--radius-md)",
                background: "var(--theme-accent-surface)",
                color: "var(--neu-accent-deep)",
                flexShrink: 0,
              }}>
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)", color: "var(--theme-text-primary)", lineHeight: "var(--leading-snug)" }}>{d.title}</span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--theme-text-secondary)" }}>{d.oneLine}</span>
              </span>
              {d.soon && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: "var(--text-2xs)",
                  padding: "2px var(--space-2)",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--theme-paper-border)",
                  color: "var(--theme-text-tertiary)",
                  whiteSpace: "nowrap",
                }}>{d.soon}</span>
              )}
            </div>
            <ul style={{
              margin: 0,
              paddingLeft: "1.1rem",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              fontSize: "var(--text-sm)",
              color: "var(--theme-text-primary)",
              lineHeight: "var(--leading-normal)",
            }}>
              {d.does.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", marginTop: "auto" }}>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--theme-text-tertiary)" }}>{d.who}</span>
              {d.href && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-sm)", color: "var(--neu-accent-deep)", whiteSpace: "nowrap" }}>
                  Open <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                </span>
              )}
            </div>
          </>
        );
        const card: React.CSSProperties = {
          display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-6)", minHeight: 260,
          borderRadius: "var(--radius-lg)", border: "1px solid var(--theme-paper-border)", background: "var(--theme-paper)", boxShadow: "var(--shadow-1)",
          color: "inherit", textDecoration: "none", opacity: d.href ? 1 : 0.85,
        };
        return d.href ? (
          <Link key={d.title} href={d.href} className="serene-pressable" style={card}>{body}</Link>
        ) : (
          <div key={d.title} style={card}>{body}</div>
        );
      })}
    </div>
  );
}
