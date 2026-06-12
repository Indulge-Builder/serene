'use client';

/**
 * AddSuggestionModal — create a new helpdesk suggestion (service_cases row)
 * from /helpdesk. Composes ui/modal.tsx for all chrome (Modal rule); field
 * primitives (FieldLabel, FieldError, FormChip) come from ui/TaskFormFields.tsx.
 *
 * Fields mirror ServiceCaseSchema (the fields CaseDetailModal displays):
 *   Title*     — what we delivered, one line
 *   Category*  — one of the 6 service categories (FormChip single-select)
 *   Domain     — which Gia library shelf this lands on (defaults to the page's)
 *   Story*     — the full summary agents read on a call
 *   Outcome    — optional result note
 *   City / Country — optional location
 *   Tags       — lowercase slug chips, max 10 (city tags drive dossier matches)
 *   Featured   — Toggle; featured cases sort first on the dossier card
 *
 * Save goes through upsertServiceCaseAction — Zod, admin/founder guard,
 * sanitizeText, Redis invalidation and revalidatePath('/helpdesk') all live
 * there; the refreshed RSC payload re-seeds the list, so the new suggestion
 * appears without any client-side merge.
 */

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { FieldLabel, FieldError, FormChip } from '@/components/ui/TaskFormFields';
import { upsertServiceCaseAction } from '@/lib/actions/intelligence';
import { ServiceCaseSchema } from '@/lib/validations/intelligence-schemas';
import { GIA_DOMAINS, DOMAIN_LABELS } from '@/lib/constants/domains';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
} from '@/lib/constants/interests';
import { toast } from '@/lib/toast';
import type { AppDomain } from '@/lib/types/database';

export interface AddSuggestionModalProps {
  open:          boolean;
  onClose:       () => void;
  /** The helpdesk library shelf the page is showing — pre-selects Domain. */
  initialDomain: AppDomain;
}

type FieldErrors = Partial<Record<string, string>>;

const MAX_TAGS = 10;

/** Schema tags are lowercase slugs — normalise as the user types so the rule never surfaces as an error. */
function toTagSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

const fieldChrome: React.CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  borderRadius: 'var(--radius-sm)',
  background:   'var(--theme-paper)',
  padding:      'var(--space-2) var(--space-3)',
  fontFamily:   'var(--font-sans)',
  fontSize:     'var(--text-sm)',
  color:        'var(--theme-text-primary)',
  caretColor:   'var(--theme-accent)',
  outline:      'none',
  transition:   'border-color var(--duration-fast) var(--ease-in-out)',
};

function borderFor(hasError: boolean): React.CSSProperties {
  return hasError
    ? { border: '1px solid var(--color-danger)', boxShadow: '0 0 0 3px var(--color-danger-light)' }
    : { border: '1px solid var(--theme-paper-border)' };
}

function focusField(e: React.FocusEvent<HTMLElement>, hasError: boolean) {
  if (hasError) return;
  e.currentTarget.style.borderColor = 'var(--theme-accent)';
  e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent)';
}

function blurField(e: React.FocusEvent<HTMLElement>, hasError: boolean) {
  if (hasError) return;
  e.currentTarget.style.borderColor = 'var(--theme-paper-border)';
  e.currentTarget.style.boxShadow = '';
}

