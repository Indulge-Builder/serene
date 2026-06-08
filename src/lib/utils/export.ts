// CLIENT-SIDE ONLY — never import this file from a server action or service.
// xlsx is dynamically imported to avoid server bundle inclusion.

import { formatDate } from "@/lib/utils/dates";
import {
  LEAD_EXPORT_HEADERS,
  ACTIVITY_EXPORT_HEADERS,
  NOTE_EXPORT_HEADERS,
  type ExportHeader,
} from "@/lib/constants/export-columns";
import type {
  LeadExportItem,
  LeadActivityWithActor,
  LeadNoteWithAuthor,
} from "@/lib/services/leads-service";

// ─────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────
export type ExportRow = Record<string, string | number | null>;

// ─────────────────────────────────────────────
// Lead → flat row
// ─────────────────────────────────────────────
function leadToRow(lead: LeadExportItem): ExportRow {
  const personal = (lead.personal_details ?? {}) as Record<string, string>;
  return {
    id:                lead.id,
    full_name:         [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    phone:             lead.phone ?? "",
    email:             lead.email ?? "",
    domain:            lead.domain,
    status:            lead.status,
    lead_intent:       lead.lead_intent ?? "",
    source:            lead.source ?? "",
    utm_campaign:      lead.utm_campaign ?? "",
    assigned_to_name:  lead.assignee?.full_name ?? "",
    call_count:        lead.call_count,
    last_call_outcome: lead.last_call_outcome ?? "",
    deal_amount:       lead.deal_amount != null ? String(lead.deal_amount) : "",
    deal_type:         lead.deal_type ?? "",
    deal_duration:     lead.deal_duration ?? "",
    city:              personal.city ?? "",
    company:           personal.company ?? "",
    created_at:        lead.created_at ? formatDate(lead.created_at, "dd MMM yyyy, h:mm a") : "",
    status_changed_at: lead.status_changed_at ? formatDate(lead.status_changed_at, "dd MMM yyyy, h:mm a") : "",
  };
}

function activityToRow(act: LeadActivityWithActor): ExportRow {
  return {
    lead_id:     act.lead_id,
    action_type: act.action_type,
    actor_name:  act.actor?.full_name ?? "",
    details:     act.details ? JSON.stringify(act.details) : "",
    created_at:  act.created_at ? formatDate(act.created_at, "dd MMM yyyy, h:mm a") : "",
  };
}

function noteToRow(note: LeadNoteWithAuthor): ExportRow {
  return {
    lead_id:      note.lead_id,
    content:      note.content,
    call_outcome: note.call_outcome ?? "",
    author_name:  note.author.full_name,
    created_at:   note.created_at ? formatDate(note.created_at, "dd MMM yyyy, h:mm a") : "",
  };
}

// ─────────────────────────────────────────────
// buildCSV — pure function, no imports needed
// ─────────────────────────────────────────────
function escapeCell(value: string | number | null): string {
  const str = value == null ? "" : String(value);
  // Wrap in quotes if the cell contains comma, newline, or quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCSV(rows: ExportRow[], headers: ExportHeader[]): string {
  const headerLine = headers.map((h) => escapeCell(h.label)).join(",");
  const dataLines  = rows.map((row) =>
    headers.map((h) => escapeCell(row[h.key] ?? null)).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

// ─────────────────────────────────────────────
// triggerBrowserDownload
// ─────────────────────────────────────────────
export function triggerBrowserDownload(
  filename: string,
  content: string | ArrayBuffer,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// buildXLSXWorkbook — dynamic import of xlsx (SheetJS)
// Three sheets: Leads, Activities, Notes
// ─────────────────────────────────────────────
export async function buildXLSXWorkbook(
  leads:      LeadExportItem[],
  activities: LeadActivityWithActor[],
  notes:      LeadNoteWithAuthor[],
): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");

  function makeSheet(rows: ExportRow[], headers: ExportHeader[]) {
    const headerRow = headers.map((h) => h.label);
    const dataRows  = rows.map((row) =>
      headers.map((h) => {
        const v = row[h.key];
        return v == null ? "" : v;
      }),
    );
    return XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  }

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(leads.map(leadToRow), LEAD_EXPORT_HEADERS),
    "Leads",
  );
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(activities.map(activityToRow), ACTIVITY_EXPORT_HEADERS),
    "Activities",
  );
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(notes.map(noteToRow), NOTE_EXPORT_HEADERS),
    "Notes",
  );

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

// ─────────────────────────────────────────────
// Convenience: build CSV bytes for lead sheet only
// ─────────────────────────────────────────────
export function buildLeadsCSV(leads: LeadExportItem[]): string {
  return buildCSV(leads.map(leadToRow), LEAD_EXPORT_HEADERS);
}
