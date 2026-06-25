'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { toast } from '@/lib/toast';
import { bulkUpdateLeads } from '@/lib/actions/leads';
import { getAssignableUsersAction } from '@/lib/actions/profiles';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import { LEAD_SOURCE_OPTIONS } from '@/lib/constants/lead-sources';
import { GIA_DOMAIN_FILTER_ITEMS, DOMAIN_LABELS } from '@/lib/constants/domains';
import { LEAD_ASSIGNABLE_ROLES } from '@/lib/constants/roles';
import { BULK_STATUS_ENUM } from '@/lib/validations/lead-schema';
import type { AppDomain, UserRole } from '@/lib/types/database';
import type { AssignableUser } from '@/lib/types';

// ─────────────────────────────────────────────
// BulkEditLeadsModal — edit one OR MORE fields across the selected leads.
//
// Each field is opt-in (a Toggle). Only enabled fields are sent; the action
// applies each through the SAME write path as the single-edit equivalent
// (assignLeadCore / updateLeadStatusCore / source+domain admin update). Access is
// re-checked PER LEAD server-side — a lead the caller can't touch is skipped, not
// failed. The result toast reports updated / skipped / failed.
//
// Field gating mirrors the action: agents never see Domain or Assign-to (those
// require manager+). The assignee pool follows the chosen target domain (or, when
// domain is not being changed, the caller's domain) exactly like AddLeadModal.
// ─────────────────────────────────────────────
type BulkEditLeadsModalProps = {
  open:          boolean;
  onClose:       () => void;
  selectedIds:   string[];
  callerRole:    UserRole;
  callerDomain:  AppDomain;
  /** Cleared + page-refreshed on a successful update. */
  onSuccess:     () => void;
};

const fieldLabel: React.CSSProperties = {
  display:       'block',
  fontSize:      'var(--text-2xs)',
  fontWeight:    'var(--weight-semibold)',
  letterSpacing: 'var(--tracking-widest)',
  textTransform: 'uppercase',
  color:         'var(--theme-text-tertiary)',
  marginBottom:  'var(--space-2)',
};

const STATUS_ITEMS = BULK_STATUS_ENUM.map((s) => ({
  id:    s,
  label: LEAD_STATUS_LABELS[s],
}));

