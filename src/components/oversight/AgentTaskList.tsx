import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { TASK_STATUS } from "@/lib/constants/task-constants";
import { formatTaskDueAt } from "@/lib/utils/dates";
import { ClipboardList } from "lucide-react";
import type { TaskStatus } from "@/lib/types/database";
import type { AgentOversightTask } from "@/lib/types/oversight";

// Tier 3 task list — the agent's personal + group tasks (the one oversight RPC's
// rows). Display-only, server-component-safe. Status colours come from the shared
// TASK_STATUS map in lib/constants (cross-feature flows through lib/, never an
// import from components/tasks/ — A-05). A lead follow-up row (leadId present —
// meta-presence) links to the lead dossier; other rows are inert.

const ACTIVE = new Set<string>(["to_do", "in_progress", "in_review"]);

export function AgentTaskList({ tasks }: { tasks: AgentOversightTask[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nothing on this agent's board."
        description="Open and recently-closed tasks will show here."
        framed
      />
    );
  }

  return (
    <div
      className="rounded-lg border bg-(--theme-paper) shadow-(--shadow-1) overflow-hidden"
      style={{ borderColor: "var(--theme-paper-border)" }}
    >
      <ul className="flex flex-col">
        {tasks.map((task, i) => (
          <TaskRow key={task.id} task={task} isLast={i === tasks.length - 1} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({ task, isLast }: { task: AgentOversightTask; isLast: boolean }) {
  const status = TASK_STATUS[task.status as TaskStatus] ?? TASK_STATUS.to_do;
  const isOverdue =
    !!task.overdueAt && !["completed", "cancelled", "error"].includes(task.status);
  const due = formatTaskDueAt(task.dueAt);

  // Context line: the group name (group subtask) or the linked lead (follow-up).
  const leadName =
    task.leadId &&
    [task.leadFirstName, task.leadLastName].filter(Boolean).join(" ").trim();
  const context = task.groupTitle ?? (leadName || null);

  const body = (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "var(--space-4) var(--space-5)",
        borderBottom: isLast ? "none" : "1px solid var(--theme-paper-border)",
      }}
    >
      {/* Status dot — a semantic dot, never a one-edge accent border (V-11). */}
      <span
        aria-hidden="true"
        className="shrink-0"
        style={{
          width: 8,
          height: 8,
          borderRadius: "var(--radius-full)",
          background: status.color,
        }}
      />

      <div className="min-w-0 flex-1">
        <span
          className="block truncate"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--theme-text-primary)",
            opacity: ACTIVE.has(task.status) ? 1 : 0.6,
          }}
        >
          {task.title}
        </span>
        {context && (
          <span
            className="block truncate"
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--theme-text-tertiary)",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            {context}
          </span>
        )}
      </div>

      {due && (
        <span
          className="shrink-0"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-2xs)",
            color: isOverdue ? "var(--color-warning)" : "var(--theme-text-tertiary)",
          }}
        >
          {due}
        </span>
      )}

      <span
        className="shrink-0"
        style={{
          fontSize: "var(--text-2xs)",
          fontWeight: "var(--weight-medium)",
          padding: "2px var(--space-2)",
          borderRadius: "var(--radius-full)",
          background: status.pillBg,
          color: status.pillText,
          whiteSpace: "nowrap",
        }}
      >
        {status.label}
      </span>
    </div>
  );

  // Lead follow-up → link to the dossier (slug-first); otherwise inert row.
  if (task.leadId && task.leadSlug) {
    return (
      <li>
        <Link
          href={`/leads/${task.leadSlug}?from=/oversight`}
          className="serene-activity-card block"
        >
          {body}
        </Link>
      </li>
    );
  }
  return <li>{body}</li>;
}
