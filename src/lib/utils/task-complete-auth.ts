/**
 * Client-side mirror of canMutateTask rules for the completion circle control.
 * Server actions still enforce authorization — this only gates UI.
 */
export function canToggleTaskComplete(
  task: { assigned_to: string | null; created_by?: string | null },
  caller: { id: string; role: string; domain: string },
  groupDomain?: string | null,
): boolean {
  if (caller.role === 'admin' || caller.role === 'founder') return true;
  if (task.assigned_to === caller.id || task.created_by === caller.id) return true;
  if (caller.role === 'manager' && groupDomain && groupDomain === caller.domain) return true;
  return false;
}
