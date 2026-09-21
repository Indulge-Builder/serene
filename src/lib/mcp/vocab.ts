// vocab.ts — THE vocabulary document the connector publishes as a resource (serene://vocab).
//
// Pure: constants in, one JSON object out. The model reads it once so the filters it writes
// (a lead status, a ticket state, a domain) are valid words, not guesses. Every list here is the
// SAME constant the app and the SQL CHECKs read; nothing is re-typed. Add a vocabulary = one line.

import { APP_DOMAINS, DOMAIN_LABELS } from '@/lib/constants/domains';
import { USER_ROLES, ROLE_LABELS } from '@/lib/constants/roles';
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/constants/task-constants';
import {
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_ORIGINS,
  TICKET_RESOLUTIONS,
} from '@/lib/constants/tickets';
import { VENDOR_STATUS_LABELS, PREFERENCE_STANCE_LABELS, ENGAGEMENT_OUTCOME_LABELS } from '@/lib/constants/vendors';
import { CLIENT_FACETS, CLIENT_TIERS, CLIENT_STATUSES } from '@/lib/constants/member-facets';
import { SIA_ROLES } from '@/lib/constants/sia-roles';

type Labelled = Record<string, string>;

function labelsOf(def: { labels: Labelled }): Labelled {
  return { ...def.labels };
}

export function buildVocabDocument() {
  return {
    about:
      'The words Serene uses. Filter and compare with these exact values. Timestamps are UTC; India is UTC+5:30. Money is INR.',
    domains: Object.fromEntries(APP_DOMAINS.map((d) => [d, DOMAIN_LABELS[d]])),
    roles: Object.fromEntries(USER_ROLES.map((r) => [r, ROLE_LABELS[r]])),
    sia_positions: labelsOf(SIA_ROLES),
    leads: {
      statuses: Object.fromEntries(LEAD_STATUSES.map((s) => [s, LEAD_STATUS_LABELS[s]])),
      call_outcomes: Object.fromEntries(CALL_OUTCOMES.map((o) => [o, CALL_OUTCOME_LABELS[o]])),
    },
    tasks: {
      statuses: Object.fromEntries(Object.entries(TASK_STATUS).map(([k, v]) => [k, v.label])),
      priorities: Object.fromEntries(Object.entries(TASK_PRIORITY).map(([k, v]) => [k, v.label])),
    },
    tickets: {
      statuses: labelsOf(TICKET_STATUSES),
      transitions: TICKET_TRANSITIONS,
      priorities: labelsOf(TICKET_PRIORITIES),
      categories: labelsOf(TICKET_CATEGORIES),
      origins: labelsOf(TICKET_ORIGINS),
      resolutions: labelsOf(TICKET_RESOLUTIONS),
    },
    vendors: {
      statuses: { ...VENDOR_STATUS_LABELS },
      preference_stances: { ...PREFERENCE_STANCE_LABELS },
      job_outcomes: { ...ENGAGEMENT_OUTCOME_LABELS },
    },
    members: {
      tiers: labelsOf(CLIENT_TIERS),
      statuses: labelsOf(CLIENT_STATUSES),
      fact_facets: labelsOf(CLIENT_FACETS),
    },
  };
}
