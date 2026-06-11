import type { TaskType, TaskStatus } from "@/lib/types/database";
import { defineEnum } from "./define-enum";

// The explicit `TaskType[]` / `Record<TaskType, string>` annotations keep the
// exhaustiveness check against the database union — if TaskType gains a member
// that is missing here, the labels assignment fails to compile.
const TASK_TYPE_DEF = defineEnum([
  { id: "call",             label: "Call"     },
  { id: "whatsapp_message", label: "WhatsApp" },
  { id: "other",            label: "Other"    },
]);

export const TASK_TYPES: TaskType[] = TASK_TYPE_DEF.values;
export const TASK_TYPE_LABELS: Record<TaskType, string> = TASK_TYPE_DEF.labels;

const TASK_STATUS_DEF = defineEnum([
  { id: "to_do",       label: "To Do"       },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review",   label: "In Review"   },
  { id: "completed",   label: "Completed"   },
  { id: "error",       label: "Error"       },
  { id: "cancelled",   label: "Cancelled"   },
]);

export const TASK_STATUSES: TaskStatus[] = TASK_STATUS_DEF.values;
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = TASK_STATUS_DEF.labels;
