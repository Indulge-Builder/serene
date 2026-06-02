'use client';

import { useState, useEffect, useRef, useCallback, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Phone,
  Mail,
  Layers,
  Megaphone,
  UserCheck,
  PhoneCall,
  Calendar,
  Clock,
  Flame,
  Snowflake,
  Route,
  Signal,
  Check,
  ChevronDown,
} from 'lucide-react';
import type { Lead, AdCreative } from '@/lib/types/database';
import { DOMAIN_LABELS, GIA_DOMAIN_FILTER_ITEMS, type GiaDomain } from '@/lib/constants/domains';
import {
  LEAD_SOURCE_OPTIONS,
  getLeadSourceLabel,
  getMetaMediumLabel,
  type LeadSource,
} from '@/lib/constants/lead-sources';
import { DROPDOWN_VARIANTS } from '@/lib/constants/motion';
import { formatDate } from '@/lib/utils/dates';
import { InfoRow } from '@/components/ui/InfoRow';
import { Spinner } from '@/components/ui/Spinner';
import { CampaignVideoModal } from '@/components/leads/CampaignVideoModal';
import {
  assignLead,
  updateLeadEmail,
  updateLeadDomain,
  updateLeadUtmSource,
} from '@/lib/actions/leads';

type SelectOption = { id: string; label: string };

type Agent = { id: string; full_name: string };

type Props = {
  lead:           Lead;
  assigneeName:   string | null;
  adCreatives?:   AdCreative[];
  /** Inline edit for email + platform */
  canEdit?:       boolean;
  /** Gia domain dropdown — manager+ only */
  canEditDomain?: boolean;
  canReassign?:   boolean;
  agents?:        Agent[];
};

