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
import { ArrowUpRight } from "lucide-react";
import { Table } from "@/components/ui/Table";
import type { TableColumn } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { LEAD_STATUS_LABELS, LEAD_STATUS_BADGE } from "@/lib/constants/lead-statuses";
import { DOMAIN_LABELS } from "@/lib/constants/domains";
import { formatDate, formatRelativeTime } from "@/lib/utils/dates";
import type {
  EscalatedLeadRow,
  OverdueTaskEscalationRow,
  GoingColdLeadRow,
} from "@/lib/services/sla-service";
import type { LeadStatus, AppDomain } from "@/lib/types/database";

// ── Shared bits ──────────────────────────────────────────────────────────────

function SectionCardShell({
  title,
  count,
  action,
  children,
}: {
  title:    string;
  count:    number;
  action?:  React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
      style={{ overflow: "hidden" }}
    >
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          gap:            "var(--space-4)",
          padding:        "var(--space-4) var(--space-5)",
          borderBottom:   "1px solid var(--theme-paper-border)",
          background:     "var(--theme-paper-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span className="label-micro" style={{ color: "var(--theme-text-tertiary)" }}>
            {title}
          </span>
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
        </div>
        {action}
      </div>
      {children}
    </section>
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

// ── SLA breaches ─────────────────────────────────────────────────────────────

export function EscalatedLeadsSection({
  rows,
  showDomain,
}: {
  rows:       EscalatedLeadRow[];
  showDomain: boolean;
}) {
  const router = useRouter();

  const columns: TableColumn<EscalatedLeadRow>[] = [
    { id: "lead", header: "Lead", cell: (r) => <NameCell name={r.name} phone={r.phone} /> },
    { id: "status", header: "Status", cell: (r) => <LeadStatusPill status={r.status} /> },
    {
      id: "rules",
      header: "Breached rules",
      cell: (r) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--theme-text-secondary)" }}>
          {r.ruleCodes.join(" · ")}
        </span>
      ),
    },
    { id: "agent", header: "Agent", cell: (r) => <span style={secondaryCell}>{r.assigneeName ?? "Unassigned"}</span> },
    { id: "fired", header: "Last breach", cell: (r) => <span style={tertiaryCell}>{formatRelativeTime(r.lastFiredAt)}</span> },
    ...(showDomain
      ? [{ id: "domain", header: "Domain", cell: (r: EscalatedLeadRow) => <span style={tertiaryCell}>{domainLabel(r.domain)}</span> }]
      : []),
  ];

  return (
    <SectionCardShell title="SLA breaches — live" count={rows.length}>
      {rows.length === 0 ? (
        <EmptyState variant="inline" title="Nothing is breaching right now." />
      ) : (
        <Table<EscalatedLeadRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.leadId}
          onRowClick={(r) => router.push(`/leads/${r.slug ?? r.leadId}`)}
        />
      )}
    </SectionCardShell>
  );
}

// ── Overdue follow-up tasks ──────────────────────────────────────────────────

export function OverdueTasksSection({
  rows,
  showDomain,
}: {
  rows:       OverdueTaskEscalationRow[];
  showDomain: boolean;
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
    { id: "agent", header: "Agent", cell: (r) => <span style={secondaryCell}>{r.assigneeName ?? "Unassigned"}</span> },
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
    <SectionCardShell title="Overdue follow-up tasks" count={rows.length}>
      {rows.length === 0 ? (
        <EmptyState variant="inline" title="No follow-up has slipped past due." />
      ) : (
        <Table<OverdueTaskEscalationRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.taskId}
          onRowClick={(r) => router.push(`/leads/${r.leadSlug ?? r.leadId}`)}
        />
      )}
    </SectionCardShell>
  );
}

// ── Going cold ───────────────────────────────────────────────────────────────

export function GoingColdSection({
  rows,
  showDomain,
}: {
  rows:       GoingColdLeadRow[];
  showDomain: boolean;
}) {
  const router = useRouter();

  const columns: TableColumn<GoingColdLeadRow>[] = [
    { id: "lead", header: "Lead", cell: (r) => <NameCell name={r.name} phone={r.phone} /> },
    { id: "status", header: "Status", cell: (r) => <LeadStatusPill status={r.status} /> },
    { id: "agent", header: "Agent", cell: (r) => <span style={secondaryCell}>{r.assigneeName ?? "Unassigned"}</span> },
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
    <SectionCardShell
      title="Going cold"
      count={rows.length}
      action={
        <Link
          href="/leads?going_cold=true"
          className="eia-icon-lift-hover"
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
      }
    >
      {rows.length === 0 ? (
        <EmptyState variant="inline" title="Every active lead has recent movement." />
      ) : (
        <Table<GoingColdLeadRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.leadId}
          onRowClick={(r) => router.push(`/leads/${r.slug ?? r.leadId}`)}
        />
      )}
    </SectionCardShell>
  );
}
