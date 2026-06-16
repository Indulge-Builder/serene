// Suggestion-box row types — hand-declared until `supabase gen types typescript`
// is re-run after the suggestions migration is applied (the generated Database
// type does not know the `suggestions` table yet). Shapes mirror the migration
// exactly. Types only — no runtime values. (The revival.ts / usage.ts pattern.)

import type { SuggestionCategory, SuggestionStatus } from "@/lib/constants/suggestions";

export type { SuggestionCategory, SuggestionStatus };

export type SuggestionRow = {
  id: string;
  sender_id: string;
  category: SuggestionCategory;
  message: string;
  /** Storage paths in the private `suggestions` bucket — NOT URLs. Sign on read. */
  image_paths: string[];
  status: SuggestionStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Inbox projection: a row + the sender's name + freshly-signed image URLs
 * (minted server-side at read time, short TTL — the private bucket never
 * exposes a public URL). The `WithAuthor` intersection isn't reused here
 * because the sender field is named `sender`, not `author`.
 */
export type SuggestionWithSender = SuggestionRow & {
  sender: { full_name: string } | null;
  /** Signed, time-limited URLs resolved from `image_paths` for admin viewing. */
  image_urls: string[];
};
