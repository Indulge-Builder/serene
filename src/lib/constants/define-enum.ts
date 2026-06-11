// defineEnum — THE factory for simple string-enum constants (dry-audit L-7).
//
// A values array, a labels record, an options list, and a Zod tuple maintained
// by hand drift apart (a new value lands in the array but not the labels record).
// Declare the enum ONCE as { id, label } pairs and derive everything:
//
//   const DEF = defineEnum([{ id: 'meta', label: 'Meta' }, …]);
//   export const LEAD_SOURCES       = DEF.values;
//   export const LEAD_SOURCE_LABELS = DEF.labels;
//   export const LEAD_SOURCE_OPTIONS = DEF.options;
//   export const LEAD_SOURCE_ENUM   = DEF.zodEnum;   // for z.enum()
//
// For enums whose union type lives in database.ts, annotate the exports
// (e.g. `export const TASK_TYPES: TaskType[] = DEF.values`) — the annotation
// keeps the exhaustiveness check the hand-written Record<TaskType, …> had.
//
// Scope: simple value/label triplets only. Richer config tables
// (TASK_PRIORITY/TASK_STATUS colour shapes, lead-status badge configs,
// domain subset structures) deliberately stay hand-written — their extra
// fields ARE their structure.

export type EnumDef<Id extends string> = {
  values:  Id[];
  labels:  Record<Id, string>;
  options: { id: Id; label: string }[];
  /** Non-empty tuple for `z.enum()`. */
  zodEnum: [Id, ...Id[]];
};

export function defineEnum<const T extends readonly { id: string; label: string }[]>(
  items: T,
): EnumDef<T[number]['id']> {
  type Id = T[number]['id'];
  const values  = items.map((i) => i.id as Id);
  const labels  = Object.fromEntries(items.map((i) => [i.id, i.label])) as Record<Id, string>;
  const options = items.map((i) => ({ id: i.id as Id, label: i.label }));
  return { values, labels, options, zodEnum: values as [Id, ...Id[]] };
}
