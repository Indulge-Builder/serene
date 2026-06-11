'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/Button';
import {
  FieldLabel,
  FieldError,
  PriorityChipRow,
  DueDateField,
  TaskTypeField,
} from '@/components/ui/TaskFormFields';
import { DOMAIN_LABELS } from '@/lib/constants/domains';
import { searchLeadsAction, createLeadTaskAction } from '@/lib/actions/leads';
import type { GiaTask } from '@/lib/services/tasks-service';
import type { LeadSearchResult } from '@/lib/services/leads-service';
import type { TaskType, TaskPriority, UserRole } from '@/lib/types/database';

// ─── Main component ───────────────────────────────────────────────────────────

interface CreateGiaTaskModalProps {
  open:          boolean;
  onClose:       () => void;
  onTaskCreated: (task: GiaTask) => void;
  callerRole:    UserRole;
}

export function CreateGiaTaskModal({
  open,
  onClose,
  onTaskCreated,
}: CreateGiaTaskModalProps) {
  // Form state
  const [selectedLead, setSelectedLead] = useState<LeadSearchResult | null>(null);
  const [taskType, setTaskType]         = useState<TaskType>('call');
  const [priority, setPriority]         = useState<TaskPriority>('normal');
  const [dueAt, setDueAt]               = useState<Date | null>(null);
  const [description, setDescription]   = useState('');
  const [error, setError]               = useState<string | null>(null);

  // Lead search state
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<LeadSearchResult[]>([]);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [isSearching, setIsSearching]     = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [isPending, startTransition] = useTransition();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedLead(null);
      setTaskType('call');
      setPriority('normal');
      setDueAt(null);
      setDescription('');
      setError(null);
      setSearchQuery('');
      setSearchResults([]);
      setSearchOpen(false);
    }
  }, [open]);

  // Debounced lead search (300ms via useDebounce)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    // Clearing the input closes results immediately — never waits for the debounce.
    if (!value.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    if (!trimmed) return;
    let cancelled = false;
    setIsSearching(true);
    searchLeadsAction(trimmed)
      .then((result) => {
        if (cancelled) return;
        setIsSearching(false);
        if (result.data) {
          setSearchResults(result.data);
          setSearchOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => { cancelled = true; };
  }, [debouncedSearchQuery]);

  function selectLead(lead: LeadSearchResult) {
    setSelectedLead(lead);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  }

  function clearLead() {
    setSelectedLead(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  }

  function handleClose() {
    onClose();
  }

  function handleSubmit() {
    if (!selectedLead) {
      setError('Please select a lead.');
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await createLeadTaskAction({
        leadId:      selectedLead.id,
        taskType,
        priority,
        dueAt:       dueAt ? dueAt.toISOString() : null,
        description: description.trim() || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data) {
        // Build a GiaTask shape from the returned Task + selected lead info
        const giaTask: GiaTask = {
          ...result.data,
          lead_id:         selectedLead.id,
          lead_first_name: selectedLead.first_name,
          lead_last_name:  selectedLead.last_name ?? null,
          lead_phone:      selectedLead.phone ?? null,
          lead_slug:       selectedLead.slug ?? null,
          lead_domain:     selectedLead.domain,
        };
        onTaskCreated(giaTask);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Gia Task"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSubmit}
            loading={isPending}
            disabled={isPending || !selectedLead}
          >
            Create Task
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        {/* 1. Lead search */}
        <div>
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }}>Lead</FieldLabel>

          {selectedLead ? (
            <div
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        'var(--space-2) var(--space-3)',
                background:     'var(--theme-paper-subtle)',
                border:         '1px solid var(--theme-paper-border)',
                borderRadius:   'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)' }}>
                  {[selectedLead.first_name, selectedLead.last_name].filter(Boolean).join(' ')}
                </span>
                <span
                  style={{
                    fontSize:   'var(--text-xs)',
                    color:      'var(--theme-text-tertiary)',
                    marginLeft: 'var(--space-2)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {selectedLead.phone ?? '—'}
                </span>
                <span
                  style={{
                    fontSize:      'var(--text-2xs)',
                    color:         'var(--theme-text-tertiary)',
                    marginLeft:    'var(--space-2)',
                    padding:       '1px var(--space-2)',
                    border:        '1px solid var(--theme-paper-border)',
                    borderRadius:  'var(--radius-full)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {DOMAIN_LABELS[selectedLead.domain] ?? selectedLead.domain}
                </span>
              </div>
              <button
                type="button"
                onClick={clearLead}
                aria-label="Clear lead selection"
                style={{
                  background: 'transparent',
                  border:     'none',
                  padding:    0,
                  cursor:     'pointer',
                  color:      'var(--theme-text-tertiary)',
                  display:    'flex',
                  alignItems: 'center',
                }}
              >
                <X style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  style={{
                    position:  'absolute',
                    left:      'var(--space-3)',
                    top:       '50%',
                    transform: 'translateY(-50%)',
                    width:     14,
                    height:    14,
                    strokeWidth: 1.5,
                    color:     'var(--theme-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                  autoComplete="off"
                  style={{
                    width:          '100%',
                    padding:        'var(--space-2) var(--space-3) var(--space-2) var(--space-8)',
                    background:     'var(--theme-paper)',
                    border:         '1px solid var(--theme-paper-border)',
                    borderRadius:   'var(--radius-md)',
                    fontSize:       'var(--text-sm)',
                    color:          'var(--theme-text-primary)',
                    outline:        'none',
                    boxSizing:      'border-box',
                  }}
                />
              </div>

              {searchOpen && searchResults.length > 0 && (
                <div
                  style={{
                    position:     'absolute',
                    top:          'calc(100% + var(--space-1))',
                    left:         0,
                    right:        0,
                    background:   'var(--theme-paper)',
                    border:       '1px solid var(--theme-paper-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow:    'var(--shadow-3)',
                    zIndex:       'var(--z-dropdown)',
                    maxHeight:    '220px',
                    overflowY:    'auto',
                  }}
                >
                  {searchResults.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => selectLead(lead)}
                      style={{
                        display:     'block',
                        width:       '100%',
                        textAlign:   'left',
                        padding:     'var(--space-2) var(--space-3)',
                        background:  'transparent',
                        border:      'none',
                        cursor:      'pointer',
                        borderBottom: '1px solid var(--theme-paper-border)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--theme-paper-subtle)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--theme-text-primary)', display: 'block' }}>
                        {[lead.first_name, lead.last_name].filter(Boolean).join(' ')}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {lead.phone ?? '—'} · {DOMAIN_LABELS[lead.domain] ?? lead.domain}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {isSearching && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--theme-text-tertiary)', marginTop: 'var(--space-1)' }}>
                  Searching...
                </p>
              )}

              {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
                <p
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontStyle:  'italic',
                    fontSize:   'var(--text-xs)',
                    color:      'var(--theme-text-tertiary)',
                    marginTop:  'var(--space-1)',
                  }}
                >
                  No leads found.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 2. Task type */}
        <div>
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }}>Task Type</FieldLabel>
          <TaskTypeField value={taskType} onChange={setTaskType} disabled={isPending} />
        </div>

        {/* 3. Priority */}
        <div>
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }}>Priority</FieldLabel>
          <PriorityChipRow value={priority} onChange={setPriority} disabled={isPending} />
        </div>

        {/* 4. Due date + time */}
        <DueDateField
          label="Due Date & Time"
          date={dueAt}
          onDateChange={setDueAt}
          placeholder="Pick date and time"
          disabled={isPending}
        />

        {/* 5. Notes */}
        <div>
          <FieldLabel style={{ marginBottom: 'var(--space-2)' }} optional>Notes</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any context or notes..."
            maxLength={1000}
            rows={3}
            style={{
              width:          '100%',
              padding:        'var(--space-2) var(--space-3)',
              background:     'var(--theme-paper)',
              border:         '1px solid var(--theme-paper-border)',
              borderRadius:   'var(--radius-md)',
              fontSize:       'var(--text-sm)',
              color:          'var(--theme-text-primary)',
              resize:         'vertical',
              outline:        'none',
              fontFamily:     'var(--font-sans)',
              boxSizing:      'border-box',
              lineHeight:     '1.5',
            }}
          />
        </div>

        {/* Error */}
        <FieldError message={error} />
      </div>
    </Modal>
  );
}
