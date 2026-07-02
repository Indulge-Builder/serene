// domain_targets queries — founder-set monthly targets per domain
// (performance domain cards). Reads use the session client (RLS: all
// authenticated read); the upsert uses the admin client behind the
// founder/admin-gated action (A-09 two layers — the RLS write policy is the
// second).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import type { DomainTarget } from "@/lib/types/index";
import type { AppDomain } from "@/lib/types/database";

type DomainTargetRow = {
  domain:       AppDomain;
  metric:       string;
  target_value: number | string | null;
  period:       string;
};

/** All monthly targets (today: metric 'deals_closed' only). */
export async function getDomainTargets(): Promise<DomainTarget[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("domain_targets")
    .select("domain, metric, target_value, period")
    .eq("metric", "deals_closed")
    .eq("period", "month");

  if (error || !data) {
    if (error) {
      console.warn("[domain-targets-service] read failed:", error);
    }
    return [];
  }

  return mapRows<DomainTargetRow, DomainTarget>(data, (row) => ({
    domain:       row.domain,
    metric:       "deals_closed",
    target_value: Number(row.target_value ?? 0),
    period:       "month",
  }));
}

/** Upsert one (domain, metric, period) target. Caller is the auth boundary. */
export async function upsertDomainTarget(
  domain: AppDomain,
  targetValue: number,
  setBy: string,
): Promise<{ ok: boolean }> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("domain_targets")
    .upsert(
      {
        domain,
        metric:       "deals_closed",
        period:       "month",
        target_value: targetValue,
        set_by:       setBy,
      },
      { onConflict: "domain,metric,period" },
    );

  if (error) {
    console.error("[domain-targets-service] upsert failed:", error);
    return { ok: false };
  }
  return { ok: true };
}
