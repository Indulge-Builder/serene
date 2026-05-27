import {
  User,
  Phone,
  Mail,
  Layers,
  Megaphone,
  UserCheck,
  PhoneCall,
  Calendar,
  Flame,
  Snowflake,
  Route,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Lead } from '@/lib/types/database';
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

      {/* Card body — contact fields */}
      <div style={{ padding: 'var(--space-5)' }}>
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap:           'var(--space-6)',
            rowGap:              'var(--space-5)',
          }}
        >
          <DatumRow icon={User} label="Full Name" value={fullName} colSpan2 />

          <DatumRow icon={Phone} label="Phone" value={lead.phone} mono />

          <DatumRow icon={Mail} label="Email" value={lead.email} />

          <ContactFieldsDivider />

          <DatumRow
            icon={Layers}
            label="Domain"
            value={DOMAIN_LABELS[lead.domain] ?? lead.domain}
          />

          <DatumRow
            icon={Megaphone}
            label="Platform"
            value={
              lead.platform
                ? PLATFORM_LABELS[lead.platform] ?? lead.platform
                : null
            }
          />

          <DatumRow icon={UserCheck} label="Assigned to">
            {assigneeName ? (
              <DatumValue>{assigneeName}</DatumValue>
            ) : (
              <NeutralBadge label="Unassigned" />
            )}
          </DatumRow>

          <DatumRow icon={PhoneCall} label="Call count">
            {lead.call_count > 0 ? (
              <DatumValue mono>{String(lead.call_count)}</DatumValue>
            ) : (
              <DatumValue muted>—</DatumValue>
            )}
          </DatumRow>

          <DatumRow
            icon={Calendar}
            label="Received"
            value={formatDate(lead.created_at, 'dd MMM yyyy, hh:mm a')}
            mono
          />
        </div>

        <AttributionStrip
          source={lead.utm_source}
          medium={lead.utm_medium}
          campaign={lead.utm_campaign}
          content={lead.utm_content}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Labelled datum row — read-only detail field pattern
// ─────────────────────────────────────────────
const DATUM_ICON_STYLE = {
  width:       '1rem',
  height:      '1rem',
  color:       'var(--theme-text-tertiary)',
  strokeWidth: 1.5,
  flexShrink:  0,
} as const;

function ContactFieldsDivider() {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        height:     '1px',
        background: 'var(--theme-paper-border)',
      }}
      aria-hidden
    />
  );
}

function DatumRow({
  icon: Icon,
  label,
  value,
  mono = false,
  colSpan2 = false,
  children,
}: {
  icon:      LucideIcon;
  label:     string;
  value?:    string | null;
  mono?:     boolean;
  colSpan2?: boolean;
  children?: React.ReactNode;
}) {
  const displayValue = value?.trim() ? value : null;

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        gridColumn: colSpan2 ? '1 / -1' : undefined,
      }}
    >
      <Icon style={DATUM_ICON_STYLE} aria-hidden />
      <div
        style={{
          display:       'flex',
          flexDirection: 'column',
          gap:           '0.125rem',
          minWidth:      0,
        }}
      >
        <span
          style={{
            fontFamily:    'var(--font-sans)',
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
            lineHeight:    'var(--leading-none)',
          }}
        >
          {label}
        </span>
        {children ?? (
          <DatumValue mono={mono} muted={!displayValue}>
            {displayValue ?? '—'}
          </DatumValue>
        )}
      </div>
    </div>
  );
}

function DatumValue({
  children,
  mono = false,
  muted = false,
}: {
  children: React.ReactNode;
  mono?:    boolean;
  muted?:   boolean;
}) {
  return (
    <span
      style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize:   'var(--text-sm)',
        fontWeight: 'var(--weight-normal)',
        color:      muted
          ? 'var(--theme-text-tertiary)'
          : 'var(--theme-text-primary)',
        lineHeight: 'var(--leading-normal)',
      }}
    >
      {children}
    </span>
  );
}

function NeutralBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        padding:      '0.125rem 0.625rem',
        borderRadius: 'var(--radius-full)',
        border:       '1px solid var(--color-neutral-light)',
        background:   'var(--color-neutral-light)',
        color:        'var(--color-neutral-text)',
        fontSize:     'var(--text-xs)',
        fontWeight:   'var(--weight-medium)',
      }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
// Attribution strip (UTM)
// ─────────────────────────────────────────────
type AttributionStripProps = {
  source:   string | null;
  medium:   string | null;
  campaign: string | null;
  content:  string | null;
};

const ATTRIBUTION_FIELDS = [
  { key: 'source',   label: 'Source',   prop: 'source'   as const, accentValue: true },
  { key: 'medium',   label: 'Medium',   prop: 'medium'   as const, accentValue: false },
  { key: 'campaign', label: 'Campaign', prop: 'campaign' as const, accentValue: false },
  { key: 'content',  label: 'Content',  prop: 'content'  as const, accentValue: false },
] as const;

function AttributionStrip({ source, medium, campaign, content }: AttributionStripProps) {
  const values = { source, medium, campaign, content };
  const present = ATTRIBUTION_FIELDS.filter((f) => values[f.prop] != null);

  if (present.length === 0) return null;

  return (
    <div
      style={{
        marginTop:    'var(--space-4)',
        padding:      'var(--space-3) var(--space-4)',
        background:   'var(--theme-accent-surface)',
        borderRadius: 'var(--radius-md)',
        border:       '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)',
      }}
    >
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-2)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <Route
          style={{
            width:       '0.875rem',
            height:      '0.875rem',
            color:       'var(--theme-accent)',
            strokeWidth: 1.5,
            flexShrink:  0,
          }}
        />
        <span
          style={{
            fontSize:      'var(--text-2xs)',
            fontWeight:    'var(--weight-semibold)',
            letterSpacing: 'var(--tracking-widest)',
            textTransform: 'uppercase',
            color:         'var(--theme-text-tertiary)',
          }}
        >
          Attribution
        </span>
      </div>

      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {present.map((field, index) => {
          const value = values[field.prop]!;
          return (
            <div key={field.key} style={{ display: 'contents' }}>
              {index > 0 && (
                <div
                  style={{
                    width:      '1px',
                    alignSelf:  'center',
                    height:     '2rem',
                    background: 'var(--theme-paper-border)',
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
              )}
              <div
                style={{
                  display:       'flex',
                  flexDirection: 'column',
                  paddingTop:    'var(--space-1)',
                  paddingBottom: 'var(--space-1)',
                  paddingLeft:   index === 0 ? 0 : 'var(--space-4)',
                  paddingRight:  'var(--space-4)',
                }}
              >
                <span
                  style={{
                    fontSize:      'var(--text-2xs)',
                    fontWeight:    'var(--weight-semibold)',
                    letterSpacing: 'var(--tracking-wider)',
                    textTransform: 'uppercase',
                    color:         'var(--theme-text-tertiary)',
                    marginBottom:  'var(--space-1)',
                  }}
                >
                  {field.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize:   'var(--text-sm)',
                    fontWeight: 'var(--weight-medium)',
                    color:      field.accentValue
                      ? 'var(--theme-accent)'
                      : 'var(--theme-text-primary)',
                  }}
                >
                  {value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
