// THE typed boundary for untyped query results (dry-audit L-6).
//
// Supabase joined selects and RPCs not yet in the generated Database type come
// back as `any`/`unknown`. Instead of scattering `as Record<string, unknown>`
// casts and per-field `as` assertions through every service, declare a row type
// for the query shape and cross the boundary once:
//
//   type WaConversationRow = Omit<WhatsAppConversation, 'lead_name'> & { leads: {…} };
//   return mapRows<WaConversationRow, WhatsAppConversation>(data, mapConversationRow);
//
// The cast lives here, in exactly one place, and the mapper body is fully typed.
// Never add a new `as Record<string, unknown>` row-shaping cast in a service.

export function mapRows<TRow, TOut>(
  data: unknown,
  fn: (row: TRow, index: number) => TOut,
): TOut[] {
  if (!Array.isArray(data)) return [];
  return (data as TRow[]).map(fn);
}
