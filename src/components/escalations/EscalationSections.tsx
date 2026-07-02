"use client";

/**
 * EscalationSections — the three /escalations lists (display-only, A-06).
 *
 * Each section is a paper card wrapping Table<T> (the sanctioned secondary/
 * reporting table). Rows navigate to the lead dossier. Data arrives fully
 * shaped from sla-service escalation reads — no fetching here.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, UserRound, UserCog, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Table } from "@/components/ui/Table";
import type { TableColumn } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from "@/lib/constants/lead-statuses";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { formatDate, formatRelativeTime } from "@/lib/utils/dates";
import type {
  EscalatedLeadRow,
  OverdueTaskEscalationRow,
  GoingColdLeadRow,
} from "@/lib/services/sla-service";
import type { LeadStatus, AppDomain, SlaRecipientRole } from "@/lib/types/database";

// ── Shared bits ──────────────────────────────────────────────────────────────

function CountPill({ count }: { count: number }) {
  return (
    <span
      style={{
        minWidth:       "20px",
        height:         "20px",
        padding:        "0 6px",
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        borderRadius:   "var(--radius-full)",
        background:     count > 0 ? "var(--theme-accent-surface)" : "var(--theme-paper)",
        border:         "1px solid var(--theme-paper-border)",
        fontFamily:     "var(--font-mono)",
        fontSize:       "var(--text-2xs)",
        fontWeight:     "var(--weight-semibold)",
        color:          count > 0 ? "var(--theme-accent)" : "var(--theme-text-tertiary)",
      }}
    >
      {count}
    </span>
  );
}

function LeadStatusPill({ status }: { status: string }) {
  const variant = LEAD_STATUS_BADGE[status as LeadStatus];
  const label   = LEAD_STATUS_LABELS[status as LeadStatus] ?? status;
  return <span className={`status-pill status-pill--${variant ?? "neutral"}`}>{label}</span>;
}

function NameCell({ name, phone }: { name: string; phone?: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          margin:       0,
          fontSize:     "var(--text-sm)",
          fontWeight:   "var(--weight-medium)",
          color:        "var(--theme-text-primary)",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}
      >
        {name}
      </p>
      {phone && (
        <p
          style={{
            margin:     "1px 0 0",
            fontFamily: "var(--font-mono)",
            fontSize:   "var(--text-2xs)",
            color:      "var(--theme-text-tertiary)",
          }}
        >
          {phone}
        </p>
      )}
    </div>
  );
}

const secondaryCell: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color:    "var(--theme-text-secondary)",
};
const tertiaryCell: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color:    "var(--theme-text-tertiary)",
};

function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain as AppDomain] ?? domain;
}

// ── Alerted recipients ───────────────────────────────────────────────────────
// Who a live breach escalates to. The escalation ladder reads agent → manager →
// founder; each role gets a quiet pill with its own glyph. In the agent self-
// view, the agent's own pill becomes the accent-tinted "You" — a soft cue that
// this slip is on their desk, and who else is now watching it.

const RECIPIENT_META: Record<SlaRecipientRole, { label: string; Icon: LucideIcon }> = {
  agent:   { label: "Agent",   Icon: UserRound },
  manager: { label: "Manager", Icon: UserCog   },
  founder: { label: "Founder", Icon: Crown     },
};

function RecipientChips({
  roles,
  selfView,
}: {
  roles:    SlaRecipientRole[];
  selfView: boolean;
}) {
  if (roles.length === 0) {
    // No status-policy recipients matched (rare) — keep the cell honest.
    return <span style={tertiaryCell}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
      {roles.map((role) => {
        const { label, Icon } = RECIPIENT_META[role];
        const isSelf = selfView && role === "agent";
        return (
          <span
            key={role}
            title={isSelf ? "You were alerted" : `${label} alerted`}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          "4px",
              padding:      "2px 8px 2px 6px",
              borderRadius: "var(--radius-full)",
              border:       `1px solid ${isSelf ? "var(--theme-accent-muted)" : "var(--theme-paper-border)"}`,
              background:   isSelf ? "var(--theme-accent-surface)" : "var(--theme-paper-subtle)",
              color:        isSelf ? "var(--theme-accent)" : "var(--theme-text-secondary)",
              fontSize:     "var(--text-2xs)",
              fontWeight:   "var(--weight-medium)",
              lineHeight:   1,
              whiteSpace:   "nowrap",
            }}
          >
            <Icon style={{ width: "11px", height: "11px", strokeWidth: 1.5 }} aria-hidden />
            {isSelf ? "You" : label}
          </span>
        );
      })}
    </div>
  );
}

// ── SLA breaches ─────────────────────────────────────────────────────────────

export function EscalatedLeadsSection({
  rows,
  showDomain,
  selfView = false,
}: {
  rows:       EscalatedLeadRow[];
  showDomain: boolean;
  selfView?:  boolean;
}) {
  const router = useRouter();

  const columns: TableColumn<EscalatedLeadRow>[] = [
    { id: "lead", header: "Lead", cell: (r) => <NameCell name={r.name} phone={r.phone} /> },
    { id: "status", header: "Status", cell: (r) => <LeadStatusPill status={r.status} /> },
    // The Agent column is noise in the self-view — every row is the viewer.
    ...(selfView
      ? []
      : [{ id: "agent", header: "Agent", cell: (r: EscalatedLeadRow) => <span style={secondaryCell}>{r.assigneeName ?? "Unassigned"}</span> }]),
    { id: "fired", header: "Stalled since", cell: (r) => <span style={tertiaryCell}>{formatRelativeTime(r.lastFiredAt)}</span> },
    { id: "alerted", header: "Alerted", cell: (r) => <RecipientChips roles={r.recipients} selfView={selfView} /> },
    ...(showDomain
      ? [{ id: "domain", header: "Domain", cell: (r: EscalatedLeadRow) => <span style={tertiaryCell}>{domainLabel(r.domain)}</span> }]
      : []),
  ];

  return (
    <SectionCard
      title={selfView ? "Leads that slipped" : "SLA breaches — live"}
      headerRight={<CountPill count={rows.length} />}
      bodyPadding={false}
    >
      {rows.length === 0 ? (
        <EmptyState variant="inline" title={selfView ? "None of your leads are breaching right now." : "Nothing is breaching right now."} />
      ) : (
        <Table<EscalatedLeadRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.leadId}
          onRowClick={(r) => router.push(`/leads/${r.slug ?? r.leadId}`)}
        />
      )}
    </SectionCard>
  );
}

// ── Overdue follow-up tasks ──────────────────────────────────────────────────

export function OverdueTasksSection({
  rows,
  showDomain,
  selfView = false,
}: {
  rows:       OverdueTaskEscalationRow[];
  showDomain: boolean;
  selfView?:  boolean;
}) {
  const router = useRouter();

  const columns: TableColumn<OverdueTaskEscalationRow>[] = [
    {
      id: "task",
      header: "Task",
      cell: (r) => (
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--theme-text-primary)" }}>
          {r.title}
        </span>
      ),
    },
    { id: "lead", header: "Lead", cell: (r) => <span style={secondaryCell}>{r.leadName}</span> },
    ...(selfView
      ? []
      : [{ id: "agent", header: "Agent", cell: (r: OverdueTaskEscalationRow) => <span style={secondaryCell}>{r.assigneeName ?? "Unassigned"}</span> }]),
    {
      id: "due",
      header: "Was due",
      cell: (r) => <span style={tertiaryCell}>{r.dueAt ? formatDate(r.dueAt, "dd MMM, h:mm a") : "—"}</span>,
    },
    { id: "overdue", header: "Overdue", cell: (r) => <span style={tertiaryCell}>{formatRelativeTime(r.overdueAt)}</span> },
    ...(showDomain
      ? [{ id: "domain", header: "Domain", cell: (r: OverdueTaskEscalationRow) => <span style={tertiaryCell}>{domainLabel(r.leadDomain)}</span> }]
      : []),
  ];

  return (
    <SectionCard
      title={selfView ? "Your overdue follow-ups" : "Overdue follow-up tasks"}
      headerRight={<CountPill count={rows.length} />}
      bodyPadding={false}
    >
      {rows.length === 0 ? (
        <EmptyState variant="inline" title={selfView ? "No follow-up of yours has slipped past due." : "No follow-up has slipped past due."} />
      ) : (
        <Table<OverdueTaskEscalationRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.taskId}
          onRowClick={(r) => router.push(`/leads/${r.leadSlug ?? r.leadId}`)}
        />
      )}
    </SectionCard>
  );
}

// ── Going cold ───────────────────────────────────────────────────────────────

export function GoingColdSection({
  rows,
  showDomain,
  selfView = false,
}: {
  rows:       GoingColdLeadRow[];
  showDomain: boolean;
  selfView?:  boolean;
}) {
  const router = useRouter();

  const columns: TableColumn<GoingColdLeadRow>[] = [
    { id: "lead", header: "Lead", cell: (r) => <NameCell name={r.name} phone={r.phone} /> },
    { id: "status", header: "Status", cell: (r) => <LeadStatusPill status={r.status} /> },
    ...(selfView
      ? []
      : [{ id: "agent", header: "Agent", cell: (r: GoingColdLeadRow) => <span style={secondaryCell}>{r.assigneeName ?? "Unassigned"}</span> }]),
    {
      id: "activity",
      header: "Last activity",
      cell: (r) => (
        <span style={tertiaryCell}>
          {r.lastActivityAt ? formatRelativeTime(r.lastActivityAt) : "Never"}
        </span>
      ),
    },
    ...(showDomain
      ? [{ id: "domain", header: "Domain", cell: (r: GoingColdLeadRow) => <span style={tertiaryCell}>{domainLabel(r.domain)}</span> }]
      : []),
  ];

  return (
    <SectionCard
      title="Going cold"
      bodyPadding={false}
      headerRight={
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <CountPill count={rows.length} />
          <Link
            href="/leads?going_cold=true"
            className="serene-icon-lift-hover"
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              gap:            "var(--space-1)",
              fontFamily:     "var(--font-sans)",
              fontSize:       "var(--text-xs)",
              color:          "var(--theme-text-secondary)",
              textDecoration: "none",
            }}
          >
            Open in Leads
            <ArrowUpRight style={{ width: "12px", height: "12px", strokeWidth: 1.5 }} />
          </Link>
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState variant="inline" title={selfView ? "Every one of your active leads has recent movement." : "Every active lead has recent movement."} />
      ) : (
        <Table<GoingColdLeadRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.leadId}
          onRowClick={(r) => router.push(`/leads/${r.slug ?? r.leadId}`)}
        />
      )}
    </SectionCard>
  );
}
