import Link from 'next/link';
import { Users } from 'lucide-react';
import { DOMAIN_ICONS, getDomainLabel, isGiaDomain } from '@/lib/constants/domains';
import { LEAD_STATUS_BADGE, LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import type { SiblingLead } from '@/lib/services/lead-identity';
import type { AppDomain } from '@/lib/types/database';

type Props = {
  /** Slug (or id) of the lead being viewed: the door to a sibling's shared history. */
  ownRef: string;
  ownDomain: AppDomain;
  siblings: SiblingLead[];
};

/** Where a pill opens: the real dossier when the viewer may, else the read-only history. */
export function siblingHref(ownRef: string, sibling: SiblingLead): string {
  const ref = sibling.slug ?? sibling.id;
  return sibling.direct ? `/leads/${ref}` : `/leads/${ownRef}/also/${ref}`;
}

/**
 * THE "Also in" strip on a lead dossier (migration 0251): the same person's other leads,
 * one pill each. Another domain reads "Also in Onboarding"; an earlier lead in the same
 * domain reads "Earlier in Legacy". Display only; renders nothing without siblings.
 */
export function LeadSiblingPills({ ownRef, ownDomain, siblings }: Props) {
  if (siblings.length === 0) return null;

  return (
    <div
      style={{
        display:      'flex',
        flexWrap:     'wrap',
        alignItems:   'center',
        gap:          'var(--space-2) var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}
    >
      {siblings.map((sibling) => {
        const Icon = isGiaDomain(sibling.domain) ? DOMAIN_ICONS[sibling.domain] : Users;
        const lead = sibling.domain === ownDomain ? 'Earlier in' : 'Also in';
        return (
          <Link
            key={sibling.id}
            href={siblingHref(ownRef, sibling)}
            className="serene-roster-chip serene-touch"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            'var(--space-2)',
              minWidth:       0,
              maxWidth:       '100%',
              textDecoration: 'none',
              fontFamily:     'var(--font-sans)',
              fontSize:       'var(--text-sm)',
            }}
          >
            <Icon className="w-4 h-4" strokeWidth={1.5} aria-hidden style={{ flexShrink: 0 }} />
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-1) var(--space-2)', minWidth: 0 }}>
              <span>
                {lead} {getDomainLabel(sibling.domain)}
              </span>
              <span className={`status-pill status-pill--${LEAD_STATUS_BADGE[sibling.status]}`}>
                {LEAD_STATUS_LABELS[sibling.status]}
              </span>
              <span style={{ color: 'var(--theme-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                {sibling.ownerName ?? 'Unassigned'}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
