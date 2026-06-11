"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formErrors } from "@/lib/validations/form-errors";
import { getProfileById } from "@/lib/services/profiles-service";
import { requireProfile } from "@/lib/actions/_auth";
import { setRoutingActive, setAgentShift } from "@/lib/services/agent-routing-service";
import { SetAgentShiftSchema } from "@/lib/validations/agent-routing-schema";
import type { ActionResult, AgentRoutingConfig } from "@/lib/types";

const toggleRoutingSchema = z.object({
  agent_id:  z.string().uuid("agent_id_invalid"),
  is_active: z.boolean(),
});

// ─────────────────────────────────────────────────────────
// toggleAgentRouting
// Flips the holiday switch for an agent's routing config.
// Allowed by: manager, admin, founder (enforced server-side + RLS).
// ─────────────────────────────────────────────────────────
export async function toggleAgentRouting(
  formData: FormData,
): Promise<ActionResult<AgentRoutingConfig>> {
  // Rule 02 — Zod validation first.
  const parsed = toggleRoutingSchema.safeParse({
    agent_id:  formData.get("agent_id"),
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    return { data: null, error: formErrors.generic };
  }

  // Rule 09 — authorization reads from public.profiles only.
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // Rule S-06 — verify ownership/domain for manager (audit F-2).
  if (caller.role === "manager") {
    const agentProfile = await getProfileById(parsed.data.agent_id);
    if (!agentProfile || agentProfile.domain !== caller.domain) {
      return { data: null, error: formErrors.unauthorized };
    }
  }

  const result = await setRoutingActive(parsed.data.agent_id, parsed.data.is_active);
  if (result.error) return { data: null, error: formErrors.generic };

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.agent_id}`);
  revalidatePath("/settings");
  return { data: result.data, error: null };
}

// ─────────────────────────────────────────────────────────
// setAgentShiftAction
// Writes shift_start / shift_end for a single agent.
// Allowed by: manager (own domain only), admin, founder.
// ─────────────────────────────────────────────────────────
export async function setAgentShiftAction(
  input: unknown,
): Promise<ActionResult<AgentRoutingConfig>> {
  // Rule 02 — Zod validation first.
  const parsed = SetAgentShiftSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return { data: null, error: first ?? formErrors.generic };
  }

  // Rule 09 — authorization reads from public.profiles only.
  const auth = await requireProfile(["manager", "admin", "founder"]);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  // Rule S-06 — verify ownership/domain for manager.
  if (caller.role === "manager") {
    const agentProfile = await getProfileById(parsed.data.agentId);
    if (!agentProfile || agentProfile.domain !== caller.domain) {
      return { data: null, error: formErrors.unauthorized };
    }
  }

  const result = await setAgentShift(
    parsed.data.agentId,
    parsed.data.shiftStart,
    parsed.data.shiftEnd,
    parsed.data.shiftDays ?? null,
  );
  if (result.error) return { data: null, error: formErrors.generic };

  revalidatePath("/settings");
  return { data: result.data, error: null };
}
