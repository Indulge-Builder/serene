/**
 * scripts/freshdesk/register-webhooks.ts — create the two Freshdesk automation rules that
 * POST to Serene's /api/webhooks/freshdesk (the near-real-time path of the mirror).
 *
 * Rule 1 (automation type 1, "ticket creation"): every new ticket → event ticket_created.
 * Rule 2 (automation type 4, "ticket updates"): status / priority / group / agent / type
 * changes by an agent or the requester → event ticket_updated.
 *
 * The shape copies the account's existing webhook rules (the member app's), read from
 * GET /automations/{type}/rules on 2026-09-15. Dry run prints the JSON; --apply creates.
 * If Freshdesk rejects an events entry, remove it and re-run: the minute poll is the truth
 * path anyway, the webhook only shortens latency.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/freshdesk/register-webhooks.ts [--apply] [--site https://…]
 */
import { createFdBudget, createAutomationRule, listAutomationRules, isFreshdeskConfigured } from "../../src/lib/services/freshdesk-api";

const APPLY = process.argv.includes("--apply");
const siteArgIdx = process.argv.indexOf("--site");
const SITE = (siteArgIdx !== -1 ? process.argv[siteArgIdx + 1] : process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.FRESHDESK_WEBHOOK_SECRET ?? "";

const RULE_PREFIX = "Serene mirror";

function webhookAction(event: string) {
  return {
    field_name: "trigger_webhook",
    request_type: "POST",
    url: `${SITE}/api/webhooks/freshdesk`,
    content_type: "JSON",
    content_layout: "2",
    custom_headers: { "x-freshdesk-webhook-secret": SECRET },
    content: {
      event,
      ticket_id: "{{ticket.id}}",
      status: "{{ticket.status}}",
      group_name: "{{ticket.group.name}}",
      agent_name: "{{ticket.agent.name}}",
      updated_at: "{{ticket.updated_at}}",
    },
  };
}

// Priority is required for agents in this account, so "priority in 1..4" matches every ticket.
const anyTicket = [
  {
    name: "condition_set_1",
    match_type: "any",
    properties: [{ field_name: "priority", resource_type: "ticket", operator: "in", value: [1, 2, 3, 4] }],
  },
];

const creationRule = {
  name: `${RULE_PREFIX} — ticket created`,
  active: true,
  conditions: anyTicket,
  actions: [webhookAction("ticket_created")],
};

const updateRule = {
  name: `${RULE_PREFIX} — ticket updated`,
  active: true,
  performer: { type: 3 }, // agent or requester
  events: [
    { field_name: "status", from: "--", to: "--" },
    { field_name: "priority", from: "--", to: "--" },
    { field_name: "group_id", from: "--", to: "--" },
    { field_name: "responder_id", from: "--", to: "--" },
    { field_name: "ticket_type", from: "--", to: "--" },
  ],
  conditions: anyTicket,
  actions: [webhookAction("ticket_updated")],
};

async function main() {
  if (!isFreshdeskConfigured()) throw new Error("FRESHDESK_DOMAIN / FRESHDESK_API_KEY missing");
  if (!SITE.startsWith("https://")) throw new Error(`--site (or NEXT_PUBLIC_SITE_URL) must be the public https URL, got "${SITE}"`);
  if (!SECRET) throw new Error("FRESHDESK_WEBHOOK_SECRET missing");

  const budget = createFdBudget(10);
  const [existing1, existing4] = await Promise.all([listAutomationRules(1, budget), listAutomationRules(4, budget)]);
  const have1 = existing1.find((r) => r.name === creationRule.name);
  const have4 = existing4.find((r) => r.name === updateRule.name);

  console.log(`Target: ${SITE}/api/webhooks/freshdesk`);
  console.log(`Creation rule: ${have1 ? `already exists (id ${have1.id})` : "will create"}`);
  console.log(`Update rule:   ${have4 ? `already exists (id ${have4.id})` : "will create"}`);
  if (!APPLY) {
    console.log("\nDRY RUN. Payloads:\n");
    console.log(JSON.stringify(creationRule, null, 2));
    console.log(JSON.stringify(updateRule, null, 2));
    console.log("\nRe-run with --apply to create them.");
    return;
  }
  if (!have1) {
    const r = await createAutomationRule(1, creationRule, budget);
    console.log("Created creation rule:", r.id);
  }
  if (!have4) {
    const r = await createAutomationRule(4, updateRule, budget);
    console.log("Created update rule:", r.id);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
