"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formErrors } from "@/lib/validations/form-errors";
import { getCurrentProfile } from "@/lib/services/profiles-service";
import { setRoutingActive } from "@/lib/services/agent-routing-service";
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
  const caller = await getCurrentProfile();
  if (!caller || !["manager", "admin", "founder"].includes(caller.role)) {
    return { data: null, error: formErrors.unauthorized };
  }

  const result = await setRoutingActive(parsed.data.agent_id, parsed.data.is_active);
  if (result.error) return { data: null, error: formErrors.generic };

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.agent_id}`);
  return { data: result.data, error: null };
}
