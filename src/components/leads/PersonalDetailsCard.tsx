'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { updatePersonalDetails, updateLeadCity } from '@/lib/actions/leads';
import type { Lead } from '@/lib/types/database';

type Props = {
  lead: Lead;
  canEdit: boolean;
};

// JSONB fields — city is intentionally absent (it lives in leads.city)
const JSONB_GRID_FIELDS: { label: string; key: string; placeholder: string }[] = [
  { label: 'Company',    key: 'company',    placeholder: 'e.g. Tata Group'          },
  { label: 'Occupation', key: 'occupation', placeholder: 'e.g. Business Owner'      },
  { label: 'Interests',  key: 'interests',  placeholder: 'e.g. Luxury, Real estate' },
];

const DETAILS_FIELD = {
  label:       'Details',
  key:         'notes',
  placeholder: 'Any additional context…',
} as const;

const JSONB_FIELD_KEYS = [...JSONB_GRID_FIELDS.map((f) => f.key), DETAILS_FIELD.key];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const inputStyle: React.CSSProperties = {
  width:        '100%',
  height:       '2.25rem',
  padding:      '0 var(--space-3)',
  border:       '1px solid var(--theme-paper-border)',
  borderRadius: 'var(--radius-sm)',
  background:   'var(--theme-paper)',
  fontFamily:   'var(--font-sans)',
  fontSize:     'var(--text-sm)',
  color:        'var(--theme-text-primary)',
  outline:      'none',
  boxSizing:    'border-box',
};

const textareaStyle: React.CSSProperties = {
  width:        '100%',
  padding:      'var(--space-2) var(--space-3)',
  border:       '1px solid var(--theme-paper-border)',
  borderRadius: 'var(--radius-sm)',
  background:   'var(--theme-paper)',
  fontFamily:   'var(--font-sans)',
  fontSize:     'var(--text-sm)',
  color:        'var(--theme-text-primary)',
  lineHeight:   'var(--leading-relaxed)',
  resize:       'vertical',
  outline:      'none',
  boxSizing:    'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize:      'var(--text-2xs)',
  fontWeight:    'var(--weight-semibold)',
  letterSpacing: 'var(--tracking-widest)',
  textTransform: 'uppercase',
  color:         'var(--theme-text-tertiary)',
  margin:        '0 0 var(--space-1) 0',
};

const readValueStyle = (hasValue: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)',
  fontSize:   'var(--text-sm)',
  color:      hasValue ? 'var(--theme-text-primary)' : 'var(--theme-text-tertiary)',
  margin:     0,
  lineHeight: 'var(--leading-normal)',
  minHeight:  '1.25rem',
});

function focusAccent(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--theme-accent)';
}
function blurReset(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
}

