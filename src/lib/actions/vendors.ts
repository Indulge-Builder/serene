"use server";

// actions/vendors.ts — the Vendors module's server actions (migrations 0183–0185).
//
// Every write: Zod (parseActionInput) → requireProfile(VENDOR_ROLES) →
// actorFromProfile → the shared core in services/vendor-mutations.ts →
// revalidatePath(VENDORS_PATH) → { data, error } (Rule 10). Every read: Zod →
// requireProfile(VENDOR_ROLES) → vendors-service. VENDOR_ROLES mirrors the
// 0183–0185 SELECT policies + the 0184 bucket policy (admin/founder for now —
// the concierge / shop floor widens this with the Sia UI, as its own
// migration + a one-line change here). The action IS the trust boundary: the
// tables carry no user write policies and the service reads on the admin client.

import { revalidatePath } from "next/cache";
import { requireProfile, actorFromProfile } from "@/lib/actions/_auth";
import { parseActionInput } from "@/lib/actions/_validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formErrors } from "@/lib/validations/form-errors";
import {
  searchVendors,
  getVendorDetail,
  rankVendorsForRequest,
} from "@/lib/services/vendors-service";
import {
  createVendorCore,
  updateVendorCore,
  setVendorStatusCore,
  upsertCapabilityCore,
  deleteCapabilityCore,
  logEngagementCore,
  closeEngagementCore,
  addReviewCore,
  addVendorNoteCore,
  setAgentPreferenceCore,
  removeAgentPreferenceCore,
  type VendorMutationError,
} from "@/lib/services/vendor-mutations";
import {
  CreateVendorSchema,
  UpdateVendorSchema,
  SetVendorStatusSchema,
  VendorIdSchema,
  UpsertCapabilitySchema,
  DeleteCapabilitySchema,
  LogEngagementSchema,
  CloseEngagementSchema,
  AddReviewSchema,
  SearchVendorsSchema,
  RankVendorsSchema,
  SignVendorInvoiceSchema,
  AddVendorNoteSchema,
  SetAgentPreferenceSchema,
  RemoveAgentPreferenceSchema,
} from "@/lib/validations/vendor-schema";
import {
  VENDORS_PATH,
  VENDOR_INVOICE_BUCKET,
  VENDOR_INVOICE_SIGNED_URL_TTL,
} from "@/lib/constants/vendors";
import type { ActionResult, UserRole } from "@/lib/types";
import type {
  VendorRow,
  VendorCapabilityRow,
  VendorEngagementRow,
  VendorReviewRow,
  VendorDetail,
  VendorNoteRow,
  VendorAgentPreferenceRow,
  RankedVendor,
} from "@/lib/types/vendor";

/** Who may read or write vendors — the SQL mirror is the 0183–0185 SELECT policies. */
const VENDOR_ROLES: readonly UserRole[] = ["admin", "founder"];

/** Core refusal → user copy. */
function mutationError(code: VendorMutationError): string {
  switch (code) {
    case "duplicate":      return formErrors.vendorNameTaken;
    case "not_found":      return formErrors.vendorNotFound;
    case "already_closed": return formErrors.vendorEngagementClosed;
    case "mismatch":       return formErrors.vendorEngagementMismatch;
    case "invalid":        return formErrors.vendorDateInvalid;
    case "db":             return formErrors.vendorSaveFailed;
  }
}

// ── Spine ──────────────────────────────────────────────────────────────────────

