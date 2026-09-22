"use server";
// actions/sia-staff-link.ts — "Link now" on the user page (admin/founder): runs the same phone
// link the 15-minute task runs, so a freshly saved phone links without waiting.
import { revalidatePath } from "next/cache";
import { requireProfile } from "./_auth";
import { parseActionInput } from "./_validation";
import { z } from "zod";
import { uuidField } from "@/lib/validations/fields";
import { linkStaffContactsByPhone, type StaffLinkResult } from "@/lib/services/sia-staff-link";
import type { ActionResult } from "@/lib/types";

const Schema = z.object({ profileId: uuidField("That user could not be found.") });

export async function linkStaffWhatsAppNowAction(input: unknown): Promise<ActionResult<StaffLinkResult>> {
  const parsed = parseActionInput(Schema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  const r = await linkStaffContactsByPhone();
  revalidatePath(`/admin/users/${parsed.data.profileId}`);
  return { data: r, error: null };
}