export function BulkEditLeadsModal({
  open,
  onClose,
  selectedIds,
  callerRole,
  callerDomain,
  onSuccess,
}: BulkEditLeadsModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canPrivileged = callerRole !== 'agent'; // domain + assignee (manager+)

  // Per-field opt-in + chosen value.
  const [editAssignee, setEditAssignee] = useState(false);
  const [editStatus, setEditStatus]     = useState(false);
  const [editSource, setEditSource]     = useState(false);
  const [editDomain, setEditDomain]     = useState(false);

  const [assigneeId, setAssigneeId] = useState<string>('');
  const [status, setStatus]         = useState<string>('');
  const [source, setSource]         = useState<string>('');
  const [domain, setDomain]         = useState<string>('');

  const [agents, setAgents] = useState<AssignableUser[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Reset everything whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setEditAssignee(false);
    setEditStatus(false);
    setEditSource(false);
    setEditDomain(false);
    setAssigneeId('');
    setStatus('');
    setSource('');
    setDomain('');
  }, [open]);

  // The domain the assignee pool is scoped to.
  //   • admin/founder: NO scope — a selection can span every domain, and the
  //     server (assignLeadCore) lets them assign to any active agent. Passing a
  //     domain here would hide agents and break a cross-domain reassign. The one
  //     exception: when they're also moving every selected lead to a single
  //     domain, narrow the pool to that domain so the picked agent is valid there.
  //   • manager: always their own domain (they can only reassign within it).
  const assigneeDomain: AppDomain | undefined =
    callerRole === 'admin' || callerRole === 'founder'
      ? (editDomain && domain ? (domain as AppDomain) : undefined)
      : callerDomain;

  // Fetch the assignee pool on demand — only once Assign-to is toggled on, and
  // re-fetched when the scoping domain changes. Mirrors AddLeadModal's pattern.
  useEffect(() => {
    if (!open || !editAssignee || !canPrivileged) return;
    let cancelled = false;
    setAgentsLoading(true);
    getAssignableUsersAction(assigneeDomain)
      .then((res) => {
        if (cancelled) return;
        // The unscoped (admin/founder, cross-domain) read returns every active
        // user — narrow to lead-carrying roles, the same set the action accepts
        // (LEAD_ASSIGNABLE_ROLES) so the dropdown never offers an invalid pick.
        const list = (res.data ?? []).filter((a) =>
          LEAD_ASSIGNABLE_ROLES.includes(a.role),
        );
        setAgents(list);
        // Drop a now-invalid pick when the pool changes under it.
        setAssigneeId((prev) => (list.some((a) => a.id === prev) ? prev : ''));
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editAssignee, canPrivileged, assigneeDomain]);

  // When the pool spans domains (admin/founder, no domain scope), suffix each name
  // with its domain so two same-named agents in different domains are distinguishable.
  const poolSpansDomains = assigneeDomain === undefined;
  const agentItems = useMemo(
    () =>
      agents.map((a) => ({
        id: a.id,
        label:
          poolSpansDomains && a.domain
            ? `${a.full_name ?? 'Unnamed'} · ${DOMAIN_LABELS[a.domain]}`
            : (a.full_name ?? 'Unnamed'),
      })),
    [agents, poolSpansDomains],
  );

  // Submit is valid only when at least one enabled field has a value.
  const hasValidChange =
    (editAssignee && !!assigneeId) ||
    (editStatus && !!status) ||
    (editSource && !!source) ||
    (editDomain && !!domain);

  function handleSubmit() {
    if (!hasValidChange || isPending) return;

    const changes: {
      assignedTo?: string;
      status?: string;
      source?: string;
      domain?: string;
    } = {};
    if (editAssignee && assigneeId) changes.assignedTo = assigneeId;
    if (editStatus && status)       changes.status = status;
    if (editSource && source)       changes.source = source;
    if (editDomain && domain)       changes.domain = domain;

    startTransition(async () => {
      const res = await bulkUpdateLeads({ leadIds: selectedIds, changes });
      if (res.error || !res.data) {
        toast.danger(res.error ?? 'Bulk update failed. Please try again.');
        return;
      }
      const { updated, skipped, failed } = res.data;
      const parts: string[] = [`${updated} lead${updated !== 1 ? 's' : ''} updated`];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (failed > 0) parts.push(`${failed} failed`);
      if (updated > 0) toast.success(parts.join(' · '));
      else toast.danger(parts.join(' · ') || 'Nothing was updated.');

      onSuccess();
      onClose();
      router.refresh();
    });
  }

  const count = selectedIds.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk edit leads"
      description={`Apply changes to ${count} selected lead${count !== 1 ? 's' : ''}.`}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSubmit}
            loading={isPending}
            disabled={!hasValidChange || isPending}
          >
            {isPending ? 'Updating…' : `Update ${count} lead${count !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Assign to — manager+ only */}
        {canPrivileged && (
          <FieldRow
            label="Reassign to agent"
            enabled={editAssignee}
            onToggle={setEditAssignee}
            disabled={isPending}
          >
            <FilterDropdown
              label={
                agentsLoading
                  ? 'Loading agents…'
                  : agentItems.find((a) => a.id === assigneeId)?.label ?? 'Choose an agent'
              }
              items={agentItems}
              selected={assigneeId ? [assigneeId] : []}
              onChange={(next) => setAssigneeId(next[0] ?? '')}
              fullWidth
              menuPortal
              hideCountBadge
            />
          </FieldRow>
        )}

        {/* Status — non-terminal set only (won/lost/junk stay single-edit) */}
        <FieldRow
          label="Set status"
          enabled={editStatus}
          onToggle={setEditStatus}
          disabled={isPending}
        >
          <FilterDropdown
            label={STATUS_ITEMS.find((s) => s.id === status)?.label ?? 'Choose a status'}
            items={STATUS_ITEMS}
            selected={status ? [status] : []}
            onChange={(next) => setStatus(next[0] ?? '')}
            fullWidth
            menuPortal
            hideCountBadge
          />
        </FieldRow>

        {/* Source */}
        <FieldRow
          label="Set source"
          enabled={editSource}
          onToggle={setEditSource}
          disabled={isPending}
        >
          <FilterDropdown
            label={LEAD_SOURCE_OPTIONS.find((s) => s.id === source)?.label ?? 'Choose a source'}
            items={LEAD_SOURCE_OPTIONS}
            selected={source ? [source] : []}
            onChange={(next) => setSource(next[0] ?? '')}
            fullWidth
            menuPortal
            hideCountBadge
          />
        </FieldRow>

        {/* Domain — manager+ only */}
        {canPrivileged && (
          <FieldRow
            label="Move to domain"
            enabled={editDomain}
            onToggle={setEditDomain}
            disabled={isPending}
          >
            <FilterDropdown
              label={
                GIA_DOMAIN_FILTER_ITEMS.find((d) => d.id === domain)?.label ?? 'Choose a domain'
              }
              items={GIA_DOMAIN_FILTER_ITEMS}
              selected={domain ? [domain] : []}
              onChange={(next) => setDomain(next[0] ?? '')}
              fullWidth
              menuPortal
              hideCountBadge
            />
          </FieldRow>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// FieldRow — a Toggle that gates a value picker. The picker is dimmed +
// non-interactive until the field is enabled, so the panel reads as a checklist
// of what will change.
// ─────────────────────────────────────────────
function FieldRow({
  label,
  enabled,
  onToggle,
  disabled,
  children,
}: {
  label:    string;
  enabled:  boolean;
  onToggle: (v: boolean) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-3)',
          marginBottom:   'var(--space-2)',
        }}
      >
        <span style={{ ...fieldLabel, marginBottom: 0 }}>{label}</span>
        <Toggle
          checked={enabled}
          onChange={onToggle}
          size="sm"
          disabled={disabled}
        />
      </div>
      <div
        style={{
          opacity:       enabled ? 1 : 0.45,
          pointerEvents: enabled && !disabled ? 'auto' : 'none',
          transition:    'opacity var(--duration-fast) var(--ease-in-out)',
        }}
        aria-hidden={!enabled}
      >
        {children}
      </div>
    </div>
  );
}