export function AddSuggestionModal({ open, onClose, initialDomain }: AddSuggestionModalProps) {
  const [title,       setTitle]       = useState('');
  const [category,    setCategory]    = useState<string | null>(null);
  const [domain,      setDomain]      = useState<AppDomain>(initialDomain);
  const [summary,     setSummary]     = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [city,        setCity]        = useState('');
  const [country,     setCountry]     = useState('');
  const [tags,        setTags]        = useState<string[]>([]);
  const [tagInput,    setTagInput]    = useState('');
  const [isFeatured,  setIsFeatured]  = useState(false);
  const [errors,      setErrors]      = useState<FieldErrors>({});

  const titleRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Reset on open — never on error (form values survive a failed save)
  useEffect(() => {
    if (open) {
      setTitle('');
      setCategory(null);
      setDomain(initialDomain);
      setSummary('');
      setOutcomeNote('');
      setCity('');
      setCountry('');
      setTags([]);
      setTagInput('');
      setIsFeatured(false);
      setErrors({});
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, initialDomain]);

  function clearError(key: string) {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  // ── Tags chip input (CreatePersonalTaskModal pattern, slug-normalised) ─────
  function commitTag(raw: string) {
    const cleaned = toTagSlug(raw.replace(/,$/, ''));
    if (!cleaned || tags.length >= MAX_TAGS || tags.includes(cleaned)) return;
    setTags((prev) => [...prev, cleaned]);
    setTagInput('');
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag(tagInput);
    }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (isPending) return;

    const input = {
      domain,
      category:     category ?? '',
      title:        title.trim(),
      summary:      summary.trim(),
      outcome_note: outcomeNote.trim() || null,
      city:         city.trim() || null,
      country:      country.trim() || null,
      tags,
      is_featured:  isFeatured,
      sort_order:   0,
    };

    const parsed = ServiceCaseSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await upsertServiceCaseAction(input);
      if (result.error) {
        toast.danger('Could not save suggestion', { message: result.error });
        return;
      }
      toast.success('Suggestion saved');
      onClose();
    });
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        loading={isPending}
        disabled={isPending || !title.trim() || !summary.trim() || !category}
        iconLeft={Plus}
      >
        {isPending ? 'Saving…' : 'Save Suggestion'}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="New Suggestion" footer={footer} maxWidth="max-w-xl">
      {/* ─── Title ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel required>Title</FieldLabel>
        <input
          ref={titleRef}
          type="text"
          value={title}
          maxLength={120}
          onChange={(e) => { setTitle(e.target.value); clearError('title'); }}
          placeholder="What we delivered, in one line…"
          disabled={isPending}
          style={{ ...fieldChrome, ...borderFor(!!errors.title), height: 36 }}
          onFocus={(e) => focusField(e, !!errors.title)}
          onBlur={(e) => blurField(e, !!errors.title)}
        />
        <FieldError message={errors.title} />
      </div>

      {/* ─── Category ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel required>Category</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {SERVICE_CATEGORIES.map((c) => (
            <FormChip
              key={c}
              label={SERVICE_CATEGORY_LABELS[c]}
              active={category === c}
              onClick={() => { setCategory(c); clearError('category'); }}
              disabled={isPending}
            />
          ))}
        </div>
        <FieldError message={errors.category} />
      </div>

      {/* ─── Domain ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel>Domain</FieldLabel>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as AppDomain)}
          disabled={isPending}
          style={{ ...fieldChrome, ...borderFor(false), height: 36, cursor: 'pointer' }}
          onFocus={(e) => focusField(e, false)}
          onBlur={(e) => blurField(e, false)}
        >
          {GIA_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {DOMAIN_LABELS[d]}
            </option>
          ))}
        </select>
      </div>

      {/* ─── The story ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel required>The story</FieldLabel>
        <textarea
          value={summary}
          maxLength={1000}
          onChange={(e) => { setSummary(e.target.value); clearError('summary'); }}
          placeholder="What the client wanted, what we did, why it worked…"
          rows={4}
          disabled={isPending}
          style={{
            ...fieldChrome,
            ...borderFor(!!errors.summary),
            resize:     'vertical',
            lineHeight: 'var(--leading-relaxed)',
            minHeight:  96,
            maxHeight:  280,
          }}
          onFocus={(e) => focusField(e, !!errors.summary)}
          onBlur={(e) => blurField(e, !!errors.summary)}
        />
        <FieldError message={errors.summary} />
      </div>

      {/* ─── Outcome (optional) ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel optional>Outcome</FieldLabel>
        <textarea
          value={outcomeNote}
          maxLength={500}
          onChange={(e) => { setOutcomeNote(e.target.value); clearError('outcome_note'); }}
          placeholder="The result — renewal, referral, a thank-you note…"
          rows={2}
          disabled={isPending}
          style={{
            ...fieldChrome,
            ...borderFor(!!errors.outcome_note),
            resize:     'vertical',
            lineHeight: 'var(--leading-relaxed)',
            minHeight:  56,
            maxHeight:  160,
          }}
          onFocus={(e) => focusField(e, !!errors.outcome_note)}
          onBlur={(e) => blurField(e, !!errors.outcome_note)}
        />
        <FieldError message={errors.outcome_note} />
      </div>

      {/* ─── City / Country (optional) ─────────────────────────────────────── */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: '1fr 1fr',
          gap:                 'var(--space-3)',
          marginBottom:        'var(--space-5)',
        }}
      >
        <div>
          <FieldLabel optional>City</FieldLabel>
          <input
            type="text"
            value={city}
            maxLength={80}
            onChange={(e) => { setCity(e.target.value); clearError('city'); }}
            placeholder="Mumbai"
            disabled={isPending}
            style={{ ...fieldChrome, ...borderFor(!!errors.city), height: 36 }}
            onFocus={(e) => focusField(e, !!errors.city)}
            onBlur={(e) => blurField(e, !!errors.city)}
          />
          <FieldError message={errors.city} />
        </div>
        <div>
          <FieldLabel optional>Country</FieldLabel>
          <input
            type="text"
            value={country}
            maxLength={80}
            onChange={(e) => { setCountry(e.target.value); clearError('country'); }}
            placeholder="India"
            disabled={isPending}
            style={{ ...fieldChrome, ...borderFor(!!errors.country), height: 36 }}
            onFocus={(e) => focusField(e, !!errors.country)}
            onBlur={(e) => blurField(e, !!errors.country)}
          />
          <FieldError message={errors.country} />
        </div>
      </div>

      {/* ─── Tags ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <FieldLabel optional>Tags</FieldLabel>
        <div
          style={{
            display:      'flex',
            flexWrap:     'wrap',
            alignItems:   'center',
            gap:          'var(--space-1)',
            ...borderFor(!!errors.tags),
            borderRadius: 'var(--radius-sm)',
            background:   'var(--theme-paper)',
            padding:      'var(--space-1) var(--space-2)',
            minHeight:    36,
            cursor:       'text',
          }}
          onClick={() => document.getElementById('suggestion-tag-input')?.focus()}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          'var(--space-1)',
                padding:      '2px var(--space-2)',
                borderRadius: 'var(--radius-full)',
                background:   'var(--theme-accent-surface)',
                border:       '1px solid var(--theme-paper-border)',
                fontFamily:   'var(--font-mono)',
                fontSize:     'var(--text-xs)',
                color:        'var(--theme-accent)',
                userSelect:   'none',
              }}
            >
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTags((prev) => prev.filter((t) => t !== tag));
                }}
                aria-label={`Remove tag ${tag}`}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  background:     'none',
                  border:         'none',
                  padding:        0,
                  cursor:         'pointer',
                  color:          'var(--theme-accent)',
                  lineHeight:     1,
                }}
              >
                <X style={{ width: 10, height: 10, strokeWidth: 2 }} />
              </button>
            </span>
          ))}
          {tags.length < MAX_TAGS && (
            <input
              id="suggestion-tag-input"
              type="text"
              value={tagInput}
              onChange={(e) => {
                const v = e.target.value;
                if (v.endsWith(',')) commitTag(v);
                else setTagInput(v);
                clearError('tags');
              }}
              onKeyDown={handleTagKeyDown}
              onBlur={() => { if (tagInput.trim()) commitTag(tagInput); }}
              placeholder={tags.length === 0 ? 'mumbai, anniversary, yacht…' : ''}
              disabled={isPending}
              style={{
                flex:       '1 1 80px',
                minWidth:   80,
                border:     'none',
                outline:    'none',
                background: 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize:   'var(--text-xs)',
                color:      'var(--theme-text-primary)',
                caretColor: 'var(--theme-accent)',
                padding:    '2px var(--space-1)',
              }}
            />
          )}
        </div>
        <p
          style={{
            fontFamily:   'var(--font-sans)',
            fontSize:     'var(--text-xs)',
            color:        'var(--theme-text-tertiary)',
            marginTop:    'var(--space-1)',
            marginBottom: 0,
          }}
        >
          Press Enter or comma to add · lowercase slugs · max {MAX_TAGS}
        </p>
        <FieldError message={errors.tags} />
      </div>

      {/* ─── Featured ──────────────────────────────────────────────────────── */}
      <Toggle
        checked={isFeatured}
        onChange={setIsFeatured}
        disabled={isPending}
        label="Featured"
        description="Featured suggestions surface first on the lead dossier card."
        size="sm"
      />
    </Modal>
  );
}
