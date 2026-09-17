"use server";

// actions/books.ts — the /books page's only mutation: Refresh (drop the Redis copy so the
// next render asks Zoho again). Admin/founder, the same audience as the page.
// Nothing here ever writes to Zoho.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "./_auth";
import { parseActionInput } from "./_validation";
import { uuidField } from "@/lib/validations/fields";
import { formErrors } from "@/lib/validations/form-errors";
import { invalidateBooksOverview, invalidateMemberFinance } from "@/lib/services/zoho-service";
import { memberQueendom } from "@/lib/services/members-service";
import { canAccessMember } from "@/lib/elaya/access";
import { ZOHO_BOOKS_PATH } from "@/lib/constants/zoho";
import { memberFinancePath } from "@/lib/constants/sia-roles";
import type { ActionResult } from "@/lib/types";

export async function refreshBooksOverviewAction(): Promise<ActionResult<{ ok: true }>> {
  const auth = await requireProfile(["admin", "founder"]);
  if (!auth.ok) return auth.result;
  await invalidateBooksOverview();
  revalidatePath(ZOHO_BOOKS_PATH);
  return { data: { ok: true }, error: null };
}

const RefreshMemberFinanceSchema = z.object({
  member_id: uuidField(formErrors.generic),
  zoho_customer_id: z.string().trim().regex(/^\d{5,30}$/, formErrors.generic),
});

export async function refreshMemberFinanceAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = parseActionInput(RefreshMemberFinanceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const q = await memberQueendom(parsed.data.member_id);
  if (!q.exists || !canAccessMember(auth.profile, q.queendom_id)) return { data: null, error: formErrors.unauthorized };
  await invalidateMemberFinance(parsed.data.zoho_customer_id);
  revalidatePath(memberFinancePath(parsed.data.member_id));
  return { data: { ok: true }, error: null };
}
