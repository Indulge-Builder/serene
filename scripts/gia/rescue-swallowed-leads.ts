/**
 * rescue-swallowed-leads.ts — make the leads an older build never made (2026-09-29).
 *
 * Until migration 0251 the lead identity was the phone alone. A person who already had an
 * active lead in one domain and then enquired in ANOTHER (a Legacy ad, a Shop product) got no
 * new lead: the enquiry was written on the old lead as a `duplicate_submission` row whose
 * details name the domain it was meant for. This script walks those rows and creates the lead
 * each one should have produced, through THE ingestion path the webhook uses (ingestLead), so
 * a rescued lead is the same as one that arrived today: round robin, slug, activities.
 *
 *   npx tsx --env-file=.env.local scripts/gia/rescue-swallowed-leads.ts
 *   npx tsx --env-file=.env.local scripts/gia/rescue-swallowed-leads.ts --apply
 *   npx tsx --env-file=.env.local scripts/gia/rescue-swallowed-leads.ts --apply --notify
 *   npx tsx --env-file=.env.local scripts/gia/rescue-swallowed-leads.ts --days 30
 *
 * Dry run by default: prints every decision and writes nothing. `--apply` creates the leads.
 * `--days N` = how far back to look (default 60, the founder's two months).
 * `--notify` = also send the usual "new lead" messages and start the follow-up clocks, as the
 *   webhook does. Off by default: thirty old enquiries should not ring every phone at once.
 *
 * REQUIRES migration 0251 (the duplicate check inside one domain). Without it ingestLead
 * folds every row straight back into the old lead; the script checks and refuses to apply.
 *
 * Idempotent: a person who already has ANY lead in the wanted domain is skipped, so a second
 * run only does what the first could not.
 *
 * What it does NOT do:
 *   - leads added by hand (no raw payload to replay): listed, to be added again by the agent.
 *   - it never touches the old lead. Its timeline keeps the duplicate_submission row.
 * Shop enquiries: the product rows stay on the old lead (the ledger is append-only) and a COPY
 * is filed on the new Shop lead under `<external id>:rescued`, so the agent sees the product.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { giaDb } from "@/lib/supabase/schemas";
import { ingestLead } from "@/lib/services/lead-ingestion";
import { notifyLeadAssigned } from "@/lib/services/lead-assignment-notify";
import { isGiaDomain, getDomainLabel } from "@/lib/constants/domains";
import { LEAD_SOURCES, type LeadSource } from "@/lib/constants/lead-sources";
import type { AppDomain } from "@/lib/types/database";

const APPLY = process.argv.includes("--apply");
const NOTIFY = process.argv.includes("--notify");
const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 60;

type Submission = {
  id: string;
  created_at: string;
  lead_id: string;
  details: { domain?: string; source?: string; raw_payload_id?: string | null } | null;
  lead: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    domain: AppDomain;
  } | null;
};

type Candidate = {
  key: string;
  wanted: AppDomain;
  name: string;
  phone: string;
  phoneKey: string;
  oldLeadId: string;
  oldDomain: AppDomain;
  via: string;
  submittedAt: string;
  rawPayloadId: string | null;
  submissions: number;
};

/** The JS twin of lead_phone_key(): digits only. */
function phoneKeyOf(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

function last4(phone: string): string {
  return `…${phone.replace(/[^0-9]/g, "").slice(-4)}`;
}

async function main() {
  if (!Number.isFinite(DAYS) || DAYS <= 0) throw new Error("--days must be a positive number");
  const admin = createAdminClient();
  const gia = giaDb(admin);
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`\nRescue of swallowed leads: ${APPLY ? "APPLY" : "dry run"}, last ${DAYS} days${NOTIFY ? ", with notifications" : ""}\n`);

  // 0251 must be live: the duplicate check has to accept a domain.
  const probe = await admin.rpc("get_active_lead_by_phone", { p_phone: "0", p_domain: "legacy" });
  const migrated = !probe.error;
  if (!migrated) {
    console.log(`Migration 0251 is NOT applied (${probe.error?.message}).`);
    if (APPLY) throw new Error("Refusing to apply before migration 0251: every lead would fold back into the old one.");
    console.log("Dry run continues; the list below is what --apply will do once it is.\n");
  }

  const { data, error } = await gia
    .from("lead_activities")
    .select("id, created_at, lead_id, details, lead:leads!lead_activities_lead_id_fkey(id, first_name, last_name, phone, domain)")
    .eq("action_type", "duplicate_submission")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`Could not read the duplicate submissions: ${error.message}`);

  // One candidate per person per wanted domain; the newest submission speaks for it.
  const byKey = new Map<string, Candidate>();
  for (const row of (data ?? []) as unknown as Submission[]) {
    const wanted = row.details?.domain;
    if (!wanted || !isGiaDomain(wanted) || !row.lead?.phone) continue;
    if (wanted === row.lead.domain) continue;
    const phoneKey = phoneKeyOf(row.lead.phone);
    if (!phoneKey) continue;
    const key = `${phoneKey}|${wanted}`;
    const seen = byKey.get(key);
    byKey.set(key, {
      key,
      wanted,
      name: [row.lead.first_name, row.lead.last_name].filter(Boolean).join(" ") || "Unnamed",
      phone: row.lead.phone,
      phoneKey,
      oldLeadId: row.lead.id,
      oldDomain: row.lead.domain,
      via: row.details?.source ?? "?",
      submittedAt: row.created_at,
      rawPayloadId: row.details?.raw_payload_id ?? null,
      submissions: (seen?.submissions ?? 0) + 1,
    });
  }

  const tally = { created: 0, skipped: 0, byHand: 0, failed: 0 };

  for (const c of byKey.values()) {
    const line = `${c.name} (${last4(c.phone)})  ${getDomainLabel(c.oldDomain)} → ${getDomainLabel(c.wanted)}  via ${c.via}, ${c.submittedAt.slice(0, 10)}${c.submissions > 1 ? `, ${c.submissions} enquiries` : ""}`;

    // Already has a lead there (any status): nothing to rescue.
    // phone_key exists once 0251 is applied; before it (a dry run) the phone itself is the match.
    const { data: there } = await gia
      .from("leads")
      .select("id, status")
      .eq(migrated ? "phone_key" : "phone", migrated ? c.phoneKey : c.phone)
      .eq("domain", c.wanted)
      .is("archived_at", null)
      .limit(1);
    if (there && there.length > 0) {
      console.log(`SKIP     ${line}  (already has a lead in ${getDomainLabel(c.wanted)}, ${there[0].status})`);
      tally.skipped += 1;
      continue;
    }

    if (!c.rawPayloadId) {
      console.log(`BY HAND  ${line}  (added by hand, nothing to replay: add it again from Add Lead)`);
      tally.byHand += 1;
      continue;
    }

    const { data: raw } = await gia
      .from("lead_raw_payloads")
      .select("id, source, payload")
      .eq("id", c.rawPayloadId)
      .maybeSingle();
    if (!raw || !raw.payload || !(LEAD_SOURCES as readonly string[]).includes(raw.source ?? "")) {
      console.log(`FAILED   ${line}  (the stored submission is missing or its source is unknown)`);
      tally.failed += 1;
      continue;
    }

    if (!APPLY) {
      console.log(`CREATE   ${line}`);
      tally.created += 1;
      continue;
    }

    const result = await ingestLead(raw.payload, raw.source as LeadSource, raw.id);
    if (!result.success) {
      console.log(`FAILED   ${line}  (${result.error})`);
      tally.failed += 1;
      continue;
    }
    if (result.is_duplicate || result.domain !== c.wanted) {
      // The payload no longer resolves to the wanted domain (a campaign map change), or
      // someone made the lead while this ran. Nothing was created.
      console.log(`SKIP     ${line}  (resolved to ${result.domain}${result.is_duplicate ? ", already active there" : ""})`);
      tally.skipped += 1;
      continue;
    }

    await gia.from("lead_activities").insert({
      lead_id: result.leadId,
      actor_id: null,
      action_type: "note_added",
      details: {
        type: "lead_rescued",
        domain: c.oldDomain,
        from_lead_id: c.oldLeadId,
        originally_submitted_at: c.submittedAt,
      },
    });

    // The products this person asked about were filed on the old lead. Copy them across.
    if (c.wanted === "shop") {
      const { data: enquiries } = await gia
        .from("lead_product_enquiries")
        .select("*")
        .eq("lead_id", c.oldLeadId)
        .eq("source", "shop_app");
      for (const enquiry of enquiries ?? []) {
        const { id, created_at, ...copy } = enquiry;
        void id;
        void created_at;
        const { error: copyError } = await gia.from("lead_product_enquiries").insert({
          ...copy,
          lead_id: result.leadId,
          external_lead_id: `${enquiry.external_lead_id}:rescued`,
        });
        if (copyError && copyError.code !== "23505") {
          console.log(`         could not copy a product enquiry: ${copyError.message}`);
        }
      }
    }

    if (NOTIFY) {
      await notifyLeadAssigned({
        leadId: result.leadId,
        assignedTo: result.assigned_to,
        agentName: result.agent_name,
        leadName: result.lead_name,
        leadPhone: result.lead_phone,
        domain: result.domain,
        isNew: true,
        isDuplicate: false,
        actorId: null,
        scheduleSla: true,
      }).catch((err) => console.log(`         notification failed: ${String(err)}`));
    }

    console.log(`CREATED  ${line}  → ${result.agent_name ?? "unassigned"}`);
    tally.created += 1;
  }

  console.log(
    `\n${APPLY ? "Created" : "Would create"} ${tally.created}, skipped ${tally.skipped}, to add by hand ${tally.byHand}, failed ${tally.failed}.`,
  );
  if (!APPLY) console.log("Nothing was written. Run again with --apply to create them.\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
