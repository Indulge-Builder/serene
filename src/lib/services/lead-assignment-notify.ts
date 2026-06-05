// SERVER ONLY — do not import in client components.
// Single orchestrator for all lead-assignment side-effects.
// Every code path that assigns a lead (webhook ingestion, WhatsApp ingestion,
// assignLead action, createManualLead action) calls notifyLeadAssigned() and
// performs no direct WhatsApp / in-app / SLA calls of its own.
//
// Failure isolation: each of the four side-effects is individually wrapped so
// one failure never prevents the others or blocks the HTTP response.

import {
  sendLeadAssignmentNotification,
  sendFounderLeadNotification,
} from '@/lib/services/whatsapp-api';
import { createNotification } from '@/lib/services/notifications-service';

export interface LeadAssignedNotifyInput {
  leadId: string;
  assignedTo: string | null;   // null = no agent available
  agentName: string | null;    // null when unassigned
  leadName: string;
  leadPhone: string;
  domain: string;
  isNew: boolean;              // false for duplicate resubmissions
  isDuplicate: boolean;
  actorId?: string | null;     // who triggered it; suppress self-notify when actor === assignedTo
  scheduleSla: boolean;        // false for duplicates (existing timers already running)
  leadStatus?: string;         // current lead status for SLA scheduling; defaults to 'new'
  assignedAt?: string;         // ISO timestamp of assignment; defaults to now
}

// ─────────────────────────────────────────────
// notifyLeadAssigned
// Fires four side-effects in order. Each is fire-and-forget; none blocks the caller.
// Order:
//   1. Agent WhatsApp  — only when assignedTo is set
//   2. Founder WhatsApp — always on new leads; suppressed for duplicates
//   3. In-app notification — only when assignedTo is set AND assignedTo !== actorId
//   4. SLA timers — only when scheduleSla is true AND assignedTo is set
// ─────────────────────────────────────────────

export async function notifyLeadAssigned(input: LeadAssignedNotifyInput): Promise<void> {
  const {
    leadId,
    assignedTo,
    agentName,
    leadName,
    leadPhone,
    domain,
    isDuplicate,
    actorId,
    scheduleSla,
    leadStatus = 'new',
    assignedAt,
  } = input;

  // 1. Agent WhatsApp
  if (assignedTo) {
    void sendLeadAssignmentNotification(
      assignedTo,
      leadName,
      leadPhone,
      domain,
      leadId,
    ).catch((err) => {
      console.error('[lead-assignment-notify] agent WhatsApp failed (non-fatal):', err);
    });
  }

  // 2. Founder WhatsApp — suppressed for duplicates (no new lead entered the system)
  if (!isDuplicate) {
    void sendFounderLeadNotification(
      domain,
      agentName ?? 'Unassigned',
      leadName,
      leadPhone,
      leadId,
    ).catch((err) => {
      console.error('[lead-assignment-notify] founder WhatsApp failed (non-fatal):', err);
    });
  }

  // 3. In-app notification — skip self-notify (actor assigning to themselves)
  if (assignedTo && assignedTo !== actorId) {
    createNotification({
      recipient_id: assignedTo,
      type: 'lead_assigned',
      title: 'New lead assigned to you',
      body: actorId ? null : 'Assigned automatically',
      action_url: `/leads/${leadId}`,
    }).catch(() => {});
  }

  // 4. SLA timers
  if (scheduleSla && assignedTo) {
    const resolvedAssignedAt = assignedAt ?? new Date().toISOString();
    const { scheduleSlaTimersForLead } = await import('@/lib/actions/sla');
    scheduleSlaTimersForLead({
      leadId,
      status: leadStatus,
      assignedAt: resolvedAssignedAt,
      assignedTo,
      domain,
    }).catch((err) => {
      console.error('[lead-assignment-notify] SLA scheduling failed (non-fatal):', err);
    });
  }
}
