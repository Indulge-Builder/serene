'use client';

import { useState, useTransition } from 'react';
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
  Check,
  ChevronDown,
} from 'lucide-react';
import type { Lead, AdCreative } from '@/lib/types/database';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { formatDate } from '@/lib/utils/dates';
import { InfoRow } from '@/components/ui/InfoRow';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ComboboxDropdown, type ComboboxItem } from '@/components/ui/ComboboxDropdown';
import { CampaignVideoModal } from '@/components/leads/CampaignVideoModal';
import { updateLeadInfo, assignLead } from '@/lib/actions/leads';

const PLATFORM_LABELS: Record<string, string> = {
  meta:      'Meta Ads',
  google:    'Google Ads',
  website:   'Website',
  whatsapp:  'WhatsApp',
};

type Agent = { id: string; full_name: string };

type Props = {
  lead:          Lead;
  assigneeName:  string | null;
  adCreative?:   AdCreative | null;
  canEdit?:      boolean;
  canReassign?:  boolean;
  agents?:       Agent[];
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function LeadInfoCard({ lead, assigneeName, adCreative = null, canEdit = false, canReassign = false, agents = [] }: Props) {
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [active, setActive]                 = useState(false);
  const [saveState, setSaveState]           = useState<SaveState>('idle');
  const [editError, setEditError]           = useState<string | null>(null);
  const [isPending, startTransition]        = useTransition();

  // Reassign state
  const [currentAssigneeName, setCurrentAssigneeName] = useState(assigneeName);

  const [fields, setFields] = useState({
    first_name: lead.first_name ?? '',
    last_name:  lead.last_name  ?? '',
    phone:      lead.phone      ?? '',
    email:      lead.email      ?? '',
  });

  const fullName = active
    ? [fields.first_name, fields.last_name].filter(Boolean).join(' ')
    : [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  function handleActivate() {
    if (canEdit) setActive(true);
  }

  function handleChange(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleCancel() {
    setFields({
      first_name: lead.first_name ?? '',
      last_name:  lead.last_name  ?? '',
      phone:      lead.phone      ?? '',
      email:      lead.email      ?? '',
    });
    setEditError(null);
    setSaveState('idle');
    setActive(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setSaveState('saving');

    startTransition(async () => {
      const result = await updateLeadInfo({
        leadId:     lead.id,
        first_name: fields.first_name,
        last_name:  fields.last_name  || undefined,
        phone:      fields.phone,
        email:      fields.email      || undefined,
      });

      if (result.error) {
        setEditError(result.error);
        setSaveState('error');
        return;
      }

      setSaveState('saved');
      setTimeout(() => {
        setSaveState('idle');
        setActive(false);
      }, 1200);
    });
  }

  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       `1px solid ${active ? 'var(--theme-accent)' : 'var(--theme-paper-border)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow:    active ? 'var(--shadow-focus)' : 'var(--shadow-1)',
        overflow:     'hidden',
        transition:   'border-color 0.15s ease, box-shadow 0.15s ease',
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
            color:       active ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
            strokeWidth: 1.5,
            flexShrink:  0,
            transition:  'color 0.15s ease',
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

        {/* Save indicator / intent badge */}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {saveState === 'saving' && <Spinner size="sm" />}
          {saveState === 'saved'  && (
            <Check style={{ width: '0.75rem', height: '0.75rem', color: 'var(--color-success)', strokeWidth: 2 }} />
          )}
          {!active && lead.lead_intent && (
            <span
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          '0.25rem',
                padding:      '0.125rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                background:   lead.lead_intent === 'hot' ? 'var(--color-danger-light)' : 'var(--color-info-light)',
                color:        lead.lead_intent === 'hot' ? 'var(--color-danger-text)' : 'var(--color-info-text)',
                fontSize:     'var(--text-xs)',
                fontWeight:   'var(--weight-medium)',
              }}
            >
              {lead.lead_intent === 'hot'
                ? <Flame    style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                : <Snowflake style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
              }
              {lead.lead_intent === 'hot' ? 'Hot' : 'Cold'}
            </span>
          )}
        </span>
      </div>

      {/* Card body */}
      <form onSubmit={handleSave}>
        <div
          onClick={!active && canEdit ? handleActivate : undefined}
          style={{
            padding: 'var(--space-5)',
            cursor:  !active && canEdit ? 'text' : 'default',
          }}
        >
          {/* Editable contact fields */}
          <div
            style={{
              display:             'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap:           'var(--space-6)',
              rowGap:              'var(--space-5)',
            }}
          >
            {active ? (
              <>
                <EditField
                  label="First name"
                  value={fields.first_name}
                  placeholder="First name"
                  onChange={(v) => handleChange('first_name', v)}
                  disabled={isPending}
                  autoFocus
                />
                <EditField
                  label="Last name"
                  value={fields.last_name}
                  placeholder="Last name"
                  onChange={(v) => handleChange('last_name', v)}
                  disabled={isPending}
                />
                <EditField
                  label="Phone"
                  value={fields.phone}
                  placeholder="+91 98765 43210"
                  onChange={(v) => handleChange('phone', v)}
                  disabled={isPending}
                  mono
                />
                <EditField
                  label="Email"
                  value={fields.email}
                  placeholder="email@example.com"
                  onChange={(v) => handleChange('email', v)}
                  disabled={isPending}
                  mono
                />
              </>
            ) : (
              <>
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
              </>
            )}

            <ContactFieldsDivider />

            {/* System fields — always read-only */}
            <InfoRow
              icon={Layers}
              label="Domain"
              value={DOMAIN_LABELS[lead.domain] ?? lead.domain}
            />
            <InfoRow
              icon={Megaphone}
              label="Platform"
              value={lead.platform ? PLATFORM_LABELS[lead.platform] ?? lead.platform : undefined}
            />
            {canReassign ? (
              <AssigneeCombobox
                leadId={lead.id}
                currentAssigneeName={currentAssigneeName}
                agents={agents}
                onReassigned={(agentId, agentName) => setCurrentAssigneeName(agentName)}
              />
            ) : (
              <InfoRow
                icon={UserCheck}
                label="Assigned to"
                value={currentAssigneeName ? currentAssigneeName : <NeutralBadge label="Unassigned" />}
              />
            )}
            <InfoRow
              icon={PhoneCall}
              label="Call count"
              value={lead.call_count > 0 ? monoValue(String(lead.call_count)) : undefined}
            />
            <InfoRow
              icon={Calendar}
              label="Received"
              value={monoValue(formatDate(lead.created_at, 'dd MMM yyyy, hh:mm a'))}
            />
          </div>

          {editError && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 'var(--space-3) 0 0' }}>
              {editError}
            </p>
          )}

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

        {/* Edit mode footer */}
        {active && (
          <div
            style={{
              display:        'flex',
              justifyContent: 'flex-end',
              alignItems:     'center',
              gap:            'var(--space-3)',
              padding:        'var(--space-3) var(--space-5)',
              borderTop:      '1px solid var(--theme-paper-border)',
              background:     'var(--theme-paper-subtle)',
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              style={{
                height:       '2rem',
                paddingLeft:  'var(--space-4)',
                paddingRight: 'var(--space-4)',
                border:       '1px solid var(--theme-paper-border)',
                borderRadius: 'var(--radius-sm)',
                background:   'transparent',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-sm)',
                fontWeight:   'var(--weight-medium)',
                color:        'var(--theme-text-secondary)',
                cursor:       isPending ? 'not-allowed' : 'pointer',
                opacity:      isPending ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <Button
              variant="primary"
              type="submit"
              size="sm"
              disabled={isPending}
              loading={isPending}
              style={{ boxShadow: 'var(--shadow-accent-glow)' }}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}

        {/* Hint when not active */}
        {!active && canEdit && (
          <div style={{ padding: '0 var(--space-5) var(--space-3)' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', margin: 0, fontStyle: 'italic' }}>
              Click any field to edit contact details.
            </p>
          </div>
        )}
      </form>

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
// Inline edit field (used only in active edit mode)
// ─────────────────────────────────────────────
function EditField({
  label, value, placeholder, onChange, disabled, autoFocus, mono,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <p style={{
        fontSize:      'var(--text-2xs)',
        fontWeight:    'var(--weight-semibold)',
        letterSpacing: 'var(--tracking-widest)',
        textTransform: 'uppercase',
        color:         'var(--theme-text-tertiary)',
        margin:        '0 0 var(--space-1) 0',
      }}>
        {label}
      </p>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{
          width:        '100%',
          height:       '2.25rem',
          padding:      '0 var(--space-3)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-sm)',
          background:   'var(--theme-paper)',
          fontFamily:   mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize:     'var(--text-sm)',
          color:        'var(--theme-text-primary)',
          outline:      'none',
          boxSizing:    'border-box',
          opacity:      disabled ? 0.6 : 1,
        }}
        onFocus={(e)  => { e.currentTarget.style.borderColor = 'var(--theme-accent)'; }}
        onBlur={(e)   => { e.currentTarget.style.borderColor = 'var(--theme-paper-border)'; }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Assignee combobox (manager/admin/founder only)
// Looks identical to InfoRow at rest. Composes ui/ComboboxDropdown for the panel,
// search, keyboard navigation, and viewport flip — keeps the InfoRow-styled trigger
// via renderTrigger so the dossier page visual stays unchanged.
// ─────────────────────────────────────────────
function AssigneeCombobox({
  leadId,
  currentAssigneeName,
  agents,
  onReassigned,
}: {
  leadId:              string;
  currentAssigneeName: string | null;
  agents:              Agent[];
  onReassigned:        (agentId: string, agentName: string) => void;
}) {
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const items: ComboboxItem[] = agents.map((a) => ({ id: a.id, label: a.full_name }));
  const currentValue = agents.find((a) => a.full_name === currentAssigneeName)?.id ?? null;

  async function handleChange(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setSaveErr(null);
    setSaving(true);
    const result = await assignLead({ leadId, agentId: agent.id });
    setSaving(false);
    if (result.error) { setSaveErr(result.error); return; }
    setSuccess(true);
    onReassigned(agent.id, agent.full_name);
    setTimeout(() => setSuccess(false), 2000);
  }

  return (
    <div>
      <ComboboxDropdown
        items={items}
        value={currentValue}
        onChange={handleChange}
        searchPlaceholder="Search agents…"
        disabled={saving}
        style={{ display: 'block', width: '100%' }}
        renderTrigger={({ open, hovered, disabled }) => (
          <div
            style={{
              display:    'flex',
              alignItems: 'flex-start',
              gap:        'var(--space-3)',
              width:      '100%',
              cursor:     disabled ? 'not-allowed' : 'pointer',
              textAlign:  'left',
            }}
          >
            <UserCheck
              style={{
                width:       '1rem',
                height:      '1rem',
                color:       open ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                strokeWidth: 1.5,
                flexShrink:  0,
                marginTop:   '0.2rem',
                transition:  'color 0.15s ease',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize:      'var(--text-2xs)',
                fontWeight:    'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-widest)',
                textTransform: 'uppercase',
                color:         'var(--theme-text-tertiary)',
              }}>
                Assigned to
              </span>
              <span style={{
                display:     'flex',
                alignItems:  'center',
                gap:         'var(--space-2)',
                fontSize:    'var(--text-sm)',
                color:       currentAssigneeName ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
              }}>
                {saving ? (
                  <Spinner size="sm" />
                ) : success ? (
                  <>
                    <Check style={{ width: '0.75rem', height: '0.75rem', color: 'var(--color-success)', strokeWidth: 2, flexShrink: 0 }} />
                    <span>{currentAssigneeName ?? 'Unassigned'}</span>
                  </>
                ) : (
                  <>
                    <span style={{
                      borderBottom: hovered || open ? '1px dashed var(--theme-accent)' : '1px dashed transparent',
                      color:        open ? 'var(--theme-accent)' : 'inherit',
                      transition:   'border-color 0.15s ease, color 0.15s ease',
                    }}>
                      {currentAssigneeName ?? 'Unassigned'}
                    </span>
                    <ChevronDown style={{
                      width:       '0.625rem',
                      height:      '0.625rem',
                      color:       hovered || open ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                      strokeWidth: 1.5,
                      flexShrink:  0,
                      opacity:     hovered || open ? 1 : 0,
                      transform:   open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition:  'opacity 0.15s ease, transform 0.15s ease, color 0.15s ease',
                    }} />
                  </>
                )}
              </span>
              {saveErr && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', marginTop: 'var(--space-1)' }}>
                  {saveErr}
                </span>
              )}
            </div>
          </div>
        )}
      />
    </div>
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