export async function createVendorAction(input: unknown): Promise<ActionResult<VendorRow>> {
  const parsed = parseActionInput(CreateVendorSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await createVendorCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

export async function updateVendorAction(input: unknown): Promise<ActionResult<VendorRow>> {
  const parsed = parseActionInput(UpdateVendorSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await updateVendorCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  // Both paths: the list shows the category column, and the edit itself happens
  // on the DETAIL page — revalidating only VENDORS_PATH left the very page the
  // user was looking at showing the old value.
  revalidatePath(VENDORS_PATH);
  revalidatePath(`${VENDORS_PATH}/${parsed.data.id}`);
  return { data: result.row, error: null };
}

export async function setVendorStatusAction(input: unknown): Promise<ActionResult<VendorRow>> {
  const parsed = parseActionInput(SetVendorStatusSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await setVendorStatusCore(actorFromProfile(auth.profile), parsed.data.id, parsed.data.status);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

// ── Capabilities ───────────────────────────────────────────────────────────────

export async function upsertCapabilityAction(input: unknown): Promise<ActionResult<VendorCapabilityRow>> {
  const parsed = parseActionInput(UpsertCapabilitySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await upsertCapabilityCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

export async function deleteCapabilityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseActionInput(DeleteCapabilitySchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await deleteCapabilityCore(actorFromProfile(auth.profile), parsed.data.id);
  if (!result.ok) {
    return { data: null, error: result.error === "not_found" ? formErrors.vendorCapabilityNotFound : mutationError(result.error) };
  }
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

// ── Engagements ────────────────────────────────────────────────────────────────

export async function logEngagementAction(input: unknown): Promise<ActionResult<VendorEngagementRow>> {
  const parsed = parseActionInput(LogEngagementSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await logEngagementCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

export async function closeEngagementAction(input: unknown): Promise<ActionResult<VendorEngagementRow>> {
  const parsed = parseActionInput(CloseEngagementSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await closeEngagementCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) {
    return { data: null, error: result.error === "not_found" ? formErrors.vendorEngagementNotFound : mutationError(result.error) };
  }
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

// ── Reviews ────────────────────────────────────────────────────────────────────

export async function addReviewAction(input: unknown): Promise<ActionResult<VendorReviewRow>> {
  const parsed = parseActionInput(AddReviewSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await addReviewCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) {
    return { data: null, error: result.error === "not_found" ? formErrors.vendorEngagementNotFound : mutationError(result.error) };
  }
  revalidatePath(VENDORS_PATH);
  return { data: result.row, error: null };
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function addVendorNoteAction(input: unknown): Promise<ActionResult<VendorNoteRow>> {
  const parsed = parseActionInput(AddVendorNoteSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await addVendorNoteCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(`${VENDORS_PATH}/${parsed.data.vendor_id}`);
  return { data: result.row, error: null };
}

/** The caller's sticky note on a vendor — preferred / avoid + why (0191). */
export async function setAgentPreferenceAction(input: unknown): Promise<ActionResult<VendorAgentPreferenceRow>> {
  const parsed = parseActionInput(SetAgentPreferenceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await setAgentPreferenceCore(actorFromProfile(auth.profile), parsed.data);
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(`${VENDORS_PATH}/${parsed.data.vendor_id}`);
  return { data: result.row, error: null };
}

export async function removeAgentPreferenceAction(
  input: unknown,
): Promise<ActionResult<{ vendor_id: string; agent_id: string }>> {
  const parsed = parseActionInput(RemoveAgentPreferenceSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const result = await removeAgentPreferenceCore(
    actorFromProfile(auth.profile), parsed.data.vendor_id, parsed.data.agent_id,
  );
  if (!result.ok) return { data: null, error: mutationError(result.error) };
  revalidatePath(`${VENDORS_PATH}/${parsed.data.vendor_id}`);
  return { data: result.row, error: null };
}

// ── Reads ──────────────────────────────────────────────────────────────────────

export async function searchVendorsAction(input: unknown): Promise<ActionResult<VendorRow[]>> {
  const parsed = parseActionInput(SearchVendorsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const rows = await searchVendors({
    query: parsed.data.query,
    category: parsed.data.category,
    status: parsed.data.status,
    limit: parsed.data.limit,
  });
  return { data: rows, error: null };
}

export async function getVendorDetailAction(input: unknown): Promise<ActionResult<VendorDetail>> {
  const parsed = parseActionInput(VendorIdSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const detail = await getVendorDetail(parsed.data.id);
  if (!detail) return { data: null, error: formErrors.vendorNotFound };
  return { data: detail, error: null };
}

/** "Best vendor for this ticket" — the asking agent defaults to the caller. */
export async function rankVendorsAction(input: unknown): Promise<ActionResult<RankedVendor[]>> {
  const parsed = parseActionInput(RankVendorsSchema, input);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const ranked = await rankVendorsForRequest({
    phrase: parsed.data.phrase,
    category: parsed.data.category,
    service: parsed.data.service,
    city: parsed.data.city,
    clientId: parsed.data.member_id,
    // The caller's own sticky notes shape their answer (0191) — never a
    // client-supplied id, so nobody can ask "what would Anisha see".
    agentId: auth.profile.id,
    limit: parsed.data.limit,
  });
  return { data: ranked, error: null };
}

/** A 1-hour signed url for an invoice path in the private bucket (the subscriptions pattern). */
export async function signVendorInvoiceAction(input: unknown): Promise<ActionResult<{ url: string }>> {
  const parsed = parseActionInput(SignVendorInvoiceSchema, input);
  if (!parsed.ok) return { data: null, error: formErrors.generic };
  const auth = await requireProfile(VENDOR_ROLES);
  if (!auth.ok) return auth.result;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(VENDOR_INVOICE_BUCKET)
    .createSignedUrl(parsed.data.path, VENDOR_INVOICE_SIGNED_URL_TTL);
  if (error || !data) return { data: null, error: formErrors.generic };
  return { data: { url: data.signedUrl }, error: null };
}
