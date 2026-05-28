## Context — Eia Codebase

You are working on Eia, the internal operating system for Indulge Global — a luxury concierge brand. This is a production codebase, not a prototype. Read carefully before touching anything.

### Authority Files — Read These First, Every Session

1. /CLAUDE.md — root rules, file locations, never-do list
2. /docs/The_Rules.md — all non-negotiable rules (A-_, S-_, P-_, V-_, Q-\*)
3. /docs/The_Blueprint.md — architecture, stack, RBAC model
4. /supabase/migrations/CLAUDE.md — migration rules and RLS checklist

### Stack (final — do not suggest alternatives)

Next.js 16 App Router · TypeScript strict (no `any`) · Tailwind CSS v4 · shadcn/ui · Supabase (PostgreSQL 17, Auth, Realtime) · Framer Motion 11 · React Hook Form + Zod · Trigger.dev v3 · Vercel · pnpm

### Authorization Model

- Two axes: `role` (founder | admin | manager | agent | guest) and `domain` (concierge | onboarding | finance | marketing | tech | shop | b2b | house | legacy)
- Authorization reads ONLY from `public.profiles` — never from JWT claims
- Two helper functions exist: `get_user_role()` and `get_user_domain()` — SECURITY DEFINER, SET search_path = public. These are the only functions RLS policies call.
- Rule A-09: two-layer security always — RLS at DB level AND application check in the Server Action. Never rely on one layer alone.

### Task System — What Was Just Built (Migration 0017)

The OS-level task system was just implemented across four build prompts. Here is exactly what exists:

**Tables added/modified:**

- `tasks` (core) — extended with: `title`, `description`, `priority` (urgent|high|normal), `task_category` (personal|group_subtask|gia_followup), `group_id` FK → `task_groups`. Status migrated: `pending→to_do`, `done→completed`. Full enum: `to_do|in_progress|in_review|completed|error|cancelled`.
- `task_groups` — new table: id, title, description, priority, status, due_at, created_by → profiles, domain, timestamps
- `task_messages` — new append-only table: id, task_id → tasks, author_id → profiles, content, created_at. Realtime enabled. No UPDATE, no DELETE.

**Files created:**

- `src/lib/constants/task-constants.ts` — TASK_PRIORITY, TASK_STATUS, TASK_CATEGORY
- `src/lib/validations/task-schemas.ts` — all task Zod schemas
- `src/lib/services/tasks-service.ts` — getPersonalTasks, getGroupTasks, getGroupSubtasks, getTaskById, getTaskMessages
- `src/lib/actions/tasks.ts` — createPersonalTaskAction, createGroupTaskAction, createSubtaskAction, updateTaskStatusAction, updateTaskAction, deleteTaskAction, addTaskMessageAction
- `src/trigger/task-reminders.ts` — scheduleTaskReminder, cancelTaskReminder, sendTaskReminderTask
- `src/components/tasks/TaskModal.tsx` — two-column modal (details left, chat right)
- `src/components/tasks/TaskChatPanel.tsx` — Realtime message list + input
- `src/components/tasks/AssigneePickerModal.tsx` — domain-scoped user picker
- `src/app/(dashboard)/tasks/page.tsx` — Server Component
- `src/app/(dashboard)/tasks/TasksShell.tsx` — tab shell with URL param persistence
- `src/components/tasks/PersonalTasksTab.tsx` — personal tasks list with filters + quick-add
- `src/components/tasks/GroupTasksTab.tsx` — group tasks accordion with subtask rows

### Non-Negotiable Rules Relevant to Every Fix

- A-02: mutations via Server Actions only — no direct Supabase writes from client components
- A-03: all DB queries through service functions in lib/services/ — no raw Supabase in components
- A-08: every table has RLS enabled — no exceptions
- A-09: two-layer security — RLS + application layer both enforce access
- A-14: never edit a migration that has already run in production — write a new one
- S-01: every Server Action Zod-validates first, before any DB call
- S-06: never trust client-supplied IDs without verifying ownership at the application layer
- V-01: every colour is a CSS variable from src/styles/design-tokens.css — no hex, no hardcoded Tailwind colours
- V-05: z-index values only from the --z-\* token scale — no arithmetic on tokens, no z-[999]
- Q-11: every switch over a union type is exhaustive — use assertNever() from src/lib/utils/assert-never.ts, no default branch

### How to Fix Anything in This Codebase

1. Read the relevant files before writing a single line
2. Search the codebase for the existing pattern — extend it, do not duplicate it
3. New migrations: new file, never edit an existing one
4. After every fix: pnpm tsc --noEmit must pass with zero errors
5. Update the relevant CLAUDE.md and add one line to docs/changelog.md
