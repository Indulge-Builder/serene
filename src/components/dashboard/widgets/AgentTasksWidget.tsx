"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { getAgentTasksSummaryAction } from "@/lib/actions/dashboard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils/dates";
import {
  TASK_CATEGORY,
  TASK_PRIORITY,
  TASK_STATUS,
} from "@/lib/constants/task-constants";
import type { DashboardAgentTask } from "@/lib/types";
import type { WidgetProps } from "../DashboardWidgetSlot";
import { useWidgetData } from "@/hooks/useWidgetData";
import { useWidgetDensityTier } from "@/hooks/useWidgetDensity";

// Keyframe injected once — GPU-only pulse on the category dot.
// scale + opacity only, no layout properties.
const DOT_PULSE_CSS = `
@keyframes serene-cat-dot-pulse {
  0%, 100% { transform: scale(1);    opacity: 1;    }
  50%       { transform: scale(1.55); opacity: 0.55; }
}
`;

function CategoryDot({
  category,
}: {
  category: DashboardAgentTask["task_category"];
}) {
  const cfg = TASK_CATEGORY[category];
  const delay =
    category === "personal"
      ? "0s"
      : category === "group_subtask"
        ? "0.4s"
        : "0.8s";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: cfg.dotColor,
        flexShrink: 0,
        animation: `serene-cat-dot-pulse 2.4s ease-in-out ${delay} infinite`,
        willChange: "transform, opacity",
      }}
    />
  );
}

function PriorityChip({
  priority,
}: {
  priority: DashboardAgentTask["priority"];
}) {
  if (priority === "normal") return null;
  const cfg = TASK_PRIORITY[priority];
  return (
    <span
      style={{
        fontSize: "var(--text-2xs)",
        fontWeight: "var(--weight-medium)",
        color: cfg.color,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  );
}

function StatusChip({ status }: { status: DashboardAgentTask["status"] }) {
  const cfg = TASK_STATUS[status];
  if (status === "to_do") return null;
  return (
    <span
      style={{
        fontSize: "var(--text-2xs)",
        padding: "1px 6px",
        borderRadius: "var(--radius-full)",
        background: cfg.pillBg,
        color: cfg.pillText,
        fontWeight: "var(--weight-medium)",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function TaskRow({ task }: { task: DashboardAgentTask }) {
  const href = task.lead_id ? `/leads/${task.lead_id}` : "/tasks";
  const isOverdue = task.is_overdue;

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-sm)",
        background: isOverdue
          ? "var(--color-danger-light)"
          : "var(--theme-paper-subtle)",
        border: "1px solid",
        borderColor: isOverdue ? "transparent" : "var(--theme-paper-border)",
        textDecoration: "none",
        minWidth: 0,
      }}
    >
      {/* Animated category dot */}
      <CategoryDot category={task.task_category} />

      {/* Title + context label */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "var(--text-sm)",
          color: isOverdue
            ? "var(--color-danger-text)"
            : "var(--theme-text-primary)",
        }}
      >
        {task.title}
        {task.context_label && (
          <span
            style={{
              color: isOverdue
                ? "var(--color-danger-text)"
                : "var(--theme-text-tertiary)",
              marginLeft: "var(--space-1)",
              fontSize: "var(--text-xs)",
              fontStyle: "italic",
              opacity: 0.8,
            }}
          >
            · {task.context_label}
          </span>
        )}
      </span>

      {/* Priority chip (only urgent/high) */}
      <PriorityChip priority={task.priority} />

      {/* Status chip (only in_progress / in_review) */}
      <StatusChip status={task.status} />

      {/* Due date */}
      {task.due_at && (
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: isOverdue
              ? "var(--color-danger-text)"
              : "var(--theme-text-tertiary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {formatDate(task.due_at, "dd MMM")}
        </span>
      )}
    </Link>
  );
}

export function AgentTasksWidget({ userId, initialData }: WidgetProps) {
  const seed = initialData?.agent_tasks ?? null;
  const { data, loaded, isPending, refetch } = useWidgetData<DashboardAgentTask[]>({
    seed,
    fetcher: () => getAgentTasksSummaryAction(userId),
    deps: [userId],
  });
  const tasks = data ?? [];

  function handleRefresh() {
    refetch();
  }

  // Silent 30s auto-poll — no loading state, no flash
  useEffect(() => {
    const id = setInterval(() => refetch(), 30_000);
    return () => clearInterval(id);
  }, [refetch]);

  const overdue = tasks.filter((t) => t.is_overdue);
  const active = tasks.filter((t) => !t.is_overdue);

  // Density tier — compact cells show a single summary line instead of the list.
  const tier = useWidgetDensityTier();
  const isCompact = tier === "compact";

  return (
    <>
      {/* Inject pulse keyframe once */}
      <style>{DOT_PULSE_CSS}</style>

      <div
        style={{
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--theme-paper-border)",
          background: "var(--theme-paper)",
          boxShadow: "var(--shadow-1)",
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p
            style={{
              fontSize: "var(--text-md)",
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              color: "var(--theme-text-primary)",
              margin: 0,
            }}
          >
            My Tasks<span className="page-title-dot">.</span>
          </p>
          <Button
            variant="ghost"
            onClick={handleRefresh}
            loading={isPending}
            title="Refresh"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: "1px solid var(--theme-paper-border)",
              flexShrink: 0,
            }}
            iconLeft={RefreshCcw}
            size="xs"
          />
        </div>

        {/* Compact tier — the cell is too small for a list; show a summary. */}
        {isCompact ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "var(--space-1)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-2xl)",
                fontWeight: "var(--weight-semibold)",
                lineHeight: 1,
                color: "var(--theme-text-primary)",
              }}
            >
              {tasks.length}
            </span>
            <span
              style={{
                fontSize: "var(--text-xs)",
                color:
                  overdue.length > 0
                    ? "var(--color-danger-text)"
                    : "var(--theme-text-tertiary)",
              }}
            >
              {tasks.length === 0
                ? "All clear"
                : overdue.length > 0
                  ? `${overdue.length} overdue`
                  : "open tasks"}
            </span>
          </div>
        ) : (
        /* Scrollable task list — flex:1 fills the fixed-height card */
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            scrollbarWidth: "none",
          }}
        >
          {/* Overdue section */}
          {overdue.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              <p
                style={{
                  fontSize: "var(--text-2xs)",
                  fontWeight: "var(--weight-medium)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--color-danger-text)",
                  margin: 0,
                }}
              >
                Overdue
              </p>
              {overdue.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}

          {/* Active tasks */}
          {active.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              {overdue.length > 0 && (
                <p
                  style={{
                    fontSize: "var(--text-2xs)",
                    fontWeight: "var(--weight-medium)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "var(--theme-text-tertiary)",
                    margin: 0,
                  }}
                >
                  Active
                </p>
              )}
              {active.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {loaded && tasks.length === 0 && (
            <EmptyState
              title="Nothing on your plate. Enjoy the quiet."
              style={{ padding: "var(--space-6) 0" }}
            />
          )}
        </div>
        )}

        {/* Category legend — hidden in compact tier */}
        {!isCompact && loaded && tasks.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              marginTop: "auto",
              paddingTop: "var(--space-2)",
              borderTop: "1px solid var(--theme-paper-border)",
            }}
          >
            {(["personal", "group_subtask"] as const).map(
              (cat) => (
                <span
                  key={cat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    fontSize: "var(--text-2xs)",
                    color: "var(--theme-text-tertiary)",
                  }}
                >
                  <CategoryDot category={cat} />
                  {TASK_CATEGORY[cat].label}
                </span>
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