export function PersonalDetailsCard({ lead, canEdit }: Props) {
  const router = useRouter();
  const initial = (lead.personal_details ?? {}) as Record<string, string>;

  // JSONB fields state
  const [saved, setSaved]     = useState<Record<string, string>>(initial);
  const [values, setValues]   = useState<Record<string, string>>(
    Object.fromEntries(JSONB_FIELD_KEYS.map((key) => [key, initial[key] ?? '']))
  );

  // City — dedicated column, separate state
  const [savedCity, setSavedCity]   = useState<string>(lead.city ?? '');
  const [cityValue, setCityValue]   = useState<string>(lead.city ?? '');

  const [active, setActive]         = useState(false);
  const [saveState, setSaveState]   = useState<SaveState>('idle');
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasAnyValue =
    JSONB_FIELD_KEYS.some((key) => (saved[key] ?? '').trim() !== '') ||
    savedCity.trim() !== '';

  function handleActivate() {
    if (canEdit) setActive(true);
  }

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveState('saving');

    startTransition(async () => {
      // Run both updates in parallel — city is a separate column
      const [detailsResult, cityResult] = await Promise.all([
        updatePersonalDetails({ leadId: lead.id, details: values }),
        updateLeadCity({ leadId: lead.id, city: cityValue }),
      ]);

      if (detailsResult.error || cityResult.error) {
        setError(detailsResult.error ?? cityResult.error ?? 'Failed to save.');
        setSaveState('error');
        return;
      }

      setSaved({ ...values });
      setSavedCity(cityValue);
      setSaveState('saved');
      router.refresh();
      setTimeout(() => {
        setSaveState('idle');
        setActive(false);
      }, 1200);
    });
  }

  function handleCancel() {
    setValues(Object.fromEntries(JSONB_FIELD_KEYS.map((key) => [key, saved[key] ?? ''])));
    setCityValue(savedCity);
    setError(null);
    setSaveState('idle');
    setActive(false);
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
      {/* Header */}
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
        <UserCircle
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
          Personal Details
        </span>

        <span style={{ marginLeft: 'auto' }}>
          {saveState === 'saving' && <Spinner size="sm" />}
          {saveState === 'saved' && (
            <Check style={{ width: '0.75rem', height: '0.75rem', color: 'var(--color-success)', strokeWidth: 2 }} />
          )}
        </span>
      </div>

      {/* Body */}
      <form onSubmit={handleSave}>
        <div
          onClick={!active && canEdit ? handleActivate : undefined}
          style={{
            padding:             'var(--space-5)',
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 'var(--space-4)',
            cursor:              !active && canEdit ? 'text' : 'default',
          }}
        >
          {/* JSONB grid fields */}
          {JSONB_GRID_FIELDS.map(({ label, key, placeholder }) => (
            <div key={key}>
              <p style={labelStyle}>{label}</p>
              {active && canEdit ? (
                <input
                  type="text"
                  value={values[key] ?? ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  disabled={isPending}
                  style={{ ...inputStyle, opacity: isPending ? 0.6 : 1 }}
                  onFocus={focusAccent}
                  onBlur={blurReset}
                />
              ) : (
                <p style={readValueStyle((saved[key] ?? '').trim() !== '')}>
                  {(saved[key] ?? '').trim() || '—'}
                </p>
              )}
            </div>
          ))}

          {/* City — dedicated column, above Details */}
          <div>
            <p style={labelStyle}>City</p>
            {active && canEdit ? (
              <input
                type="text"
                value={cityValue}
                onChange={(e) => setCityValue(e.target.value)}
                placeholder="e.g. Mumbai"
                disabled={isPending}
                style={{ ...inputStyle, opacity: isPending ? 0.6 : 1 }}
                onFocus={focusAccent}
                onBlur={blurReset}
              />
            ) : (
              <p style={readValueStyle(savedCity.trim() !== '')}>
                {savedCity.trim() || '—'}
              </p>
            )}
          </div>

          {/* Details — full width below City */}
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={labelStyle}>{DETAILS_FIELD.label}</p>
            {active && canEdit ? (
              <textarea
                value={values[DETAILS_FIELD.key] ?? ''}
                onChange={(e) => handleChange(DETAILS_FIELD.key, e.target.value)}
                placeholder={DETAILS_FIELD.placeholder}
                disabled={isPending}
                rows={3}
                style={{ ...textareaStyle, opacity: isPending ? 0.6 : 1 }}
                onFocus={focusAccent}
                onBlur={blurReset}
              />
            ) : (
              <p style={readValueStyle((saved[DETAILS_FIELD.key] ?? '').trim() !== '')}>
                {(saved[DETAILS_FIELD.key] ?? '').trim() || '—'}
              </p>
            )}
          </div>

          {error && (
            <p style={{ gridColumn: '1 / -1', fontSize: 'var(--text-xs)', color: 'var(--color-danger-text)', margin: 0 }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer — only shown when active */}
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

        {/* Hint when no data and not active */}
        {!active && !hasAnyValue && canEdit && (
          <div style={{ padding: '0 var(--space-5) var(--space-4)', marginTop: 'calc(var(--space-4) * -1)' }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', margin: 0, fontStyle: 'italic' }}>
              Click any field to add details.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
