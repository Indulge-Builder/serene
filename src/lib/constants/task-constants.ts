import type { TaskStatus, TaskPriority, TaskCategory } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Group task accent colours
// Fixed palette of 10 muted, sophisticated colours that read well across
// all five Eia themes (Earth, Air, Water, Fire, Cosmos).
// These are display colours for the group task left-border, NOT theme tokens.
// Stored as { id, hex, label } so the UI can persist id to the DB without
// coupling to a specific hex value.
// NOTE: task_groups has no accent_color column yet — a migration is needed
// before these can be persisted. UI renders them; action call omits them.
// TODO: add `accent_color text` column to task_groups in a new migration.
// ─────────────────────────────────────────────
export const GROUP_TASK_ACCENT_COLORS: { id: string; hex: string; label: string }[] = [
  { id: 'slate-blue',    hex: '#5c7a9e', label: 'Slate Blue'    },
  { id: 'terracotta',    hex: '#c4714a', label: 'Terracotta'    },
  { id: 'sage-green',    hex: '#6b9e7a', label: 'Sage Green'    },
  { id: 'warm-gold',     hex: '#c49a3a', label: 'Warm Gold'     },
  { id: 'dusty-rose',    hex: '#b87a8a', label: 'Dusty Rose'    },
  { id: 'deep-teal',     hex: '#3a8a8a', label: 'Deep Teal'     },
  { id: 'muted-plum',    hex: '#7a5a9a', label: 'Muted Plum'    },
  { id: 'sand',          hex: '#b8a07a', label: 'Sand'          },
  { id: 'burnt-orange',  hex: '#c46a30', label: 'Burnt Orange'  },
  { id: 'charcoal',      hex: '#5a5a6a', label: 'Charcoal'      },
];

// ─────────────────────────────────────────────
// Group task icons
// 25 Lucide icon names relevant to work tasks.
// Stored as { id, label } where id is the exact Lucide component name.
// NOTE: task_groups has no icon_key column yet — a migration is needed
// before these can be persisted. UI renders them; action call omits them.
// TODO: add `icon_key text` column to task_groups in a new migration.
// ─────────────────────────────────────────────
export const GROUP_TASK_ICONS: { id: string; label: string }[] = [
  { id: 'Briefcase',     label: 'Briefcase'     },
  { id: 'Target',        label: 'Target'        },
  { id: 'Zap',           label: 'Zap'           },
  { id: 'Star',          label: 'Star'          },
  { id: 'Flag',          label: 'Flag'          },
  { id: 'Bell',          label: 'Bell'          },
  { id: 'Bookmark',      label: 'Bookmark'      },
  { id: 'Calendar',      label: 'Calendar'      },
  { id: 'CheckSquare',   label: 'Check'         },
  { id: 'Clock',         label: 'Clock'         },
  { id: 'FileText',      label: 'File'          },
  { id: 'Folder',        label: 'Folder'        },
  { id: 'Globe',         label: 'Globe'         },
  { id: 'Hash',          label: 'Hash'          },
  { id: 'Heart',         label: 'Heart'         },
  { id: 'Layers',        label: 'Layers'        },
  { id: 'Layout',        label: 'Layout'        },
  { id: 'List',          label: 'List'          },
  { id: 'MessageSquare', label: 'Message'       },
  { id: 'Package',       label: 'Package'       },
  { id: 'Search',        label: 'Search'        },
  { id: 'Settings',      label: 'Settings'      },
  { id: 'Shield',        label: 'Shield'        },
  { id: 'TrendingUp',    label: 'Trending'      },
  { id: 'Users',         label: 'Users'         },
];

// ─────────────────────────────────────────────
// Task remark status labels
// Past-tense labels shown in the timeline when a remark carried a status change.
// Values must cover all 6 TaskStatus values — exhaustiveness enforced by Record<TaskStatus, string>.
// ─────────────────────────────────────────────
export const TASK_REMARK_STATUS_LABELS: Record<TaskStatus, string> = {
  to_do:       'moved to To Do',
  in_progress: 'started work',
  in_review:   'sent for review',
  completed:   'marked complete',
  error:       'flagged an error',
  cancelled:   'cancelled this task',
};

// ─────────────────────────────────────────────
// Task priority config
// color values are CSS token names — never hex
// ─────────────────────────────────────────────
export const TASK_PRIORITY: Record<
  TaskPriority,
  { label: string; color: string; order: number }
> = {
  urgent: { label: 'Urgent', color: 'var(--color-danger)',  order: 1 },
  high:   { label: 'High',   color: 'var(--theme-warning)', order: 2 },
  normal: { label: 'Normal', color: 'var(--theme-text-tertiary)', order: 3 },
};

// ─────────────────────────────────────────────
// Task status config
// ─────────────────────────────────────────────
export const TASK_STATUS: Record<
  TaskStatus,
  { label: string; color: string; order: number }
> = {
  to_do:       { label: 'To Do',       color: 'var(--theme-text-secondary)', order: 1 },
  in_progress: { label: 'In Progress', color: 'var(--theme-accent)',         order: 2 },
  in_review:   { label: 'In Review',   color: 'var(--theme-warning)',        order: 3 },
  completed:   { label: 'Completed',   color: 'var(--color-success)',        order: 4 },
  error:       { label: 'Error',       color: 'var(--color-danger)',         order: 5 },
  cancelled:   { label: 'Cancelled',   color: 'var(--theme-text-tertiary)',  order: 6 },
};

// ─────────────────────────────────────────────
// Task category config
// ─────────────────────────────────────────────
export const TASK_CATEGORY: Record<
  TaskCategory,
  { label: string; color: string }
> = {
  personal:      { label: 'Personal',    color: 'var(--theme-accent)'       },
  group_subtask: { label: 'Group Task',  color: 'var(--theme-text-primary)' },
  gia_followup:  { label: 'Gia Follow-up', color: 'var(--color-info)'       },
};