export function LeadInfoCard({
  lead,
  assigneeName,
  adCreatives = [],
  canEdit = false,
  canEditDomain = false,
  canReassign = false,
  agents = [],
}: Props) {
  const router = useRouter();
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [currentAssigneeName, setCurrentAssigneeName] = useState(assigneeName);

  useEffect(() => {
    setCurrentAssigneeName(assigneeName);
  }, [assigneeName]);

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');

  const campaignLabel = trimmedOrUndefined(lead.utm_campaign);
  const campaignValue = campaignLabel
    ? adCreatives.length > 0
      ? (
          <CampaignLinkTrigger
            value={campaignLabel}
            onClick={() => setVideoModalOpen(true)}
          />
        )
      : monoValue(campaignLabel)
    : undefined;

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

        {lead.lead_intent && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
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
                ? <Flame style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
                : <Snowflake style={{ width: '0.75rem', height: '0.75rem', strokeWidth: 1.5 }} />
              }
              {lead.lead_intent === 'hot' ? 'Hot' : 'Cold'}
            </span>
          </span>
        )}
      </div>

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
          />
          {canEdit ? (
            <EmailInlineField leadId={lead.id} initialEmail={lead.email} />
          ) : (
            <InfoRow
              icon={Mail}
              label="Email"
              value={trimmedOrUndefined(lead.email)}
            />
          )}
          <InfoRow
            icon={Phone}
            label="Phone"
            value={lead.phone?.trim() ? monoValue(lead.phone.trim()) : undefined}
          />
          <InfoRow
            icon={PhoneCall}
            label="Call count"
            value={lead.call_count > 0 ? monoValue(String(lead.call_count)) : undefined}
          />

          <ContactFieldsDivider />

          {canEditDomain ? (
            <DomainDropdownField
              leadId={lead.id}
              domain={lead.domain as GiaDomain}
              onSaved={() => router.refresh()}
            />
          ) : (
            <InfoRow
              icon={Layers}
              label="Domain"
              value={DOMAIN_LABELS[lead.domain] ?? lead.domain}
            />
          )}
          {canEdit ? (
            <SourceDropdownField
              leadId={lead.id}
              utmSource={lead.utm_source}
              onSaved={() => router.refresh()}
            />
          ) : (
            <InfoRow
              icon={Megaphone}
              label="Source"
              value={getLeadSourceLabel(lead.utm_source)}
            />
          )}
          <InfoRow
            icon={Signal}
            label="Medium"
            value={getMetaMediumLabel(lead.utm_medium) ?? undefined}
          />
          {canReassign ? (
            <AssigneeDropdownField
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
            icon={Calendar}
            label="Received"
            value={monoValue(formatDate(lead.created_at, 'dd MMM yyyy, hh:mm a'))}
          />
          <InfoRow
            icon={Route}
            label="Campaign"
            value={campaignValue}
          />
          <InfoRow
            icon={Clock}
            label="Last modified"
            value={monoValue(formatDate(lead.updated_at, 'dd MMM yyyy, hh:mm a'))}
          />
        </div>
      </div>

      {adCreatives.length > 0 && lead.utm_campaign && (
        <CampaignVideoModal
          isOpen={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          campaignName={lead.utm_campaign}
          adCreatives={adCreatives}
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
// InfoRow-matched shell for editable dossier fields
// ─────────────────────────────────────────────
function LeadFieldShell({
  icon: Icon,
  label,
  open = false,
  disabled = false,
  children,
}: {
  icon:      ComponentType<{ style?: React.CSSProperties }>;
  label:     string;
  open?:     boolean;
  disabled?: boolean;
  children:  React.ReactNode;
}) {
  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'flex-start',
        gap:        'var(--space-3)',
        width:      '100%',
      }}
    >
      <Icon
        style={{
          width:       '1rem',
          height:      '1rem',
          color:       open ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
          strokeWidth: 1.5,
          flexShrink:  0,
          marginTop:   '0.125rem',
          transition:  'color 0.15s ease',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', flex: 1, minWidth: 0 }}>
        <span className="label-micro">{label}</span>
        <span
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-2)',
            fontSize:   'var(--text-sm)',
            color:      'var(--theme-text-primary)',
            cursor:     disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {children}
        </span>
      </div>
    </div>
  );
}

function EditableValueText({
  children,
  open,
  hovered,
  muted,
}: {
  children: React.ReactNode;
  open?:    boolean;
  hovered?: boolean;
  muted?:   boolean;
}) {
  return (
    <span
      style={{
        borderBottom: hovered || open ? '1px dashed var(--theme-accent)' : '1px dashed transparent',
        color:        open ? 'var(--theme-accent)' : muted ? 'var(--theme-text-tertiary)' : 'inherit',
        transition:   'border-color 0.15s ease, color 0.15s ease',
      }}
    >
      {children}
    </span>
  );
}

function FieldSaveFeedback({
  saving,
  success,
  error,
}: {
  saving:  boolean;
  success: boolean;
  error:   string | null;
}) {
  if (saving) return <Spinner size="sm" />;
  if (success) {
    return (
      <Check
        style={{ width: '0.75rem', height: '0.75rem', color: 'var(--color-success)', strokeWidth: 2, flexShrink: 0 }}
      />
    );
  }
  if (error) {
    return (
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', marginTop: 'var(--space-1)' }}>
        {error}
      </span>
    );
  }
  return null;
}

// ─────────────────────────────────────────────
// Email — click to edit inline
// ─────────────────────────────────────────────
function EmailInlineField({
  leadId,
  initialEmail,
}: {
  leadId:       string;
  initialEmail: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialEmail ?? '');
  const [display, setDisplay] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(initialEmail ?? '');
    setDisplay(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed ? trimmed.toLowerCase() : null;
    const prev = display?.trim() ? display.trim().toLowerCase() : null;
    if (next === prev) {
      setEditing(false);
      return;
    }

    setSaveErr(null);
    setSaving(true);
    const result = await updateLeadEmail({ leadId, email: trimmed });
    setSaving(false);

    if (result.error) {
      setSaveErr(result.error);
      return;
    }

    setDisplay(next);
    setSuccess(true);
    setEditing(false);
    setTimeout(() => setSuccess(false), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    }
    if (e.key === 'Escape') {
      setDraft(display ?? '');
      setSaveErr(null);
      setEditing(false);
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LeadFieldShell icon={Mail} label="Email" disabled={saving}>
        {editing ? (
          <input
            ref={inputRef}
            type="email"
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={handleKeyDown}
            style={{
              width:        '100%',
              height:       '1.5rem',
              padding:      0,
              border:       'none',
              borderBottom: '1px solid var(--theme-accent)',
              background:   'transparent',
              fontFamily:   'var(--font-mono)',
              fontSize:     'var(--text-sm)',
              color:        'var(--theme-text-primary)',
              outline:      'none',
            }}
          />
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => setEditing(true)}
            style={{
              display:    'inline-flex',
              alignItems: 'center',
              gap:        'var(--space-2)',
              padding:    0,
              border:     'none',
              background: 'transparent',
              font:       'inherit',
              textAlign:  'left',
              cursor:     saving ? 'not-allowed' : 'pointer',
            }}
          >
            <FieldSaveFeedback saving={saving} success={success} error={null} />
            <EditableValueText hovered={hovered} muted={!display?.trim()}>
              {display?.trim() ? (
                <span style={{ fontFamily: 'var(--font-mono)' }}>{display.trim()}</span>
              ) : (
                'Add email'
              )}
            </EditableValueText>
          </button>
        )}
      </LeadFieldShell>
      {saveErr && !editing && (
        <p style={{ margin: 'var(--space-1) 0 0 calc(1rem + var(--space-3))', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
          {saveErr}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Domain / Platform / Assignee — InfoRow look, themed menu on click
// ─────────────────────────────────────────────
function DomainDropdownField({
  leadId,
  domain,
  onSaved,
}: {
  leadId:   string;
  domain:   GiaDomain;
  onSaved?: () => void;
}) {
  const [current, setCurrent] = useState(domain);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(domain);
  }, [domain]);

  async function handleChange(nextDomain: string) {
    if (nextDomain === current) return;
    setSaveErr(null);
    setSaving(true);
    const result = await updateLeadDomain({ leadId, domain: nextDomain as GiaDomain });
    setSaving(false);
    if (result.error) {
      setSaveErr(result.error);
      return;
    }
    setCurrent(nextDomain as GiaDomain);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
    onSaved?.();
  }

  return (
    <InlineSelectField
      icon={Layers}
      label="Domain"
      items={GIA_DOMAIN_FILTER_ITEMS}
      selectedId={current}
      displayValue={DOMAIN_LABELS[current] ?? current}
      onSelect={handleChange}
      saving={saving}
      success={success}
      saveErr={saveErr}
    />
  );
}

function SourceDropdownField({
  leadId,
  utmSource,
  onSaved,
}: {
  leadId:     string;
  utmSource:  string | null;
  onSaved?:   () => void;
}) {
  const [current, setCurrent] = useState(utmSource);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(utmSource);
  }, [utmSource]);

  async function handleChange(nextSource: string) {
    const next = nextSource as LeadSource;
    if (next === current) return;
    setSaveErr(null);
    setSaving(true);
    const result = await updateLeadUtmSource({ leadId, utm_source: next });
    setSaving(false);
    if (result.error) {
      setSaveErr(result.error);
      return;
    }
    setCurrent(next);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
    onSaved?.();
  }

  const displayValue = getLeadSourceLabel(current);

  return (
    <InlineSelectField
      icon={Megaphone}
      label="Source"
      items={LEAD_SOURCE_OPTIONS}
      selectedId={current}
      displayValue={displayValue}
      muted={!current}
      onSelect={handleChange}
      saving={saving}
      success={success}
      saveErr={saveErr}
    />
  );
}

const SELECT_MENU_MAX_HEIGHT = 240;
const SELECT_MENU_GAP_PX       = 4;

type SelectMenuPosition = {
  left:      number;
  width:     number;
  maxHeight: number;
  top?:      number;
  bottom?:   number;
};

function computeSelectMenuPosition(trigger: HTMLElement): SelectMenuPosition {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - SELECT_MENU_GAP_PX;
  const spaceAbove = rect.top - SELECT_MENU_GAP_PX;
  const openUp     = spaceBelow < 160 && spaceAbove > spaceBelow;

  if (openUp) {
    return {
      left:      rect.left,
      width:     rect.width,
      bottom:    window.innerHeight - rect.top + SELECT_MENU_GAP_PX,
      maxHeight: Math.min(SELECT_MENU_MAX_HEIGHT, Math.max(spaceAbove - 8, 120)),
    };
  }

  return {
    left:      rect.left,
    width:     rect.width,
    top:       rect.bottom + SELECT_MENU_GAP_PX,
    maxHeight: Math.min(SELECT_MENU_MAX_HEIGHT, Math.max(spaceBelow - 8, 120)),
  };
}

function InlineSelectField({
  icon,
  label,
  items,
  selectedId,
  displayValue,
  muted = false,
  onSelect,
  saving,
  success,
  saveErr,
}: {
  icon:         ComponentType<{ style?: React.CSSProperties }>;
  label:        string;
  items:        SelectOption[];
  selectedId:   string | null;
  displayValue: string;
  muted?:       boolean;
  onSelect:     (id: string) => void;
  saving:       boolean;
  success:      boolean;
  saveErr:      string | null;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuPos, setMenuPos] = useState<SelectMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (triggerRef.current) {
      setMenuPos(computeSelectMenuPosition(triggerRef.current));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const menu =
    open && menuPos
      ? (
          <motion.div
            ref={menuRef}
            key={`${label}-menu`}
            role="listbox"
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position:     'fixed',
              left:         menuPos.left,
              width:        menuPos.width,
              minWidth:     180,
              ...(menuPos.top != null
                ? { top: menuPos.top }
                : { bottom: menuPos.bottom }),
              maxHeight:    menuPos.maxHeight,
              zIndex:       'var(--z-dropdown)' as React.CSSProperties['zIndex'],
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow:    'var(--shadow-3)',
              padding:      'var(--space-1) 0',
              overflowY:    'auto',
            }}
          >
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setOpen(false);
                    onSelect(item.id);
                  }}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        'var(--space-2)',
                    width:      '100%',
                    padding:    'var(--space-2) var(--space-3)',
                    border:     'none',
                    background: isSelected ? 'var(--theme-accent-surface)' : 'transparent',
                    fontFamily: 'var(--font-sans)',
                    fontSize:   'var(--text-sm)',
                    color:      isSelected ? 'var(--theme-accent)' : 'var(--theme-text-primary)',
                    cursor:     'pointer',
                    textAlign:  'left',
                    transition: 'var(--transition-hover)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-paper-subtle)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {isSelected && (
                    <Check
                      style={{ width: 14, height: 14, strokeWidth: 2, flexShrink: 0 }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        )
      : null;

  return (
    <>
      <div
        style={{ width: '100%' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          ref={triggerRef}
          type="button"
          disabled={saving}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            width:      '100%',
            padding:    0,
            border:     'none',
            background: 'transparent',
            textAlign:  'left',
            cursor:     saving ? 'not-allowed' : 'pointer',
            opacity:    saving ? 0.6 : 1,
          }}
        >
          <LeadFieldShell icon={icon} label={label} open={open} disabled={saving}>
            <FieldSaveFeedback saving={saving} success={success} error={null} />
            <EditableValueText open={open} hovered={hovered} muted={muted}>
              {displayValue}
            </EditableValueText>
            {!saving && (
              <ChevronDown
                style={{
                  width:       '0.625rem',
                  height:      '0.625rem',
                  color:       hovered || open ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
                  strokeWidth: 1.5,
                  flexShrink:  0,
                  opacity:     hovered || open ? 1 : 0,
                  transform:   open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition:  'opacity 0.15s ease, transform 0.15s ease, color 0.15s ease',
                }}
              />
            )}
          </LeadFieldShell>
        </button>

        {saveErr && (
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)' }}>
            {saveErr}
          </p>
        )}
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>{menu}</AnimatePresence>,
          document.body,
        )}
    </>
  );
}

