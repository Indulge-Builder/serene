'use client';

import { useState } from 'react';
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
import type { Lead, AdCreative } from '@/lib/types/database';
import { formatDate } from '@/lib/utils/dates';
import { InfoRow } from '@/components/ui/InfoRow';
import { CampaignVideoModal } from '@/components/leads/CampaignVideoModal';

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
  lead:          Lead;
  assigneeName:  string | null;
  adCreative?:   AdCreative | null;
};

export function LeadInfoCard({ lead, assigneeName, adCreative = null }: Props) {
  const [videoModalOpen, setVideoModalOpen] = useState(false);
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
          <InfoRow
            icon={User}
            label="Full Name"
            value={trimmedOrUndefined(fullName)}
            style={{ gridColumn: '1 / -1' }}
          />

          <InfoRow
            icon={Phone}
            label="Phone"
            value={lead.phone?.trim() ? monoValue(lead.phone.trim()) : undefined}
          />

          <InfoRow
            icon={Mail}
            label="Email"
            value={trimmedOrUndefined(lead.email)}
          />

          <ContactFieldsDivider />

          <InfoRow
            icon={Layers}
            label="Domain"
            value={DOMAIN_LABELS[lead.domain] ?? lead.domain}
          />

          <InfoRow
            icon={Megaphone}
            label="Platform"
            value={
              lead.platform
                ? PLATFORM_LABELS[lead.platform] ?? lead.platform
                : undefined
            }
          />

          <InfoRow
            icon={UserCheck}
            label="Assigned to"
            value={
              assigneeName
                ? assigneeName
                : <NeutralBadge label="Unassigned" />
            }
          />

          <InfoRow
            icon={PhoneCall}
            label="Call count"
            value={
              lead.call_count > 0
                ? monoValue(String(lead.call_count))
                : undefined
            }
          />

          <InfoRow
            icon={Calendar}
            label="Received"
            value={monoValue(formatDate(lead.created_at, 'dd MMM yyyy, hh:mm a'))}
          />
        </div>

        <AttributionStrip
          source={lead.utm_source}
          medium={lead.utm_medium}
          campaign={lead.utm_campaign}
          adName={lead.ad_name}
          content={lead.utm_content}
          adCreative={adCreative}
          onOpenVideoModal={() => setVideoModalOpen(true)}
        />
      </div>

      {adCreative && lead.utm_campaign && (
        <CampaignVideoModal
          isOpen={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          campaignName={lead.utm_campaign}
          adCreative={adCreative}
        />
      )}
    </div>
  );
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function monoValue(text: string) {
  return <span style={{ fontFamily: 'var(--font-mono)' }}>{text}</span>;
}

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
  source:           string | null;
  medium:           string | null;
  campaign:         string | null;
  adName:           string | null;
  content:          string | null;
  adCreative:       AdCreative | null;
  onOpenVideoModal: () => void;
};

const ATTRIBUTION_FIELDS = [
  { key: 'source',   label: 'Source',   prop: 'source'   as const, accentValue: true },
  { key: 'medium',   label: 'Medium',   prop: 'medium'   as const, accentValue: false },
  { key: 'campaign', label: 'Campaign', prop: 'campaign' as const, accentValue: false },
  { key: 'content',  label: 'Content',  prop: 'content'  as const, accentValue: false },
] as const;

function AttributionStrip({
  source,
  medium,
  campaign,
  adName,
  content,
  adCreative,
  onOpenVideoModal,
}: AttributionStripProps) {
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
          // Campaign field becomes an interactive trigger when an ad creative is available.
          const isCampaignTrigger = field.key === 'campaign' && adCreative !== null;

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

                {isCampaignTrigger ? (
                  <AttributionTrigger value={value} onClick={onOpenVideoModal} />
                ) : (
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ad name row — rendered only when lead.ad_name matches the creative's ad_name */}
      {adName && adCreative && adCreative.ad_name === adName && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <span
            style={{
              display:       'block',
              fontSize:      'var(--text-2xs)',
              fontWeight:    'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-wider)',
              textTransform: 'uppercase',
              color:         'var(--theme-text-tertiary)',
              marginBottom:  'var(--space-1)',
            }}
          >
            Ad name
          </span>
          <AttributionTrigger value={adName} onClick={onOpenVideoModal} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Inline text trigger for clickable attribution fields
// ─────────────────────────────────────────────
function AttributionTrigger({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        fontFamily:          'var(--font-mono)',
        fontSize:            'var(--text-sm)',
        fontWeight:          'var(--weight-medium)',
        color:               'var(--theme-text-primary)',
        cursor:              'pointer',
        textDecoration:      'underline',
        textDecorationColor: 'transparent',
        transition:          `color var(--duration-fast) var(--ease-in-out), text-decoration-color var(--duration-fast) var(--ease-in-out)`,
        outline:             'none',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--theme-accent)';
        (e.currentTarget as HTMLElement).style.textDecorationColor = 'var(--theme-accent)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--theme-text-primary)';
        (e.currentTarget as HTMLElement).style.textDecorationColor = 'transparent';
      }}
    >
      {value}
    </span>
  );
}
