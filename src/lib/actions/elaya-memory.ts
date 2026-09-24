"use server";
// actions/elaya-memory.ts — the living memory's user-facing writes and the improvement-request
// queue's admin writes (migration 0237). The tables have no user write RLS: these gated actions on
// the service role ARE the sanctioned write path (the playbooks posture). A memory entry is live on
// the user's very next message, no deploy.
import { revalidatePath } from "next/cache";
import { requireProfile } from "./_auth";
import { parseActionInput } from "./_validation";
import { sanitizeText } from "@/lib/utils/sanitize";
import { AddMemoryEntrySchema, ResolveImprovementRequestSchema, RetireMemoryEntrySchema } from "@/lib/validations/elaya-memory-schema";
import {
  addMemoryEntryCore, listUserMemory, resolveImprovementRequestCore, retireMemoryEntryCore, type ElayaMemoryRow,
} from "@/lib/services/elaya-memory-service";
import { ELAYA_REQUESTS_PATH } from "@/lib/constants/elaya-memory";
import type { ActionResult } from "@/lib/types";

const ELEVATED = ["admin", "founder"] as const;

/** Add an entry: to one's own memory (any staff), or to another person's (admin/founder). */
export async function addMemoryEntryAction(input: unknown): Promise<ActionResult<ElayaMemoryRow>> {
  const parsed = parseActionInput(AddMemoryEntrySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const forSelf = !parsed.data.user_id || parsed.data.user_id === auth.profile.id;
  if (!forSelf && !(ELEVATED as readonly string[]).includes(auth.profile.role)) return { data: null, error: "Only an admin can add to someone else's memory." };
  const userId = parsed.data.user_id ?? auth.profile.id;
  const res = await addMemoryEntryCore(userId, { kind: parsed.data.kind, statement: sanitizeText(parsed.data.statement), source: forSelf ? "self" : "admin" });
  if (res.error || !res.data) return { data: null, error: res.error ?? "The entry could not be saved just now." };
  revalidatePath(forSelf ? "/profile" : `/admin/users/${userId}`);
  return { data: res.data, error: null };
}

/** Remove an entry: one's own (any staff), or anyone's (admin/founder). Retired, never deleted. */
export async function retireMemoryEntryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(RetireMemoryEntrySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const elevated = (ELEVATED as readonly string[]).includes(auth.profile.role);
  if (!elevated) {
    const own = (await listUserMemory(auth.profile.id)).some((e) => e.id === parsed.data.id);
    if (!own) return { data: null, error: "That entry is not yours to remove." };
  }
  const res = await retireMemoryEntryCore(parsed.data.id, auth.profile.id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath("/profile");
  if (res.userId) revalidatePath(`/admin/users/${res.userId}`);
  return { data: { id: parsed.data.id }, error: null };
}

/** The queue's verdict (admin/founder): fixed, declined, became a playbook, or back to open. */
export async function resolveImprovementRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(ResolveImprovementRequestSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile([...ELEVATED]);
  if (!auth.ok) return auth.result;
  const note = parsed.data.admin_note ? sanitizeText(parsed.data.admin_note) : null;
  const res = await resolveImprovementRequestCore(parsed.data.id, parsed.data.status, note, auth.profile.id);
  if (res.error) return { data: null, error: res.error };
  revalidatePath(ELAYA_REQUESTS_PATH);
  return { data: { id: parsed.data.id }, error: null };
}
