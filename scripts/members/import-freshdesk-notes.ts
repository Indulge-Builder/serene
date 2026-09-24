/**
 * import-freshdesk-notes.ts — the Freshdesk CONTACT notes (the Notes tab on a contact, exported
 * by hand on 2026-09-24 to cleint-data/fd-client-notes-2026-09-24.csv) into the member twin.
 *
 * Three lanes, decided per note:
 *   vault    a card, Aadhaar, passport, PAN or licence (by title or by the number's shape) →
 *            member.member_vault, encrypted (0236). Never a fact, never the reader.
 *   address  a note titled "…address" → one address fact, keyed by the title.
 *   reader   everything else → THE Observation reader (the same one the member page's box
 *            uses): facts + relations, and the note itself kept in the Notes list.
 *
 * Idempotent: a note already imported (its id in a fact's evidence, or the vault's source_ref)
 * is skipped, so the script can be run again. Dry run by default; `--apply` writes.
 *
 *   npx tsx --tsconfig <shim> --env-file=.env.local scripts/members/import-freshdesk-notes.ts [--apply] [--limit N] [--lane reader|address|vault]
 *
 * The report holds real names, so it is written OUTSIDE the repo (~/Desktop/serene-backups).
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { readMemberObservation } from "@/lib/services/member-observation-reader";
import { addFactCore } from "@/lib/services/member-mutations";
import { upsertMemberRelation } from "@/lib/services/member-relations";
import { addVaultItemCore } from "@/lib/services/member-vault";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { MemberVaultKind } from "@/lib/types/member";

const APPLY = process.argv.includes("--apply");
const num = (name: string, dflt: number) => { const i = process.argv.indexOf(name); const v = i === -1 ? NaN : Number(process.argv[i + 1]); return Number.isFinite(v) && v > 0 ? v : dflt; };
const LIMIT = num("--limit", Infinity);
const ONLY = (() => { const i = process.argv.indexOf("--lane"); return i === -1 ? null : process.argv[i + 1]; })();
/** `--reread`: only notes already imported whose reading FAILED (the note is on file, no facts came of it); run the reader again and add the facts. */
const REREAD = process.argv.includes("--reread");
const FILE = "cleint-data/fd-client-notes-2026-09-24.csv";
const IMPORT_ACTOR: MutationActor = { userId: "", role: "admin", domain: "concierge", fullName: "Freshdesk notes import" };

