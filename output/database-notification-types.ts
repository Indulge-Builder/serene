// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTED SLICE of src/lib/types/database.ts — the notification event model only.
// The full database.ts is auto-generated and ~1575 lines; this is the relevant part.
// Source line refs noted per block.
// ─────────────────────────────────────────────────────────────────────────────

// src/lib/types/database.ts L476–516 — the generated `notifications` table row/insert/update shape
// (inside Database['public']['Tables']):
//
//   notifications: {
//     Row: {
//       action_url: string | null
//       body: string | null
//       created_at: string
//       id: string
//       read_at: string | null
//       recipient_id: string
//       title: string
//       type: NotificationType
//     }
//     Insert: {
//       action_url?: string | null
//       body?: string | null
//       created_at?: string
//       id?: string
//       read_at?: string | null
//       recipient_id: string
//       title: string
//       type: NotificationType
//     }
//     Update: {
//       action_url?: string | null
//       body?: string | null
//       created_at?: string
//       id?: string
//       read_at?: string | null
//       recipient_id?: string
//       title?: string
//       type?: NotificationType
//     }
//     Relationships: [
//       {
//         foreignKeyName: "notifications_recipient_id_fkey"
//         columns: ["recipient_id"]
//         isOneToOne: false
//         referencedRelation: "profiles"
//         referencedColumns: ["id"]
//       },
//     ]
//   }

// src/lib/types/database.ts L1516–1526 — THE event taxonomy.
// Every notification ever created has one of these `type` values. This union IS the
// "how events become notifications" contract on the type side; the DB CHECK constraint
// (see 20260612000113_task_overdue_and_notification_types.sql) mirrors it.
export type NotificationType =
  | 'lead_assigned'
  | 'lead_won'
  | 'task_due'
  | 'task_assigned'
  | 'mention'
  | 'system'
  | 'sla_breach_agent'
  | 'sla_breach_manager'
  | 'sla_breach_founder'
  | 'task_overdue_manager'

// src/lib/types/database.ts L1561–1563 — the app-facing row type the bell/service/actions use.
// NOTE the deliberate widening: `type` is `string` here (not `NotificationType`) "kept as string
// for service compatibility" — callers narrow via NotificationType at the edges.
//
// export type Notification = Database['public']['Tables']['notifications']['Row'] & {
//   type: string
// }
