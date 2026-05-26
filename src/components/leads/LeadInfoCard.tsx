import { User, Phone, Mail, Globe, Tag, Flame, Snowflake, Calendar } from 'lucide-react';
import type { Lead } from '@/lib/types/database';
import { CALL_OUTCOME_LABELS } from '@/lib/constants/call-outcomes';
import { formatDate } from '@/lib/utils/dates';

const PLATFORM_LABELS: Record<string, string> = {
  meta:      'Meta Ads',
  google:    'Google Ads',
  website:   'Website',
  whatsapp:  'WhatsApp',
};

const DOMAIN_LABELS: Record<string, string> = {
  indulge_concierge: 'Concierge',
  indulge_shop:      'Shop',
  indulge_legacy:    'Legacy',
  indulge_house:     'House',
  indulge_b2b:       'B2B',
};

type Props = {
  lead: Lead;
  assigneeName: string | null;
};

export function LeadInfoCard({ lead, assigneeName }: Props) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        overflow:     'hidden',
      }}
    >
      {/* Card header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          padding:      'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper-subtle)',
        }}
      >
        <User
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            color:       'var(--theme-text-tertiary)',
            strokeWidth: 1.5,
            flexShrink:  0,
          }}
        />
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
          }}
        >
          Lead Information
        </span>

        {/* Intent badge */}
        {lead.lead_intent && (
          <span
            style={{
              marginLeft:   'auto',
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '0.25rem',
              padding:      '0.125rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              background:   lead.lead_intent === 'hot'
                ? 'var(--color-danger-light)'
                : 'var(--color-info-light)',
              color: lead.lead_intent === 'hot'
                ? 'var(--color-danger-text)'
                : 'var(--color-info-text)',
              fontSize:   'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
            }}
          >
            {lead.lead_intent === 'hot'
              ? <Flame style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
              : <Snowflake style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
            }
            {lead.lead_intent === 'hot' ? 'Hot' : 'Cold'}
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: 'var(--space-5)' }}>
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 'var(--space-4)',
          }}
        >
          <Field label="Full Name" value={fullName} />

          <Field
            label="Phone"
            value={lead.phone}
            mono
            icon={<Phone style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />}
          />

          <Field
            label="Email"
            value={lead.email}
            icon={<Mail style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />}
          />

          <Field
            label="Domain"
            value={DOMAIN_LABELS[lead.domain] ?? lead.domain}
            icon={<Tag style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />}
          />

          <Field
            label="Platform"
            value={lead.platform ? PLATFORM_LABELS[lead.platform] ?? lead.platform : null}
            icon={<Globe style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />}
          />

          <Field
            label="Campaign"
            value={lead.utm_campaign}
          />

          <Field label="Assigned to" value={assigneeName ?? 'Unassigned'} />

          <Field
            label="Call count"
            value={lead.call_count > 0 ? `${lead.call_count} call${lead.call_count !== 1 ? 's' : ''}` : 'Not called'}
          />

          {lead.last_call_outcome && (
            <Field
              label="Last outcome"
              value={CALL_OUTCOME_LABELS[lead.last_call_outcome]}
            />
          )}

          <Field
            label="Received"
            value={formatDate(lead.created_at, 'dd MMM yyyy, hh:mm a')}
            icon={<Calendar style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />}
          />
        </div>

        {/* UTM row — only if any UTM data */}
        {(lead.utm_source || lead.utm_medium || lead.utm_content) && (
          <div
            style={{
              marginTop:    'var(--space-4)',
              padding:      'var(--space-3) var(--space-4)',
              background:   'var(--theme-paper-subtle)',
              borderRadius: 'var(--radius-sm)',
              border:       '1px solid var(--theme-paper-border)',
            }}
          >
            <p
              style={{
                fontSize:      'var(--text-2xs)',
                fontWeight:    'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color:         'var(--theme-text-tertiary)',
                marginBottom:  'var(--space-2)',
              }}
            >
              UTM Parameters
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              {lead.utm_source && <UtmChip label="source" value={lead.utm_source} />}
              {lead.utm_medium && <UtmChip label="medium" value={lead.utm_medium} />}
              {lead.utm_content && <UtmChip label="content" value={lead.utm_content} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Field row
// ─────────────────────────────────────────────
function Field({
  label,
  value,
  mono = false,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p
        style={{
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
          marginBottom:  'var(--space-1)',
        }}
      >
        {label}
      </p>
      <p
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        'var(--space-1)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize:   'var(--text-sm)',
          color:      value ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
          margin:     0,
        }}
      >
        {icon && (
          <span style={{ color: 'var(--theme-text-tertiary)', flexShrink: 0 }}>
            {icon}
          </span>
        )}
        {value ?? '—'}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// UTM chip
// ─────────────────────────────────────────────
function UtmChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          'var(--space-1)',
        padding:      '0.125rem var(--space-2)',
        borderRadius: 'var(--radius-xs)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
      }}
    >
      <span
        style={{
          fontSize:      'var(--text-2xs)',
          fontWeight:    'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
          color:         'var(--theme-text-tertiary)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize:   'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color:      'var(--theme-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
