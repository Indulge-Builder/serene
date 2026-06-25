'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { TaskStatusIcon } from './TaskStatusIcon';
import { formatDate } from '@/lib/utils/dates';
import { toast } from '@/lib/toast';
import { getCompletedTasksAction } from '@/lib/actions/tasks';
import { getAssignableUsersAction } from '@/lib/actions/profiles';
import type {
  CompletedTaskRow,
  CompletedTaskCursor,
} from '@/lib/services/tasks-service';
import type { AssignableUser } from '@/lib/types';
import type { UserRole, AppDomain } from '@/lib/types/database';

interface CompletedTasksModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    full_name: string;
    role: UserRole;
    domain: AppDomain;
  };
}

const MANAGER_ROLES: UserRole[] = ['manager', 'admin', 'founder'];

export function CompletedTasksModal({ open, onClose, currentUser }: CompletedTasksModalProps) {
  const canViewOthers = MANAGER_ROLES.includes(currentUser.role);

  const [targetUserId, setTargetUserId] = useState(currentUser.id);
  const [rows, setRows] = useState<CompletedTaskRow[]>([]);
  const [cursor, setCursor] = useState<CompletedTaskCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // People list for the picker (manager+ only) — lazy-loaded on first open.
  const [people, setPeople] = useState<AssignableUser[]>([]);
  const peopleLoaded = useRef(false);

  // Fetch a fresh page for a target (reset list). useCallback so the open/target
  // effect has a stable dependency.
  const loadFirstPage = useCallback(async (userId: string) => {
    setLoading(true);
    const res = await getCompletedTasksAction({ targetUserId: userId });
    setLoading(false);
    if (res.error || !res.data) {
      toast.danger(res.error ?? 'Could not load completed tasks.');
      setRows([]);
      setHasMore(false);
      setCursor(null);
      return;
    }
    setRows(res.data.tasks);
    setHasMore(res.data.hasMore);
    setCursor(res.data.nextCursor);
  }, []);

  // On open (and whenever the target changes while open), load the first page.
  useEffect(() => {
    if (!open) return;
    loadFirstPage(targetUserId);
  }, [open, targetUserId, loadFirstPage]);

  // Lazy-load the people list once, on first open, for manager+.
  useEffect(() => {
    if (!open || !canViewOthers || peopleLoaded.current) return;
    peopleLoaded.current = true;
    // Managers are scoped to their own domain; admin/founder see everyone.
    const domainArg = currentUser.role === 'manager' ? currentUser.domain : undefined;
    getAssignableUsersAction(domainArg).then((res) => {
      const users = res.data ?? [];
      // Ensure the caller themselves is always selectable, even if filtered out
      // (e.g. an admin/founder is not a lead-carrier and may be absent).
      const hasSelf = users.some((u) => u.id === currentUser.id);
      setPeople(hasSelf ? users : [{
        id: currentUser.id,
        full_name: currentUser.full_name,
        avatar_url: null,
        role: currentUser.role,
        domain: currentUser.domain,
      }, ...users]);
    });
  }, [open, canViewOthers, currentUser]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await getCompletedTasksAction({ targetUserId, cursor });
    setLoadingMore(false);
    if (res.error || !res.data) {
      toast.danger(res.error ?? 'Could not load more.');
      return;
    }
    setRows((prev) => [...prev, ...res.data!.tasks]);
    setHasMore(res.data.hasMore);
    setCursor(res.data.nextCursor);
  }, [cursor, loadingMore, targetUserId]);

  const isSelf = targetUserId === currentUser.id;
  const selectedName =
    people.find((p) => p.id === targetUserId)?.full_name ??
    (isSelf ? currentUser.full_name : 'Teammate');

  // bodyPadding={false}: own the layout so the picker strip + footer stay pinned
  // and only the list scrolls — the AssigneePickerModal anatomy. The Dialog still
  // owns the header chrome, the <md bottom-sheet (90dvh + safe-area), and the
  // panel surface. size="md" caps the desktop width at 600px (a dense list, not a
  // form) and lets the panel breathe at all breakpoints.
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isSelf ? 'My completed tasks' : `Completed · ${selectedName}`}
      size="md"
      bodyPadding={false}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: 1,
        }}
      >
        {/* Person picker strip — pinned (manager+ only) */}
        {canViewOthers && people.length > 0 && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-5)',
              borderBottom: '1px solid var(--theme-paper-border)',
              flexShrink: 0,
            }}
          >
            <FilterDropdown
              label="Person"
              items={people.map((p) => ({ id: p.id, label: p.full_name }))}
              selected={[targetUserId]}
              onChange={(sel) => {
                const next = sel[0];
                if (next && next !== targetUserId) setTargetUserId(next);
              }}
              multi={false}
              menuPortal
              hideCountBadge
              fullWidth
            />
          </div>
        )}

        {/* Scrollable list region — the only part that scrolls */}
        <div
          style={{
            flex: 1,
            // minHeight:0 lets the flex child shrink so overflow scrolls instead
            // of pushing the panel taller; the loading/empty states carry their
            // own vertical padding so the region never reads as a collapsed sliver.
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-8)',
              }}
            >
              <Spinner size="md" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              variant="inline"
              size="lg"
              title="Nothing completed yet."
              description={
                isSelf
                  ? 'Tasks you finish will appear here.'
                  : 'This person has no completed tasks yet.'
              }
              style={{ paddingTop: 'var(--space-10)', paddingBottom: 'var(--space-10)' }}
            />
          ) : (
            rows.map((task) => <CompletedTaskRowItem key={task.id} task={task} />)
          )}
        </div>

        {/* Load more — pinned footer-style strip */}
        {!loading && hasMore && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: '1px solid var(--theme-paper-border)',
              background: 'var(--theme-paper-subtle)',
              flexShrink: 0,
            }}
          >
            <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CompletedTaskRowItem({ task }: { task: CompletedTaskRow }) {
  // Personal task vs group subtask: the group title (when present) is the
  // context label; otherwise it's a standalone personal task.
  const contextLabel =
    task.task_category === 'group_subtask'
      ? task.group_title ?? 'Group task'
      : 'Personal';

  // Full-bleed row (padding here, not on the list container) so the divider and
  // any future hover state span edge-to-edge — the AssigneePickerModal pattern.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: '1px solid var(--theme-paper-border)',
      }}
    >
      <TaskStatusIcon status="completed" size={16} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--theme-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </p>
        <p
          style={{
            margin: '0.125rem 0 0',
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-semibold)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--theme-text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contextLabel}
        </p>
      </div>

      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--theme-text-tertiary)',
          flexShrink: 0,
        }}
      >
        {task.completed_at ? formatDate(task.completed_at, 'd MMM yyyy') : '—'}
      </span>
    </div>
  );
}
