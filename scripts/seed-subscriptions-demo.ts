/**
 * Demo subscriptions for LOCAL testing — the tracker had zero rows, so none of
 * its screens could be exercised.
 *
 * Deliberately shaped to test the three things fixed on 2026-09-08:
 *
 *   1. The Add form keeping the previous entry's values — open Add twice.
 *   2. Search ignoring the TOOL name — several rows are named for the ACCOUNT
 *      ("Tech Team Seats") and only findable by their tool ("Claude", "Airtel
 *      WiFi"). Searching the tool used to return nothing.
 *   3. The password-reveal audit having no reader — rows carry passwords, so a
 *      reveal writes a ledger row and "Password viewed by" appears.
 *
 * One tool with SEVERAL subscriptions is the vision's own example: Claude, 3
 * accounts, 2 tech + 1 concierge.
 *
 * SAFETY — local database only, no override. Re-runnable: `--force` deletes only
 * the rows this script created (notes tagged `demo-subs-v1`).
 *
 *   npx tsx --env-file=.env.local scripts/seed-subscriptions-demo.ts [--force]
 */

import { createClient } from "@supabase/supabase-js";

const FORCE = process.argv.includes("--force");
const TAG = "demo-subs-v1";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const host = (() => { try { return new URL(SUPABASE_URL).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
  console.error(`REFUSING TO RUN — "${host}" is not a local database. Demo data never goes near production.`);
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** tool name → the subscriptions that belong to it. */
const DATA: {
  tool: string;
  subs: {
    name: string;
    departments: string[];
    type: "monthly" | "yearly" | "top_up" | "other";
    currency: "INR" | "USD" | "EUR";
    amount: number | null;
    dueDay?: number;
    dueDate?: string;
    login?: string;
    password?: string;
  }[];
}[] = [
  {
    // The vision's own case: one tool, three accounts across two departments.
    tool: "Claude",
    subs: [
      { name: "Tech Team Seats", departments: ["tech"], type: "monthly", currency: "USD", amount: 120, dueDay: 5, login: "tech@indulge.global", password: "Cl4ude-Tech-2026!" },
      { name: "Engineering Max", departments: ["tech"], type: "monthly", currency: "USD", amount: 200, dueDay: 5, login: "eng@indulge.global", password: "Max-Seat-9931" },
      { name: "Concierge Desk", departments: ["concierge"], type: "monthly", currency: "USD", amount: 60, dueDay: 12, login: "desk@indulge.global" },
    ],
  },
  {
    // Named for the ACCOUNT, findable only by the tool — the search bug.
    tool: "Airtel WiFi",
    subs: [
      { name: "Office Broadband", departments: ["tech", "finance"], type: "monthly", currency: "INR", amount: 4499, dueDay: 18, login: "9876543210", password: "Airtel@Office#77" },
      { name: "Warehouse Line", departments: ["shop"], type: "monthly", currency: "INR", amount: 1899, dueDay: 22 },
    ],
  },
  {
    tool: "Adobe Creative Cloud",
    subs: [
      { name: "Design Suite", departments: ["marketing"], type: "yearly", currency: "INR", amount: 71400, dueDate: "2027-02-14", login: "design@indulge.global", password: "Adobe-CC-2027" },
    ],
  },
  {
    tool: "Zoom",
    subs: [
      { name: "Business Plan", departments: ["concierge", "business"], type: "yearly", currency: "USD", amount: 2199, dueDate: "2026-11-30" },
    ],
  },
  {
    tool: "AWS",
    subs: [
      { name: "Production Account", departments: ["tech"], type: "top_up", currency: "USD", amount: null, login: "aws-root@indulge.global", password: "aws-Root-Sec!2026" },
    ],
  },
  {
    tool: "Gupshup",
    subs: [
      { name: "WhatsApp Credits", departments: ["concierge", "marketing"], type: "top_up", currency: "INR", amount: null },
    ],
  },
];

async function main() {
  console.log(`Local database: ${SUPABASE_URL}\n`);

  const { data: profiles } = await db.from("profiles").select("id").limit(1);
  const author = ((profiles as { id: string }[] | null) ?? [])[0]?.id ?? null;

  if (FORCE) {
    const { data: mine } = await db.from("subscriptions").select("id").eq("notes", TAG);
    const ids = ((mine as { id: string }[] | null) ?? []).map((r) => r.id);
    if (ids.length) {
      // Children first — payments/topups/reveals all FK the subscription.
      await db.from("subscription_payments").delete().in("subscription_id", ids);
      await db.from("subscription_topups").delete().in("subscription_id", ids);
      await db.from("subscription_password_reveals").delete().in("subscription_id", ids);
      await db.from("subscriptions").delete().in("id", ids);
      console.log(`--force: removed ${ids.length} demo subscription(s)\n`);
    }
  }

  let tools = 0, subs = 0;
  for (const group of DATA) {
    // The tool is created implicitly the same way the form does it: upsert on
    // the generated name_key (0168), ignoring an existing row.
    const { data: existing } = await db
      .from("subscription_tools").select("id").ilike("name", group.tool).maybeSingle();
    let toolId = (existing as { id: string } | null)?.id ?? null;
    if (!toolId) {
      const { data: made, error } = await db
        .from("subscription_tools").insert({ name: group.tool }).select("id").single();
      if (error) { console.error(`  FAILED tool "${group.tool}": ${error.message}`); continue; }
      toolId = (made as { id: string }).id;
      tools++;
    }

    for (const s of group.subs) {
      // The password column is encrypted by a BEFORE INSERT trigger (0166), so
      // the plaintext written here never lands in plaintext.
      const { error } = await db.from("subscriptions").insert({
        name: s.name,
        tool_id: toolId,
        departments: s.departments,
        type: s.type,
        currency: s.currency,
        amount: s.amount,
        due_day: s.dueDay ?? null,
        due_date: s.dueDate ?? null,
        login: s.login ?? null,
        password: s.password ?? null,
        notes: TAG,
        created_by: author,
      });
      if (error) { console.error(`  FAILED "${s.name}": ${error.message}`); continue; }
      subs++;
      console.log(`   ${group.tool.padEnd(22)} ${s.name}`);
    }
  }

  console.log(`\nSeeded ${subs} subscription(s) across ${DATA.length} tool(s) (${tools} newly created).`);
  console.log(`\nTry: search "wifi" (finds Office Broadband + Warehouse Line via the TOOL),`);
  console.log(`     search "claude" (finds all three accounts),`);
  console.log(`     open a row with a password and reveal it — then reopen to see "Password viewed by".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
