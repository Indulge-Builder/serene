/**
 * onboard-roster.ts — create Serene accounts for the whole company from the staff roster
 * (2026-09-26). Reads a TSV (Name / Department / Mobile Number, the founder's sheet), decides each
 * row's account shape, and writes through THE core the admin Create form uses
 * (services/staff-account-mutations.ts createStaffAccountCore), so a roster account is
 * byte-identical to one made by hand on /admin/users/new.
 *
 *   npx tsx --env-file=.env.local scripts/admin/onboard-roster.ts cleint-data/staff-roster-2026-09-26.tsv
 *   npx tsx --env-file=.env.local scripts/admin/onboard-roster.ts cleint-data/staff-roster-2026-09-26.tsv --apply
 *
 * Dry run by default: prints every decision and writes nothing. `--apply` creates the accounts.
 * Idempotent: a person already on Serene (matched by phone, then by the derived email) is never
 * re-created or re-roled; only a blank phone is filled. Re-running after a fix only does the rest.
 *
 * The shape rules (the founder's, 2026-09-26):
 *   - "<Name>'s Queendom" → domain concierge, queendom by that name. The person whose first name IS
 *     the queendom's name takes the queen seat (role manager); everyone else is a genie (role agent).
 *     Existing bishops keep their seats because existing accounts are never touched.
 *   - Finance / Onboarding / Retail / Tech / Marketing / Indulge House → that domain, role agent.
 *   - HR and Partnerships → domain business (no closer domain exists), role agent. Flagged.
 *   - Joker → domain concierge, role agent, NO seat: a joker seat needs a queendom and the sheet
 *     does not say which. Flagged for the founder to place on /admin/users/[id].
 *   - Founder's Office rows are all existing accounts (never re-roled here).
 *   - Device rows (a SIM, the Elaya phone) and second numbers of an existing person are skipped.
 *   - Email = first name (letters only, lowercase) @indulge.global; a clash with an existing account
 *     or an earlier row falls back to firstname+lastname. Password for everyone: the temp one below;
 *     each person changes it on /profile.
 *   - Job title = the department for non-queendom rows (a seat is the position for queendom rows).
 */
import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalizePhone } from "@/lib/utils/phone";
import { nameMatchesFuzzy } from "@/lib/utils/fuzzy";
import { sanitizeText } from "@/lib/utils/sanitize";
import { createStaffAccountCore, fillStaffContactCore, type StaffAccountInput } from "@/lib/services/staff-account-mutations";
import { SIA_ROLE_PLATFORM_ROLE, type SiaRole } from "@/lib/constants/sia-roles";
import type { AppDomain, UserRole } from "@/lib/types/database";

const TEMP_PASSWORD = "indulge@serene";
const EMAIL_DOMAIN = "indulge.global";

const DEPARTMENT_DOMAIN: Record<string, { domain: AppDomain; flag?: string }> = {
  finance:          { domain: "finance" },
  onboarding:       { domain: "onboarding" },
  retail:           { domain: "shop" },
  tech:             { domain: "tech" },
  marketing:        { domain: "marketing" },
  "indulge house":  { domain: "house" },
  hr:               { domain: "business", flag: "HR has no domain of its own; placed in business" },
  partnerships:     { domain: "business", flag: "Partnerships has no domain of its own; placed in business" },
  joker:            { domain: "concierge", flag: "Joker: a joker seat needs a queendom; created without a seat, place them on /admin/users" },
  "founder's office": { domain: "concierge" },
};

/** Rows that are not a person to onboard, or a second number of a person already listed. */
const SKIP_PATTERNS = [/\bSIM\b/i, /Elaya AI/i, /Karan Whatsapp/i, /^Chetto \(Ethan\)$/i, /^Harsh New$/i];

type Row = { Name: string; Department: string; "Mobile Number": string };
type Plan =
  | { kind: "skip"; name: string; why: string }
  | { kind: "exists"; name: string; email: string; fillPhone: string | null; id: string }
  | { kind: "create"; name: string; input: StaffAccountInput; flags: string[] };

