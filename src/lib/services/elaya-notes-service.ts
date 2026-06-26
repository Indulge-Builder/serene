import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ELAYA_NOTES_PROMPT_BUDGET } from "@/lib/constants/elaya-notes";
import type { ElayaNoteRow } from "@/lib/types/elaya-notes";

// ─────────────────────────────────────────────────────────────────────────
// Elaya per-user notes reads (migration 0152). Feature 3 / Block 4 — the Notes section.
//
// Two readers, ONE table. They differ ONLY in client + shaping, each documented inline.
//   • getMyNotes        — the /notes PAGE list. Session client (owner-only RLS is the
//                         net); the page already auth-gates. Newest-edited first.
//   • getNotesForElaya  — the TURN read. ADMIN client + explicit user_id scope (the
//                         channel-parity rule, src/lib/elaya/CLAUDE.md): an Elaya turn
//                         runs SESSIONLESS on WhatsApp, where a session client's
//                         auth.uid() is NULL and RLS returns [] — the silent-blank trap.
//                         Identity = principal.userId (verified by the caller), enforced
//                         in this query, NEVER auth.uid(). Returns the most-recently-
//                         updated notes first, trimmed to a TOTAL char budget so they fit
//                         the cached prompt prefix without re-billing it (the persona +
//                         learned posture). This is the body retrieveMemoryContext reads.
//
// No Redis (notes change per the owner, read live). A note is CONTEXT, never permission.
// ─────────────────────────────────────────────────────────────────────────

export async function getMyNotes(): Promise<ElayaNoteRow[]> {
  try {
    // Not yet in the generated Database type (interim — regen drops the cast).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createClient()) as any;
    const { data, error } = await supabase
      .from("elaya_notes")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error || !data) return [];
    return data as unknown as ElayaNoteRow[];
  } catch (err) {
    console.error("[elaya-notes-service] getMyNotes error:", err);
    return [];
  }
}

/**
 * THE turn read — the user's notes as plain text, scoped to `userId` in code (works
 * sessionless on both channels). Returns each note as a `title\nbody` block, newest-
 * edited first, with the running total capped at ELAYA_NOTES_PROMPT_BUDGET chars: once
 * the budget is spent the remaining (older) notes are dropped so the cached prefix stays
 * bounded. Load-all today; the SIGNATURE is the seam a future semantic retrieval slots
 * behind (memory.ts). Fails soft to [] — a notes read never breaks a turn.
 */
export async function getNotesForElaya(userId: string): Promise<string[]> {
  try {
    if (!userId) return [];
    // Admin client — the turn is sessionless; identity is the verified principal.userId,
    // enforced in this query, never auth.uid() (the elaya-data.ts parity rule).
    // Not yet in the generated Database type (interim — regen drops the cast).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;
    const { data, error } = await supabase
      .from("elaya_notes")
      .select("title, body, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) return [];

    const out: string[] = [];
    let spent = 0;
    for (const row of data as { title: string | null; body: string | null }[]) {
      const title = (row.title ?? "").trim();
      const body = (row.body ?? "").trim();
      const text = title && body ? `${title}\n${body}` : title || body;
      if (!text) continue;
      if (spent + text.length > ELAYA_NOTES_PROMPT_BUDGET) break; // budget spent — drop the tail
      out.push(text);
      spent += text.length;
    }
    return out;
  } catch (err) {
    console.error("[elaya-notes-service] getNotesForElaya error:", err);
    return [];
  }
}
