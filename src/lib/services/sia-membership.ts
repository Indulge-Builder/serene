// sia-membership.ts — THE daily standby-coverage check (migration 0249,
// docs/architecture/sia-resilience-plan.md section 7).
//
// The standby number is only a fallback if it is IN the groups. Every day this asks,
// for every linked member group: is the standby in it, and is the watcher's own number
// in it. What is missing is named in ONE in-app notification: the tech responders get
// the whole list, each queen gets her own queendom's groups. No WhatsApp send; this is
// housekeeping, not an emergency.
//
// No `server-only` chain of its own; sia-service carries one and is imported
// dynamically, the way the watcher alarm does it.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { SIA_ALERT_TIER1_PROFILE_IDS } from "@/lib/constants/sia-alerts";
import { SIA_COVERAGE_NAMED_GROUPS } from "@/lib/constants/sia-watcher";
import { SIA_PATH } from "@/lib/constants/sia-roles";

export type MembershipCheckResult = {
  skipped: "disabled" | "no_standby" | null;
  memberGroups: number;
  missingStandby: number;
  missingWatcher: number;
  notified: number;
};

type Missing = { group_jid: string; subject: string | null; member_id: string };

function nameList(groups: Missing[]): string {
  const named = groups.slice(0, SIA_COVERAGE_NAMED_GROUPS).map((g) => g.subject?.trim() || "an unnamed group");
  const rest = groups.length - named.length;
  return rest > 0 ? `${named.join(", ")} and ${rest} more` : named.join(", ");
}

export async function runMembershipCheck(opts: { apply?: boolean } = {}): Promise<MembershipCheckResult> {
  const apply = opts.apply ?? true;
  const { getSiaWatcherSettings } = await import("@/lib/services/llm-providers-service");
  const settings = await getSiaWatcherSettings();
  const empty = { memberGroups: 0, missingStandby: 0, missingWatcher: 0, notified: 0 };
  if (!settings.membershipCheckEnabled) return { skipped: "disabled", ...empty };
  if (!settings.standbyJid) return { skipped: "no_standby", ...empty };

  const { getStandbyCoverage } = await import("@/lib/services/sia-service");
  const cov = await getStandbyCoverage(settings.standbyJid);
  const result: MembershipCheckResult = {
    skipped: null,
    memberGroups: cov.memberGroups,
    missingStandby: cov.missingStandby.length,
    missingWatcher: cov.missingWatcher.length,
    notified: 0,
  };
  if (!apply || (cov.missingStandby.length === 0 && cov.missingWatcher.length === 0)) return result;

  const { createNotification } = await import("@/lib/services/notifications-service");
  const { getQueendomSeats } = await import("@/lib/services/queendom-seats");

  // The whole picture, to the tech responders.
  const lines: string[] = [];
  if (cov.missingStandby.length) lines.push(`The standby number is missing from ${cov.missingStandby.length} of ${cov.memberGroups} member groups: ${nameList(cov.missingStandby)}.`);
  if (cov.missingWatcher.length) lines.push(`The watcher number is missing from ${cov.missingWatcher.length}: ${nameList(cov.missingWatcher)}.`);
  const sends: Promise<unknown>[] = SIA_ALERT_TIER1_PROFILE_IDS.map((id) =>
    createNotification({ recipient_id: id, type: "system", title: "Sia standby coverage", body: lines.join(" "), action_url: SIA_PATH }),
  );

  // Each queen: only her own queendom's groups, and only the standby gap (adding a
  // number to a group is something she can do; a missing watcher is the tech team's).
  if (cov.missingStandby.length) {
    const memberIds = [...new Set(cov.missingStandby.map((g) => g.member_id))];
    const queendomOf = new Map<string, string>();
    for (let i = 0; i < memberIds.length; i += 150) {
      const { data } = await memberDb(createAdminClient())
        .from("members")
        .select("id, queendom_id")
        .in("id", memberIds.slice(i, i + 150));
      for (const m of (data ?? []) as { id: string; queendom_id: string | null }[]) {
        if (m.queendom_id) queendomOf.set(m.id, m.queendom_id);
      }
    }
    const byQueendom = new Map<string, Missing[]>();
    for (const g of cov.missingStandby) {
      const q = queendomOf.get(g.member_id);
      if (!q) continue;
      byQueendom.set(q, [...(byQueendom.get(q) ?? []), g]);
    }
    for (const [queendomId, groups] of byQueendom) {
      const { queen } = await getQueendomSeats(queendomId);
      if (!queen || SIA_ALERT_TIER1_PROFILE_IDS.includes(queen)) continue;
      sends.push(
        createNotification({
          recipient_id: queen,
          type: "system",
          title: "Add the standby number to these groups",
          body: `The standby WhatsApp number is not in ${groups.length} of your member groups: ${nameList(groups)}. Please add it, a few groups a day.`,
          action_url: SIA_PATH,
        }),
      );
    }
  }

  const settled = await Promise.allSettled(sends);
  result.notified = settled.filter((s) => s.status === "fulfilled").length;
  return result;
}
