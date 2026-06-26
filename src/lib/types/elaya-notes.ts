// Hand-declared Elaya notes row type — TEMPORARY until database.ts is regenerated after
// migration 0152 is applied (the types/elaya-training.ts / types/revival.ts /
// types/suggestions.ts interim precedent). Shape mirrors the migration exactly. Type
// only — no runtime values. After regen: re-point ElayaNoteRow to
// Database['public']['Tables']['elaya_notes']['Row'].

export interface ElayaNoteRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}