type Note = { id: string; body: string; title: string; created_by: string; user_id: string; created_at: string };
const strip = (s: string) => (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const mask = (s: string) => s.replace(/\b([A-Z][a-z]{2,})\b/g, (m) => m[0] + "··").replace(/\d(?=\d{2})/g, "•");

// A title that says what the note is. "Email ID" and "Mail ID" are contact details, not documents.
const SENSITIVE_TITLE = /\b(cards?|cvv|credit|debit|aadha?ar|passports?|pan|licen[cs]e|dl|id|ids|id's|identity)\b/i;
const CONTACT_TITLE = /\b(e?mail id|email)\b/i;
const CARD = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/, CVV = /\bcv[vc]\b/i, AADHAAR = /(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/, PASSPORT = /\b[A-Z]\d{7}\b/, PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;

function lane(n: Note, text: string): "vault" | "address" | "reader" | "empty" {
  if (text.replace(/\W/g, "").length < 3) return "empty";
  const t = n.title.trim();
  if ((SENSITIVE_TITLE.test(t) && !CONTACT_TITLE.test(t)) || CARD.test(text) || CVV.test(text) || AADHAAR.test(text) || PASSPORT.test(text) || PAN.test(text)) return "vault";
  if (/address/i.test(t)) return "address";
  return "reader";
}
function vaultKind(n: Note, text: string): MemberVaultKind {
  const t = `${n.title} ${text.slice(0, 80)}`;
  if (/aadha?ar/i.test(t) || (AADHAAR.test(text) && !CARD.test(text))) return "aadhaar";
  if (/passport/i.test(t) || PASSPORT.test(text)) return "passport";
  if (/\bpan\b/i.test(t) || PAN.test(text)) return "pan";
  if (/licen[cs]e|\bdl\b/i.test(t)) return "driving_licence";
  if (/card|cvv|credit|debit/i.test(t) || CARD.test(text) || CVV.test(text)) return "card";
  return "other_id";
}
function cardExpiry(text: string): string | null {
  const m = text.match(/\b(0[1-9]|1[0-2])\s*\/\s*(\d{2}|20\d{2})\b/);
  if (!m) return null;
  const yy = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${yy}-${m[1]}-01`;
}
function addressKey(title: string): string {
  const prefix = title.toLowerCase().replace(/address(es)?/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "_");
  return prefix ? `${prefix}_address`.slice(0, 60) : "address";
}

(async () => {
  const admin = createAdminClient();
  const notes = (parse(readFileSync(FILE, "utf8"), { columns: true, bom: true }) as Note[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const contactIds = [...new Set(notes.map((n) => String(n.user_id)))];
  const members = new Map<string, { id: string; name: string; status: string | null }>();
  for (let i = 0; i < contactIds.length; i += 200) { const { data } = await memberDb(admin).from("members").select("id, full_name, membership_status, freshdesk_contact_id").in("freshdesk_contact_id", contactIds.slice(i, i + 200)); for (const m of data ?? []) { const row = m as { id: string; full_name: string; membership_status: string | null; freshdesk_contact_id: string | null }; if (row.freshdesk_contact_id) members.set(String(row.freshdesk_contact_id), { id: row.id, name: row.full_name, status: row.membership_status }); } }
  const agents = new Map<number, string>(); { const { data } = await admin.schema("freshdesk").from("agents").select("id, name").limit(1000); for (const a of data ?? []) agents.set(Number((a as { id: number }).id), (a as { name: string }).name); }
  // already imported: fact evidence ids + vault refs
  const done = new Set<string>();
  for (let from = 0; ; from += 1000) { const { data } = await memberDb(admin).from("member_facts").select("evidence").eq("source", "freshdesk_note").range(from, from + 999); for (const f of data ?? []) { const id = (f as { evidence: { freshdesk_note_id?: string } }).evidence?.freshdesk_note_id; if (id) done.add(String(id)); } if ((data ?? []).length < 1000) break; }
  { const { data } = await memberDb(admin).from("member_vault").select("source_ref").eq("source", "freshdesk_note").limit(5000); for (const v of data ?? []) if ((v as { source_ref: string | null }).source_ref) done.add(String((v as { source_ref: string }).source_ref)); }

  // For --reread: the note ids whose only fact is the kept note (nothing else was filed from them).
  const rereadable = new Set<string>();
  if (REREAD) {
    const perNote = new Map<string, { note: number; other: number }>();
    for (let from = 0; ; from += 1000) { const { data } = await memberDb(admin).from("member_facts").select("facet, evidence").eq("source", "freshdesk_note").range(from, from + 999); for (const f of data ?? []) { const row = f as { facet: string; evidence: { freshdesk_note_id?: string } }; const id = row.evidence?.freshdesk_note_id; if (!id) continue; const e = perNote.get(String(id)) ?? { note: 0, other: 0 }; if (row.facet === "note") e.note++; else e.other++; perNote.set(String(id), e); } if ((data ?? []).length < 1000) break; }
    for (const [id, e] of perNote) if (e.note > 0 && e.other === 0) rereadable.add(id);
    console.log(`[import] --reread: ${rereadable.size} notes on file with no facts from them`);
  }
  const counts: Record<string, number> = { total: notes.length, unlinked: 0, already: 0, empty: 0, vault: 0, address: 0, reader: 0, reader_failed: 0, facts: 0, relations: 0, notes_kept: 0, vault_stored: 0 };
  const lines: string[] = [`# Freshdesk contact notes import — ${APPLY ? "APPLIED" : "dry run"} · ${new Date().toISOString()}`, ""];
  const work: { n: Note; text: string; l: "vault" | "address" | "reader"; m: { id: string; name: string } }[] = [];
  for (const n of notes) {
    const m = members.get(String(n.user_id)); if (!m) { counts.unlinked++; continue; }
    if (REREAD ? !rereadable.has(n.id) : done.has(n.id)) { counts.already++; continue; }
    const text = strip(n.body); const l = lane(n, text);
    if (l === "empty") { counts.empty++; continue; }
    if (REREAD && l !== "reader") continue;
    if (ONLY && l !== ONLY) continue;
    counts[l]++; work.push({ n, text, l, m });
  }
  const todo = work.slice(0, LIMIT);
  console.log(`[import] ${notes.length} notes · linked members ${members.size} · to do now ${todo.length} (${JSON.stringify(counts)})`);

  await mapWithConcurrency(todo, 6, async ({ n, text, l, m }) => {
    const evidence = { freshdesk_note_id: n.id, title: n.title || null, author: agents.get(Number(n.created_by)) ?? null, created_at: n.created_at };
    if (l === "vault") {
      const kind = vaultKind(n, text);
      const label = n.title.trim() || `From Freshdesk (${kind})`;
      if (APPLY) { const r = await addVaultItemCore({ member_id: m.id, kind, label, secret: (n.title.trim() ? `${n.title.trim()}\n` : "") + text, expires_on: kind === "card" ? cardExpiry(text) : null, source: "freshdesk_note", source_ref: n.id }, null); if (r.error && r.error !== "already stored") console.warn("[import] vault failed", n.id, r.error); else counts.vault_stored++; }
      lines.push(`- VAULT ${kind.padEnd(14)} ${m.name}: "${label}" (${text.length} chars)`); return;
    }
    if (l === "address") {
      const key = addressKey(n.title);
      if (APPLY) { const r = await addFactCore({ member_id: m.id, facet: "address", key, value: text.slice(0, 2000), polarity: "neutral", supersedes_id: null }, IMPORT_ACTOR, { source: "freshdesk_note", confidence: 0.9, evidence, observed_at: n.created_at }); if (r.error) console.warn("[import] address failed", n.id, r.error); else counts.facts++; }
      lines.push(`- ADDRESS ${key.padEnd(22)} ${m.name}: ${mask(text).slice(0, 90)}`); return;
    }
    // the reader: a note about the member, the same way the Observation box reads one
    const safe = ((n.title.trim() ? `${n.title.trim()}: ` : "") + text).replace(/\d[\d -]{8,}\d/g, "[number]").slice(0, 2000);
    const read = await readMemberObservation(safe);
    if (!read) {
      // The Observation box's rule: a reader failure still keeps the note.
      counts.reader_failed++; lines.push(`- READER failed (note kept) ${m.name}: ${mask(safe).slice(0, 80)}`);
      if (APPLY && !REREAD) { const r = await addFactCore({ member_id: m.id, facet: "note", key: "freshdesk", value: text.slice(0, 2000), polarity: "neutral", supersedes_id: null }, IMPORT_ACTOR, { source: "freshdesk_note", confidence: 1, evidence: { ...evidence, original: text.slice(0, 2000) }, observed_at: n.created_at }); if (!r.error) counts.notes_kept++; }
      return;
    }
    if (APPLY) {
      const note = REREAD ? { data: null, error: null } : await addFactCore({ member_id: m.id, facet: "note", key: "freshdesk", value: read.text.slice(0, 2000), polarity: "neutral", supersedes_id: null }, IMPORT_ACTOR, { source: "freshdesk_note", confidence: 1, evidence: { ...evidence, original: text.slice(0, 2000) }, observed_at: n.created_at });
      if (!REREAD && !note.error) counts.notes_kept++;
      for (const f of read.facts) { const r = await addFactCore({ member_id: m.id, facet: f.facet, key: f.key, value: f.value, polarity: f.polarity, supersedes_id: null }, IMPORT_ACTOR, { source: "freshdesk_note", confidence: 0.85, evidence: { ...evidence, note_fact_id: note.data?.id ?? null }, observed_at: n.created_at }); if (!r.error) counts.facts++; }
      for (const r of read.relations) { try { await upsertMemberRelation(admin, m.id, r, { ...evidence, kind: "freshdesk_note" }, n.created_at); counts.relations++; } catch (e) { console.warn("[import] relation failed", e instanceof Error ? e.message : e); } }
    }
    lines.push(`- READER ${m.name}: ${mask(safe).slice(0, 70)} → ${read.facts.map((f) => `${f.facet}/${f.key}=${mask(f.value).slice(0, 40)}`).join("; ") || "(note only)"}`);
  });

  lines.splice(2, 0, "```", JSON.stringify(counts, null, 2), "```", "");
  const dir = join(homedir(), "Desktop", "serene-backups"); mkdirSync(dir, { recursive: true });
  const file = join(dir, `fd-notes-import-${APPLY ? "applied" : "dry"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`);
  writeFileSync(file, lines.join("\n"));
  console.log("[import] done", JSON.stringify(counts)); console.log("[import] report:", file);
})();
