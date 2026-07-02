"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/actions/_auth";
import { sanitizeText } from "@/lib/utils/sanitize";
import { createRechargeSchema } from "@/lib/validations/recharge-schema";
import type { ActionResult, UserRole } from "@/lib/types";

const ADMIN_ROLES: UserRole[] = ["admin", "founder"];

export type CreateRechargeResult = { id: string };

// Map internal Zod issue codes → one user-facing message. Card-PAN rejections
// deliberately surface a clear "no card numbers" message; everything else is a
// generic "check the fields" line (Q-04 — never a raw Zod default).
function messageForIssue(code: string): string {
  if (code === "method_card_pan" || code === "note_card_pan") {
    return "Remove the card number — only a payment-method label (e.g. NEFT, Razorpay) is stored.";
  }
  if (code === "amount_must_be_positive" || code === "amount_invalid")
    return "Enter a recharge amount greater than zero.";
  if (code === "amount_too_large") return "That amount looks too large — please check it.";
  if (code === "ad_account_invalid") return "Choose one of the ad accounts.";
  if (code === "recharged_at_invalid") return "Choose a valid recharge date.";
  if (code === "currency_invalid") return "Choose a valid currency.";
  return "Some fields need a second look. Please review and try again.";
}

// ─────────────────────────────────────────────────────────
// createRechargeAction
// Records one ad-account recharge. Admin/founder only. Mirrors the
// uploadAdSpendAction shape: Zod → requireProfile → re-sanitize → insert →
// revalidate('/budget'). method/note are sanitized labels — never card data.
// ─────────────────────────────────────────────────────────
export async function createRechargeAction(
  input: unknown,
): Promise<ActionResult<CreateRechargeResult>> {
  const parsed = createRechargeSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "";
    return { data: null, error: messageForIssue(first) };
  }

  const auth = await requireProfile(ADMIN_ROLES);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  const { adAccount, amount, currency, rechargedAt, method, note } = parsed.data;

  // Re-sanitize the free-text labels server-side (S-02) — never trust the
  // client. The Zod refine + the DB CHECK already block card PANs; sanitizeText
  // strips any HTML and collapses whitespace.
  const cleanMethod = method ? sanitizeText(method) || null : null;
  const cleanNote   = note ? sanitizeText(note) || null : null;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("ad_account_recharges")
    .insert({
      ad_account:   adAccount,
      platform:     "meta",
      amount,
      currency,
      recharged_at: rechargedAt,
      method:       cleanMethod,
      note:         cleanNote,
      done_by:      caller.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[recharge-action] insert failed:", error);
    return { data: null, error: "The recharge couldn't be saved. Please try again." };
  }

  revalidatePath("/budget");
  return { data: { id: (data as { id: string }).id }, error: null };
}