// ─────────────────────────────────────────────
// Assignee dropdown (manager/admin/founder only)
// ─────────────────────────────────────────────
function AssigneeDropdownField({
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
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const items: SelectOption[] = agents.map((a) => ({ id: a.id, label: a.full_name }));
  const currentValue = agents.find((a) => a.full_name === currentAssigneeName)?.id ?? null;

  async function handleSelect(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setSaveErr(null);
    setSaving(true);
    const result = await assignLead({ leadId, agentId: agent.id });
    setSaving(false);
    if (result.error) {
      setSaveErr(result.error);
      return;
    }
    setSuccess(true);
    onReassigned(agent.id, agent.full_name);
    setTimeout(() => setSuccess(false), 2000);
  }

  return (
    <InlineSelectField
      icon={UserCheck}
      label="Assigned to"
      items={items}
      selectedId={currentValue}
      displayValue={currentAssigneeName ?? 'Unassigned'}
      muted={!currentAssigneeName}
      onSelect={handleSelect}
      saving={saving}
      success={success}
      saveErr={saveErr}
    />
  );
}

// ─────────────────────────────────────────────
// Campaign value — opens ad video modal when creatives exist
// ─────────────────────────────────────────────
function CampaignLinkTrigger({ value, onClick }: { value: string; onClick: () => void }) {
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