/** A company SIM passes from person to person: a phone match is the same PERSON only when the name agrees. */
function samePerson(profile: { full_name: string }, name: string): boolean {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return nameMatchesFuzzy(profile.full_name, first);
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "").toLowerCase() ?? "";
}
function lastToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : "").replace(/[^A-Za-z]/g, "").toLowerCase();
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) { console.error("usage: onboard-roster.ts <roster.tsv> [--apply]"); process.exit(1); }
  const apply = flags.includes("--apply");

  const rows = parse(readFileSync(file, "utf8"), { delimiter: "\t", columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Row[];

  const admin = createAdminClient();
  const [{ data: profiles, error: pErr }, { data: queendoms, error: qErr }] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, phone, role, domain, sia_role, queendom_id"),
    admin.schema("sia").from("queendoms").select("id, slug, name"),
  ]);
  if (pErr || qErr || !profiles || !queendoms) throw new Error(`read failed: ${pErr?.message ?? qErr?.message}`);

  const byPhone = new Map<string, (typeof profiles)[number]>();
  const byEmail = new Map<string, (typeof profiles)[number]>();
  for (const p of profiles) {
    const k = canonicalizePhone(p.phone);
    if (k) byPhone.set(k, p);
    byEmail.set(p.email.toLowerCase(), p);
  }
  const takenEmails = new Set(byEmail.keys());
  const queendomByKey = new Map(queendoms.map((q) => [q.slug, q]));
  // The sheet spells one queendom "Ananayshree"; the first four letters tell the three apart.
  const queendomFor = (department: string) => {
    const m = /^(.+?)['’]s Queendom$/i.exec(department);
    if (!m) return null;
    const key = m[1].toLowerCase().replace(/[^a-z]/g, "");
    return [...queendomByKey.values()].find((q) => q.slug.slice(0, 4) === key.slice(0, 4)) ?? null;
  };

  const plans: Plan[] = [];
  for (const r of rows) {
    let name = r.Name.replace(/\s+/g, " ").trim();
    const dept = r.Department.trim();
    const rawPhone = (r["Mobile Number"] ?? "").trim();
    if (!name) continue;
    if (SKIP_PATTERNS.some((re) => re.test(name))) { plans.push({ kind: "skip", name, why: "not a person to onboard here (device, second number, or no usable name)" }); continue; }
    // "Aditya Sonde / Yashvardhan Garg": Aditya already holds the Sanika bishop seat; this row is Yashvardhan.
    if (name.includes("/")) name = name.split("/").map((s) => s.trim()).find((s) => !byEmail.has(`${firstToken(s)}@${EMAIL_DOMAIN}`)) ?? name.split("/")[0].trim();
    name = name.replace(/\s+At Indulge$/i, "");

    const phone = rawPhone ? canonicalizePhone(rawPhone) : "";
    if (rawPhone && !phone) { plans.push({ kind: "skip", name, why: `phone did not parse: ${rawPhone}` }); continue; }

    let email = `${firstToken(name)}@${EMAIL_DOMAIN}`;
    const phoneHolder = phone ? byPhone.get(phone) : undefined;
    const existing = (phoneHolder && samePerson(phoneHolder, name) ? phoneHolder : undefined) ?? byEmail.get(email);
    if (existing) {
      plans.push({ kind: "exists", name, email: existing.email, id: existing.id, fillPhone: !existing.phone && phone ? phone : null });
      continue;
    }
    const rowFlags: string[] = [];
    let phoneForRow: string | null = phone || null;
    if (phoneHolder) {
      // The number is on another account (a reassigned company SIM). Create the person without it;
      // the founder decides whether the old account goes and the number moves.
      rowFlags.push(`phone …${phone.slice(-4)} is on ${phoneHolder.full_name} (${phoneHolder.email}); created WITHOUT a phone`);
      phoneForRow = null;
    }
    if (takenEmails.has(email)) {
      const alt = `${firstToken(name)}${lastToken(name)}@${EMAIL_DOMAIN}`;
      if (!lastToken(name) || takenEmails.has(alt)) { plans.push({ kind: "skip", name, why: `email ${email} is taken and no unique fallback` }); continue; }
      email = alt;
    }
    takenEmails.add(email);

    let domain: AppDomain; let role: UserRole = "agent"; let sia_role: SiaRole | null = null; let queendom_id: string | null = null; let job_title: string | null = null;
    const q = queendomFor(dept);
    if (q) {
      domain = "concierge"; queendom_id = q.id;
      const isQueen = q.slug.slice(0, 4) === firstToken(name).slice(0, 4);
      sia_role = isQueen ? "queen" : "genie";
      role = SIA_ROLE_PLATFORM_ROLE[sia_role];
    } else {
      const d = DEPARTMENT_DOMAIN[dept.toLowerCase()];
      if (!d) { plans.push({ kind: "skip", name, why: `unknown department "${dept}"` }); continue; }
      domain = d.domain; job_title = dept; if (d.flag) rowFlags.push(d.flag);
    }
    plans.push({ kind: "create", name, flags: rowFlags, input: { email, password: TEMP_PASSWORD, full_name: sanitizeText(name), role, domain, job_title: job_title ? sanitizeText(job_title) : null, phone: phoneForRow, sia_role, queendom_id } });
  }

  // Print the plan
  const lines: string[] = [];
  const out = (s: string) => { lines.push(s); console.log(s); };
  out(`${apply ? "APPLY" : "DRY RUN"} — ${rows.length} rows`);
  for (const p of plans) {
    if (p.kind === "skip") out(`  SKIP    ${p.name}: ${p.why}`);
    else if (p.kind === "exists") out(`  EXISTS  ${p.name} (${p.email})${p.fillPhone ? `  → fill phone …${p.fillPhone.slice(-4)}` : ""}`);
    else out(`  CREATE  ${p.name} → ${p.input.email} | ${p.input.domain}/${p.input.role}${p.input.sia_role ? `/${p.input.sia_role}` : ""}${p.input.queendom_id ? ` @${queendoms.find((q) => q.id === p.input.queendom_id)?.slug}` : ""} | phone …${(p.input.phone ?? "").slice(-4)}${p.flags.length ? `  ⚑ ${p.flags.join("; ")}` : ""}`);
  }
  const creates = plans.filter((p): p is Extract<Plan, { kind: "create" }> => p.kind === "create");
  const fills = plans.filter((p): p is Extract<Plan, { kind: "exists" }> => p.kind === "exists" && Boolean(p.fillPhone));
  out(`summary: ${creates.length} to create, ${fills.length} phones to fill, ${plans.filter((p) => p.kind === "exists").length} already on Serene, ${plans.filter((p) => p.kind === "skip").length} skipped`);

  if (apply) {
    out("");
    for (const p of creates) {
      const r = await createStaffAccountCore(p.input);
      out(r.ok ? `  ✓ created ${p.input.email} (${r.id})` : `  ✗ ${p.input.email}: ${r.error} — ${r.detail}`);
    }
    for (const p of fills) {
      const r = await fillStaffContactCore(p.id, { phone: p.fillPhone });
      out(r.ok ? `  ✓ phone filled for ${p.email}` : `  ✗ phone for ${p.email}: ${r.detail}`);
    }
  }
  const report = file.replace(/\.tsv$/, "") + `.report-${apply ? "apply" : "dry"}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  writeFileSync(report, lines.join("\n") + "\n");
  out(`report: ${report}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
