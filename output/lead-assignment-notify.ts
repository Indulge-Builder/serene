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
// Fires four side-effects. The two outward WhatsApp sends are AWAITED so this
// function does not resolve until Gupshup has accepted (or rejected) each message.
//
// WHY AWAITED (Vercel): on serverless, the function instance is frozen/killed the
// instant the HTTP response is flushed. A `void fetch().catch()` here would be
// orphaned mid-flight — the message never reaches Gupshup and logNotification
// never runs (no log row written). Callers MUST run this inside `after()` (Next 16)
// so the response is sent immediately while Vercel keeps the lambda alive until
// these awaited sends settle. Awaiting without `after()` would delay the response;
// `after()` without awaiting here would kill the sends. Both halves are required.
//
// Order:
//   1. Agent WhatsApp  — only when assignedTo is set                (awaited)
//   2. Founder WhatsApp — always on new leads; suppressed for dups  (awaited)
//   3. In-app notification — only when assignedTo is set AND !== actorId
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

  // 1 + 2. Outward WhatsApp sends — AWAITED so they complete before this function
  // resolves (see header note: required for survival inside Vercel `after()`).
  // Run in parallel; allSettled isolates failures so one send never aborts the other.
  // Each send function already swallows its own errors and logs internally, so a
  // rejection here is unexpected — log it but never throw.
  const whatsappSends: Promise<unknown>[] = [];

  // 1. Agent WhatsApp — only when an agent was assigned
  if (assignedTo) {
    whatsappSends.push(
      sendLeadAssignmentNotification(
        assignedTo,
        leadName,
        leadPhone,
        domain,
        leadId,
      ),
    );
  }

  // 2. Founder WhatsApp — always on new leads; suppressed for duplicates
  if (!isDuplicate) {
    whatsappSends.push(
      sendFounderLeadNotification(
        domain,
        agentName ?? 'Unassigned',
        leadName,
        leadPhone,
        leadId,
      ),
    );
  }

  if (whatsappSends.length > 0) {
    const results = await Promise.allSettled(whatsappSends);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[lead-assignment-notify] WhatsApp send rejected (non-fatal):', r.reason);
      }
    }
  }

  // 3. In-app notification — skip self-notify (actor assigning to themselves)
  if (assignedTo && assignedTo !== actorId) {
    createNotification({
      recipient_id: assignedTo,
      type: 'lead_assigned',
      title: 'New lead assigned to you',
      body: actorId ? undefined : 'Assigned automatically',
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
