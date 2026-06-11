"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { SectionCard } from "@/components/ui/SectionCard";
import { TaskCompletionCircle } from "@/components/tasks/TaskCompletionCircle";
import { useTaskCompletionToggle } from "@/hooks/useTaskCompletionToggle";
import { TASK_TYPE_LABELS } from "@/lib/constants/task-types";
import { TASK_STATUS } from "@/lib/constants/task-constants";
import { formatTaskDueAt } from "@/lib/utils/dates";
import type { Task } from "@/lib/types/database";

// Load-on-intent (perf audit G-1): already conditional-rendered below, so the
// dynamic import alone keeps the modal chunk out of the dossier route chunk.
const CreateLeadTaskModal = dynamic(
  () =>
    import("@/components/leads/CreateLeadTaskModal").then(
      (m) => m.CreateLeadTaskModal,
    ),
  { ssr: false },
);

interface LeadTasksCardProps {
  leadId: string;
  initialTasks: Task[];
}

const TERMINAL = new Set(["completed", "cancelled", "error"]);

export function LeadTasksCard({ leadId, initialTasks }: LeadTasksCardProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [modalOpen, setModalOpen] = useState(false);

  const { getEffectiveStatus, handleToggle } = useTaskCompletionToggle();

  // Keep in sync when LeadTasksAsync refetches after router.refresh()
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  function handleTaskCreated(task: Task) {
    setTasks((prev) => {
      if (prev.some((t) => t.id === task.id)) return prev;
      return [task, ...prev];
    });
    router.refresh();
  }

  return (
    <>
      <div style={{ flexShrink: 0 }}>
        <SectionCard
          title="Gia Tasks"
          bodyPadding={false}
          headerRight={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Add follow-up task"
              className="eia-pressable eia-icon-rotate-hover"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--theme-paper-border)",
                background: "transparent",
                color: "var(--theme-text-secondary)",
                cursor: "pointer",
                padding: 0,
                transition:
                  "color var(--duration-fast) var(--ease-in-out), border-color var(--duration-fast) var(--ease-in-out)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--theme-accent)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--theme-accent-muted)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--theme-text-secondary)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--theme-paper-border)";
              }}
            >
              <Plus style={{ width: 14, height: 14, strokeWidth: 1.5 }} />
            </button>
          }
        >
          <div
            style={{
              maxHeight: "min(220px, 28vh)",
              overflowY: "auto",
              padding: "var(--space-4)",
            }}
          >
            {tasks.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "var(--text-sm)",
                  color: "var(--theme-text-tertiary)",
                  margin: 0,
                  textAlign: "center",
                  padding: "var(--space-1) 0",
                }}
              >
                No tasks yet.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {tasks.map((task) => {
                  const effectiveStatus = getEffectiveStatus(
                    task.id,
                    task.status,
                  );
                  const isTerminal = TERMINAL.has(effectiveStatus);
                  const isOverdue =
                    !isTerminal &&
                    task.due_at &&
                    new Date(task.due_at) < new Date();
                  const dueLabel = formatTaskDueAt(task.due_at);
                  const statusConfig = TASK_STATUS[effectiveStatus];

                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        opacity: isTerminal ? 0.5 : 1,
                        transition:
                          "opacity var(--duration-fast) var(--ease-in-out)",
                      }}
                    >
                      <TaskCompletionCircle
                        checked={effectiveStatus === "completed"}
                        disabled={isTerminal && effectiveStatus !== "completed"}
                        onToggle={(e) =>
                          handleToggle(e, { id: task.id, status: task.status })
                        }
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--text-sm)",
                            color: isTerminal
                              ? "var(--theme-text-tertiary)"
                              : "var(--theme-text-primary)",
                            margin: 0,
                            textDecoration:
                              effectiveStatus === "completed"
                                ? "line-through"
                                : "none",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {TASK_TYPE_LABELS[task.task_type]}
                        </p>

                        {task.description && (
                          <p
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize: "var(--text-xs)",
                              color: "var(--theme-text-tertiary)",
                              margin: "var(--space-1) 0 0",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                          flexShrink: 0,
                        }}
                      >
                        {/* Status pill — not shown for to_do (default) */}
                        {effectiveStatus !== "to_do" && statusConfig && (
                          <span
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize: "var(--text-2xs)",
                              fontWeight: "var(--weight-semibold)",
                              padding: "2px 6px",
                              borderRadius: "var(--radius-full)",
                              background: statusConfig.pillBg,
                              color: statusConfig.pillText,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {statusConfig.label}
                          </span>
                        )}

                        {dueLabel && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "var(--text-xs)",
                              color: isOverdue
                                ? "var(--color-danger-text)"
                                : "var(--theme-text-tertiary)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {dueLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <CreateLeadTaskModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            leadId={leadId}
            onTaskCreated={handleTaskCreated}
          />
        )}
      </AnimatePresence>
    </>
  );
}
