// member-profiler.ts — THE member profiler (migration 0215; plan-sia-intelligence.md S1+S2).
//
// Reads each LINKED member group's WhatsApp chat one finished conversation at a time and
// writes what it learns into the twin (0194): facts, the people around the member, relations,
// one timeline event per conversation, and what is coming up. It is what fills the parts of
// Elaya's get_member_profile that the onboarding sheets could never fill.
//
//   due groups ─► window builder ─► vault (mask) ─► reader (LLM) ─► vault (unmask) ─► writer
//   (rule 4:        per group,        names →         reasoning       codes → names     facts, people,
//    linked only)   split on 6 quiet  code names,     tier, one                         relations, event,
//                   hours, size-cap   phones/emails   JSON answer                       coming up
//
// The plan's laws, as they are enforced here:
//   * Vault first (decision 2). Nothing reaches the model with a participant's name, phone or
//     email in it. Codes are stable per group forever (sia.codenames), so a replay is comparable.
//   * Linked or not read (rule 4). Only sia.profiler_due_groups lists a group, and it lists
//     member-linked groups only. Inside one, tagged staff are staff and everyone else is the
//     member's side; a sender seen in many member groups, or named "… Indulge", is staff.
//   * Truth is append only (rule 1). Facts are inserted, never edited; an identical current
//     fact is skipped, a different one is added beside it (conflicts are a human's call today).
//   * Every extraction is a run (rule 5). One sia.extraction_runs row per window, with the
//     masked input's span, the model, the prompt version, tokens and the coded output.
//   * Fails closed. A model error, torn JSON or an empty answer writes NOTHING and does not
//     move the group's cursor; the next pass reads the same window again.
//
// Runs from src/trigger/member-profiler.ts (gated by the elaya_settings switch) and from
// scripts/members/profile-pilot.ts (the twenty-group pilot the plan's decision 4 asks for).
// Free of `server-only` on purpose, like the sentinel and the Freshdesk sync.

import { createAdminClient } from "@/lib/supabase/admin";
import { memberDb } from "@/lib/supabase/schemas";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { upsertMemberRelation } from "@/lib/services/member-relations";
import { mapRows } from "@/lib/utils/rows";
import {
  CLIENT_FACETS, FACT_KEY_LABELS, FACT_POLARITIES, RELATION_KINDS, ANTICIPATION_KINDS,
  type FactPolarity, type MemberFacet,
} from "@/lib/constants/member-facets";
import {
  PROFILER_PROMPT_VERSION, PROFILER_QUIET_HOURS, PROFILER_WINDOW_MAX_CHARS, PROFILER_MIN_MEMBER_MESSAGES,
  PROFILER_MESSAGE_CHAR_CAP, PROFILER_FETCH_LIMIT, PROFILER_CONFIDENCE_CAP, PROFILER_CONFIDENCE_FLOOR,
  PROFILER_BROAD_SENDER_MIN_GROUPS, PROFILER_GROUPS_PER_RUN, PROFILER_WINDOWS_PER_RUN, PROFILER_RUN_KIND,
  PROFILER_COST_PER_MTOK, PROFILER_MAX_OUTPUT_TOKENS, PROFILER_CALL_TIMEOUT_MS,
  PROFILER_MEMBER_STATUSES, PROFILER_MAX_ATTEMPTS, PROFILER_OUTAGE_STOP, PROFILER_PARALLEL_GROUPS,
} from "@/lib/constants/member-profiler";

const LOG = "[member-profiler]";

// The two 0215 tables are not in the generated types until the next regen; one loose handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };
const sia = (): Loose => createAdminClient().schema("sia") as unknown as Loose;

// ─── Shapes ──────────────────────────────────────────────────────────────────

type Msg = { id: string; sender_jid: string; text: string; type: string; wa_timestamp: string };
type Contact = { jid: string; push_name: string | null; participant_role: string; staff_profile_id: string | null; vendor_id: string | null; member_id: string | null };
type Side = "member" | "staff" | "vendor";
type CodeMap = Map<string, { code: string; side: Side }>;
export type ProfilerWindow = { group_jid: string; member_id: string; messages: Msg[]; from_at: string; to_at: string };

const PEOPLE_RELATIONS = ["spouse", "partner", "child", "parent", "sibling", "staff", "other"] as const;
const RELATION_ENTITY = ["person", "vendor", "place", "venue", "brand", "interest"] as const;
const TONES = ["praise", "neutral", "frustrated", "angry"] as const;
const FACETS = CLIENT_FACETS.values.filter((f) => f !== "note") as Exclude<MemberFacet, "note">[];
const COMING_UP_KINDS = ANTICIPATION_KINDS.values.filter((k) => k !== "silence" && k !== "renewal");

export type ProfiledFact = { facet: Exclude<MemberFacet, "note">; key: string; value: string; polarity: FactPolarity; confidence: number; evidence: number[] };
export type ProfiledPerson = { name: string; relation: (typeof PEOPLE_RELATIONS)[number]; note: string | null; evidence: number[] };
export type ProfiledRelation = { kind: (typeof RELATION_ENTITY)[number]; label: string; relation: (typeof RELATION_KINDS)[number]; evidence: number[] };
export type ProfiledComingUp = { kind: string; title: string; due_at: string; suggested_action: string | null; evidence: number[] };
export type WindowReading = {
  summary: string;
  tone: (typeof TONES)[number];
  facts: ProfiledFact[];
  people: ProfiledPerson[];
  relations: ProfiledRelation[];
  coming_up: ProfiledComingUp[];
};
export type WindowOutcome = {
  group_jid: string; member_id: string; member_name: string; from_at: string; to_at: string; messages: number;
  status: "read" | "thin" | "failed";
  run_id: string | null;
  reading: WindowReading | null;
  written: { facts: number; facts_known: number; people: number; relations: number; events: number; coming_up: number } | null;
  tokens: { in: number; out: number } | null;
  error: string | null;
  /** A thrown failure that was the provider's fault (outage, rate limit, credit), not the conversation's. */
  provider_side?: boolean;
};

// ─── The vault (decision 2) ──────────────────────────────────────────────────

const STAFF_ROLES = new Set(["genie", "bishop", "queen", "joker", "founder", "watcher"]);

function sideOf(c: Contact | undefined, broad: Set<string>, jid: string): { side: Side; tag: string } {
  if (c?.participant_role === "vendor" || c?.vendor_id) return { side: "vendor", tag: "VENDOR" };
  const role = c?.participant_role ?? "unknown";
  if (STAFF_ROLES.has(role)) return { side: "staff", tag: `STAFF_${role.toUpperCase()}` };
  if (c?.staff_profile_id || broad.has(jid) || /indulge/i.test(c?.push_name ?? "")) return { side: "staff", tag: "STAFF" };
  return { side: "member", tag: "MEMBER" };
}

/** Every sender in the window gets its stable code; new ones are minted and stored. */
async function codesFor(groupJid: string, senders: string[], contacts: Map<string, Contact>, broad: Set<string>): Promise<CodeMap> {
  const { data } = await sia().from("codenames").select("sender_jid, code, side").eq("group_jid", groupJid);
  const map: CodeMap = new Map();
  const used = new Set<string>();
  for (const r of (data ?? []) as { sender_jid: string; code: string; side: Side }[]) { map.set(r.sender_jid, { code: r.code, side: r.side }); used.add(r.code); }
  const fresh: { group_jid: string; sender_jid: string; code: string; side: Side }[] = [];
  for (const jid of senders) {
    if (map.has(jid)) continue;
    const { side, tag } = sideOf(contacts.get(jid), broad, jid);
    let n = 1;
    while (used.has(`${tag}_${n}`)) n += 1;
    const code = `${tag}_${n}`;
    used.add(code); map.set(jid, { code, side }); fresh.push({ group_jid: groupJid, sender_jid: jid, code, side });
  }
  if (fresh.length) {
    const { error } = await sia().from("codenames").upsert(fresh, { onConflict: "group_jid,sender_jid", ignoreDuplicates: true });
    if (error) console.warn(`${LOG} codenames upsert failed`, error.message);
  }
  return map;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_NOISE = new Set(["mr", "mrs", "ms", "dr", "sir", "madam", "the", "and", "family", "indulge", "concierge", "team"]);

/** Shaped like one of our codes (or one the model made up in their image, "PERSON_son"). */
const CODE_SHAPED = /(?<![\p{L}\p{N}])(?:MEMBER|STAFF|VENDOR|PERSON)_[\p{L}\p{N}_]+/iu;
/** Exactly our codes, as they appear in a masked line: MEMBER_1, STAFF_GENIE_2, PERSON_4. */
const OUR_CODES = /(?<![\p{L}\p{N}_])(?:MEMBER|STAFF|VENDOR|PERSON)(?:_[A-Z]+)*_\d+(?![\p{L}\p{N}_])/gu;

const cleanName = (name: string | null | undefined): string => (name ?? "").replace(/[^\p{L}\p{N} .'-]/gu, " ").replace(/\s+/g, " ").trim();
/**
 * The words of a name worth masking and worth checking. ONE function for both, so the table
 * and the leak check can never disagree about what a name part is. Edge punctuation is cut
 * ("Mehta." masks "Mehta"); a name that is itself code-shaped is nobody's name.
 */
function nameParts(name: string | null | undefined, minLen: number): string[] {
  const full = cleanName(name);
  if (CODE_SHAPED.test(name ?? "")) return [];
  return full.split(" ").map((part) => part.replace(/^[.'-]+|[.'-]+$/g, "")).filter((part) => part.length >= minLen && !NAME_NOISE.has(part.toLowerCase()));
}

/** Name → code pairs, longest first, from the people we can actually name. */
function nameTable(memberName: string, memberCode: string, contacts: Map<string, Contact>, codes: CodeMap, people: string[]): [RegExp, string][] {
  const pairs: [string, string][] = [];
  const add = (name: string | null | undefined, code: string) => {
    const full = cleanName(name);
    if (full.length < 3 || CODE_SHAPED.test(name ?? "")) return;
    pairs.push([full, code]);
    for (const part of nameParts(name, 3)) pairs.push([part, code]);
  };
  add(memberName, memberCode);
  for (const [jid, c] of contacts) { const code = codes.get(jid)?.code; if (code) add(c.push_name, code); }
  people.forEach((p, i) => add(p, `PERSON_${i + 1}`));
  const seen = new Set<string>();
  return pairs
    .filter(([n]) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b[0].length - a[0].length)
    .map(([n, code]) => [new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, "giu"), code]);
}

function maskText(text: string, table: [RegExp, string][]): string {
  let out = text;
  for (const [re, code] of table) out = out.replace(re, code);
  return out;
}

/** Codes back to names, everywhere in the model's answer. */
function unmaskDeep<T>(value: T, back: [RegExp, string][]): T {
  if (typeof value === "string") { let s: string = value; for (const [re, name] of back) s = s.replace(re, name); return s as unknown as T; }
  if (Array.isArray(value)) return value.map((v) => unmaskDeep(v, back)) as unknown as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, unmaskDeep(v, back)])) as T;
  return value;
}

// ─── The window builder ──────────────────────────────────────────────────────

/** Finished conversations after `cursorAt`: split on quiet gaps, cut at the size cap, and the
 *  last one is kept back until the group has been quiet long enough to call it finished. */
export function buildWindows(groupJid: string, memberId: string, msgs: Msg[], now: number): ProfilerWindow[] {
  const gapMs = PROFILER_QUIET_HOURS * 3600_000;
  const out: ProfilerWindow[] = [];
  let cur: Msg[] = []; let size = 0;
  const flush = () => { if (cur.length) out.push({ group_jid: groupJid, member_id: memberId, messages: cur, from_at: cur[0].wa_timestamp, to_at: cur[cur.length - 1].wa_timestamp }); cur = []; size = 0; };
  for (const m of msgs) {
    const prev = cur[cur.length - 1];
    if (prev && new Date(m.wa_timestamp).getTime() - new Date(prev.wa_timestamp).getTime() >= gapMs) flush();
    const len = Math.min(m.text.length, PROFILER_MESSAGE_CHAR_CAP) + 40;
    if (size + len > PROFILER_WINDOW_MAX_CHARS) flush();
    cur.push(m); size += len;
  }
  // The tail is a conversation still in progress unless the group has gone quiet.
  if (cur.length && now - new Date(cur[cur.length - 1].wa_timestamp).getTime() >= gapMs) flush();
  return out;
}

// ─── The reader ──────────────────────────────────────────────────────────────

const KNOWN_KEYS = Object.keys(FACT_KEY_LABELS).join(", ");

const SYSTEM_PROMPT = `You read one finished conversation from a luxury concierge's WhatsApp group with one member, and file what it teaches us about that MEMBER into their profile.

Names are replaced by codes. MEMBER_n is the member or their household. STAFF_… is the concierge team. VENDOR_n is a supplier. PERSON_n is someone already on the member's file. Use the codes exactly as written; never guess who a code is.

Return ONLY one JSON object, no prose, no code fence:
{
  "summary": "one plain sentence: what the member wanted or said in this conversation",
  "tone": "praise" | "neutral" | "frustrated" | "angry",
  "facts": [{ "facet": string, "key": string, "value": string, "polarity": "likes"|"dislikes"|"neutral", "confidence": number, "evidence": [message numbers] }],
  "people": [{ "name": string, "relation": "spouse"|"partner"|"child"|"parent"|"sibling"|"staff"|"other", "note": string|null, "evidence": [message numbers] }],
  "relations": [{ "kind": "person"|"vendor"|"place"|"venue"|"brand"|"interest", "label": string, "relation": string, "evidence": [message numbers] }],
  "coming_up": [{ "kind": "occasion"|"trip"|"follow_up"|"pattern", "title": string, "due_at": "YYYY-MM-DD", "suggested_action": string|null, "evidence": [message numbers] }]
}

Facets: ${FACETS.join(", ")}.
Keys: prefer one of these when it fits — ${KNOWN_KEYS} — otherwise a short snake_case key.
Relation words: ${RELATION_KINDS.join(", ")}.

The rules that matter:
1. A fact is something DURABLE about the member: a preference, a dislike, a dietary need, an allergy, a usual seat or room, a home city, a family detail, a brand they use, a budget signal, how they like to be contacted. A one-off logistic ("deliver by 5pm today", an order number, a flight time) is NOT a fact.
2. Only what the MEMBER side said, or plainly confirmed, is a fact about the member. What staff or a vendor said is not, unless a member message agrees with it.
3. Never infer beyond the words. "Book a table for two, vegetarian" supports dietary: vegetarian at confidence 0.6, not a spouse. Confidence: 0.8 stated plainly by the member, 0.65 strongly implied, 0.5 a single soft hint. Nothing below 0.5.
4. People: a NAMED human in the member's life (wife, son, assistant, driver). Not staff, not vendors, not the member. Use the name as written. Someone with no name in the text ("my son", "mom") is NOT listed under people and never gets a code of your own making; if the detail is durable, file it as a family fact instead.
5. coming_up needs a real date. Resolve "next Friday" or "on the 14th" from the message's own date. No date, no entry.
6. Every item cites the message numbers it rests on. No evidence, no item.
7. If the conversation teaches nothing durable, return empty arrays. An empty answer is a good answer. Do not repeat a fact listed under "Already on file".`;

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

/** "PERSON_son" is the model copying our code style for someone unnamed; the word is what it meant. */
const INVENTED_CODE = /(?<![\p{L}\p{N}_])PERSON_([\p{L}][\p{L}-]*)(?![\p{L}\p{N}_])/giu;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(INVENTED_CODE, "$1").replace(/\s+/g, " ").trim().slice(0, max) : "");
const idxs = (v: unknown, n: number): number[] => (Array.isArray(v) ? [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= n))] : []);
const isoDate = (v: unknown): string | null => { const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : null; };

/** Trust nothing: every field is checked against our own vocabulary; anything else is dropped. */
export function validateReading(raw: Record<string, unknown>, messageCount: number): WindowReading {
  const arr = (k: string): Record<string, unknown>[] => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : []);
  const facts: ProfiledFact[] = [];
  for (const f of arr("facts")) {
    const facet = str(f.facet, 40) as ProfiledFact["facet"]; const key = str(f.key, 60).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const value = str(f.value, 400); const evidence = idxs(f.evidence, messageCount);
    const confidence = Math.min(PROFILER_CONFIDENCE_CAP, Number(f.confidence));
    const polarity = (FACT_POLARITIES as readonly string[]).includes(str(f.polarity, 12)) ? (str(f.polarity, 12) as FactPolarity) : "neutral";
    if (!FACETS.includes(facet) || !key || !value || evidence.length === 0 || !(confidence >= PROFILER_CONFIDENCE_FLOOR)) continue;
    facts.push({ facet, key, value, polarity, confidence: Math.round(confidence * 100) / 100, evidence });
  }
  const people: ProfiledPerson[] = [];
  for (const p of arr("people")) {
    const name = str(p.name, 120); const relation = str(p.relation, 20) as ProfiledPerson["relation"]; const evidence = idxs(p.evidence, messageCount);
    // A person is someone NAMED. A code (ours, or one made up for "the son") is not a name; filed
    // as one it sat in the member's people list and tripped the leak check on every later reading.
    const rawName = typeof p.name === "string" ? p.name : "";
    if (name.length < 2 || CODE_SHAPED.test(rawName) || NAME_NOISE.has(name.toLowerCase()) || !PEOPLE_RELATIONS.includes(relation) || evidence.length === 0) continue;
    people.push({ name, relation, note: str(p.note, 300) || null, evidence });
  }
  const relations: ProfiledRelation[] = [];
  for (const r of arr("relations")) {
    const kind = str(r.kind, 20) as ProfiledRelation["kind"]; const relation = str(r.relation, 20) as ProfiledRelation["relation"];
    const label = str(r.label, 120); const evidence = idxs(r.evidence, messageCount);
    if (!RELATION_ENTITY.includes(kind) || !(RELATION_KINDS as readonly string[]).includes(relation) || label.length < 2 || /^(MEMBER|STAFF)_/i.test(label) || evidence.length === 0) continue;
    relations.push({ kind, label, relation, evidence });
  }
  const coming_up: ProfiledComingUp[] = [];
  for (const c of arr("coming_up")) {
    const kind = str(c.kind, 20); const title = str(c.title, 160); const due = isoDate(c.due_at); const evidence = idxs(c.evidence, messageCount);
    if (!(COMING_UP_KINDS as readonly string[]).includes(kind) || !title || !due || evidence.length === 0) continue;
    coming_up.push({ kind, title, due_at: due, suggested_action: str(c.suggested_action, 300) || null, evidence });
  }
  const tone = (TONES as readonly string[]).includes(str(raw.tone, 12)) ? (str(raw.tone, 12) as WindowReading["tone"]) : "neutral";
  return { summary: str(raw.summary, 300), tone, facts, people, relations, coming_up };
}

// ─── One window, end to end ──────────────────────────────────────────────────

export type MemberCtx = { id: string; full_name: string; tier: string | null; facts: { facet: string; key: string; value: string; polarity?: string | null }[]; people: string[] };

async function memberContext(memberId: string): Promise<MemberCtx | null> {
  const admin = createAdminClient();
  const [{ data: m }, { data: facts }, { data: people }] = await Promise.all([
    memberDb(admin).from("members").select("id, full_name, tier").eq("id", memberId).maybeSingle(),
    memberDb(admin).from("member_facts").select("facet, key, value, polarity").eq("member_id", memberId).is("superseded_by", null).neq("facet", "note").order("confidence", { ascending: false }).limit(400),
    memberDb(admin).from("member_people").select("name").eq("member_id", memberId).limit(60),
  ]);
  if (!m) return null;
  return {
    id: (m as { id: string }).id,
    full_name: (m as { full_name: string }).full_name,
    tier: (m as { tier: string | null }).tier ?? null,
    facts: mapRows<MemberCtx["facts"][number], MemberCtx["facts"][number]>(facts, (r) => r),
    people: mapRows<{ name: string }, string>(people, (r) => r.name),
  };
}

export type ProfilerDeps = { broad: Set<string>; apply: boolean };

/**
 * THE vault for one stretch of one group's chat: who is who (code names, kept per group in
 * sia.codenames), a masker that turns every known name, phone and email into a code, the leak
 * check, and the way back from codes to names. The profiler and the ticket intake both open it,
 * so a name reaches a model through neither (plan rule: vault first).
 */
export type Vault = {
  ctx: MemberCtx;
  /** "member" | "staff" | "vendor" for a sender; a stranger reads as member-side (MEMBER_n). */
  sideOf: (senderJid: string) => Side;
  codeOf: (senderJid: string) => string;
  mask: (text: string) => string;
  /** Known names still readable in this masked text (our own codes are ignored). Empty = safe to send. */
  leaks: (maskedText: string) => string[];
  /** Codes back to names, everywhere inside a value. */
  unmask: <T>(value: T) => T;
};

export async function openVault(groupJid: string, memberId: string, senderJids: string[], broad: Set<string>): Promise<Vault | null> {
  const ctx = await memberContext(memberId);
  if (!ctx) return null;
  const senders = [...new Set(senderJids)];
  const { data: contactRows } = await sia().from("wag_contacts").select("jid, push_name, participant_role, staff_profile_id, vendor_id, member_id").in("jid", senders);
  const contacts = new Map<string, Contact>(((contactRows ?? []) as Contact[]).map((c) => [c.jid, c]));
  const codes = await codesFor(groupJid, senders, contacts, broad);

  // The member's own number carries the member's name; otherwise the first member-side code does.
  const ownJid = [...contacts.values()].find((c) => c.member_id === memberId)?.jid;
  const memberCode = (ownJid && codes.get(ownJid)?.code) || [...codes.values()].find((c) => c.side === "member")?.code || "MEMBER_1";
  const table = nameTable(ctx.full_name, memberCode, contacts, codes, ctx.people);
  const knownNames = [ctx.full_name, ...[...contacts.values()].map((c) => c.push_name ?? ""), ...ctx.people].flatMap((n) => nameParts(n, 4));
  const depth = await getPiiMaskingDepth();
  const floor = depth === "off" ? "light" : depth; // the vault never runs with the regex floor off

  // Codes → names, longest code first so MEMBER_10 is never read as MEMBER_1 + "0".
  const back: [RegExp, string][] = [];
  const nameOf = (jid: string) => contacts.get(jid)?.push_name?.trim() || null;
  for (const [jid, c] of codes) back.push([new RegExp(`\\b${esc(c.code)}\\b`, "g"), jid === ownJid || c.code === memberCode ? ctx.full_name : (nameOf(jid) ?? (c.side === "member" ? "a member of the household" : c.side === "staff" ? "the concierge team" : "the vendor"))]);
  ctx.people.forEach((p, i) => back.push([new RegExp(`\\bPERSON_${i + 1}\\b`, "g"), p]));
  back.sort((x, y) => y[0].source.length - x[0].source.length);

  return {
    ctx,
    sideOf: (jid) => codes.get(jid)?.side ?? "member",
    codeOf: (jid) => codes.get(jid)?.code ?? "MEMBER_1",
    mask: (t) => maskPii(maskText(t, table), floor),
    // Our own codes are taken out first: a genie whose WhatsApp name is "Joker" is masked to
    // STAFF_JOKER_1, and that code must not read as the name "Joker" having survived.
    leaks: (masked) => { const visible = masked.replace(OUR_CODES, " "); return [...new Set(knownNames.filter((n) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, "iu").test(visible)))]; },
    unmask: (value) => unmaskDeep(value, back),
  };
}

export async function profileWindow(w: ProfilerWindow, deps: ProfilerDeps): Promise<WindowOutcome> {
  const base: WindowOutcome = { group_jid: w.group_jid, member_id: w.member_id, member_name: "", from_at: w.from_at, to_at: w.to_at, messages: w.messages.length, status: "failed", run_id: null, reading: null, written: null, tokens: null, error: null };
  const vault = await openVault(w.group_jid, w.member_id, w.messages.map((m) => m.sender_jid), deps.broad);
  if (!vault) return { ...base, error: "member not found" };
  const { ctx, mask } = vault;
  base.member_name = ctx.full_name;

  const memberSide = w.messages.filter((m) => vault.sideOf(m.sender_jid) === "member").length;
  if (memberSide < PROFILER_MIN_MEMBER_MESSAGES) return { ...base, status: "thin" };

  const lines = w.messages.map((m, i) => {
    const code = vault.codeOf(m.sender_jid);
    const text = m.text.length > PROFILER_MESSAGE_CHAR_CAP ? m.text.slice(0, PROFILER_MESSAGE_CHAR_CAP) + "…" : m.text;
    return `[#${i + 1} ${m.wa_timestamp.slice(0, 16).replace("T", " ")}] ${code}: ${mask(text)}`;
  });
  const onFile = ctx.facts.slice(0, 60).map((f) => `- ${f.facet} / ${mask(f.key)}: ${mask(f.value).slice(0, 120)}`).join("\n") || "- nothing yet";
  const userContent = `Already on file for this member (do not repeat these):\n${onFile}\n\nThe conversation (${w.messages.length} messages):\n${lines.join("\n")}`;

  // The vault's own guard: if any name we KNOW survived the masking, this window does not leave.
  const leaked = vault.leaks(lines.join("\n"));
  if (leaked.length) {
    console.warn(`${LOG} vault leak in ${w.group_jid}: ${leaked.length} known name(s) survived masking; window not sent`);
    return { ...base, error: `vault leak (${leaked.length} name${leaked.length === 1 ? "" : "s"})` };
  }

  const admin = createAdminClient();
  const startedAt = new Date().toISOString();
  const { data: runRow } = await admin.schema("sia").from("extraction_runs").insert({
    kind: PROFILER_RUN_KIND, member_id: w.member_id, prompt_version: PROFILER_PROMPT_VERSION, started_at: startedAt,
    input_ref: { group_jid: w.group_jid, from_at: w.from_at, to_at: w.to_at, messages: w.messages.length, first_message_id: w.messages[0].id, last_message_id: w.messages[w.messages.length - 1].id, codes: new Set(w.messages.map((m) => vault.codeOf(m.sender_jid))).size, dry_run: !deps.apply, masked_window: userContent.slice(0, 24_000) },
  }).select("id").single();
  const runId = (runRow as { id: string } | null)?.id ?? null;
  const finish = async (ok: boolean, patch: Record<string, unknown>) => {
    if (runId) await admin.schema("sia").from("extraction_runs").update({ ok, finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
  };

  try {
    const llm = await resolveLlmForJob("reasoning");
    const result = await llm.adapter.complete({ model: llm.model, maxTokens: PROFILER_MAX_OUTPUT_TOKENS, effort: "low", timeoutMs: PROFILER_CALL_TIMEOUT_MS, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userContent }] });
    const tokens = { in: result.usage.inputTokens, out: result.usage.outputTokens };
    const cost = (tokens.in * PROFILER_COST_PER_MTOK.input + tokens.out * PROFILER_COST_PER_MTOK.output) / 1_000_000;
    if (result.stopReason === "max_tokens") {
      // A cut-off answer is torn JSON at best; never parse half an answer into someone's profile.
      await finish(false, { model: llm.model, tokens_in: tokens.in, tokens_out: tokens.out, cost_usd: cost, error: "answer cut off at the token limit", output: { text: result.text.slice(0, 2000) } });
      return { ...base, run_id: runId, tokens, error: "answer cut off at the token limit" };
    }
    const raw = parseJson(result.text);
    if (!raw) { await finish(false, { model: llm.model, tokens_in: tokens.in, tokens_out: tokens.out, cost_usd: cost, error: "no json", output: { text: result.text.slice(0, 2000) } }); return { ...base, run_id: runId, tokens, error: "no json" }; }

    const coded = validateReading(raw, w.messages.length);
    const reading = vault.unmask(coded);

    const written = deps.apply ? await writeReading(w, reading, ctx, runId) : null;
    await finish(true, { model: llm.model, tokens_in: tokens.in, tokens_out: tokens.out, cost_usd: cost, output: { reading: coded, written } });
    return { ...base, status: "read", run_id: runId, reading, written, tokens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish(false, { error: msg.slice(0, 500) });
    console.warn(`${LOG} window failed`, w.group_jid, msg);
    return { ...base, run_id: runId, error: msg, provider_side: isProviderSide(e, msg) };
  }
}

/**
 * Was this failure the provider's (down, rate limited, out of credit, the network) and not
 * this conversation's? It decides whether the failure counts toward stepping over the
 * conversation. Only a request the provider REJECTS AS INVALID is the conversation's fault;
 * an empty credit balance arrives as a 400 too, so it is named explicitly. The error is read
 * by shape, never by class: the SDK may only be imported inside the adapter.
 */
export function isProviderSide(e: unknown, msg: string): boolean {
  if (/credit balance|billing/i.test(msg)) return true;
  const status = (e as { status?: unknown } | null)?.status;
  return !(status === 400 || status === 413 || status === 422);
}

// ─── The writer (rule 1: append only; every row points at its run) ───────────

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function writeReading(w: ProfilerWindow, r: WindowReading, ctx: MemberCtx, runId: string | null): Promise<NonNullable<WindowOutcome["written"]>> {
  const admin = createAdminClient();
  const ev = (nums: number[]) => {
    const picked = nums.map((n) => w.messages[n - 1]).filter(Boolean);
    return { group_jid: w.group_jid, message_ids: picked.map((m) => m.id), quote: picked[0]?.text.slice(0, 240) ?? null, window: { from_at: w.from_at, to_at: w.to_at }, kind: "profiler" };
  };
  const at = (nums: number[]) => w.messages[(nums[0] ?? 1) - 1]?.wa_timestamp ?? w.from_at;
  const out = { facts: 0, facts_known: 0, people: 0, relations: 0, events: 0, coming_up: 0 };

  // Facts: an identical current fact is one we already know — skip it, never duplicate.
  const rows = [];
  for (const f of r.facts) {
    if (ctx.facts.some((k) => k.facet === f.facet && k.key === f.key && same(k.value, f.value))) { out.facts_known += 1; continue; }
    rows.push({ member_id: w.member_id, facet: f.facet, key: f.key, value: f.value, polarity: f.polarity, source: "whatsapp_group" as const, confidence: f.confidence, run_id: runId, evidence: ev(f.evidence), observed_at: at(f.evidence) });
    ctx.facts.push({ facet: f.facet, key: f.key, value: f.value });
  }
  if (rows.length) {
    const { error } = await memberDb(admin).from("member_facts").insert(rows);
    if (error) console.warn(`${LOG} facts insert failed`, error.message); else out.facts = rows.length;
  }

  for (const p of r.people) {
    if (ctx.people.some((n) => same(n, p.name)) || same(p.name, ctx.full_name)) continue;
    const { error } = await memberDb(admin).from("member_people").insert({ member_id: w.member_id, name: p.name, relation: p.relation, note: p.note, can_request: false });
    if (error) console.warn(`${LOG} person insert failed`, error.message); else { out.people += 1; ctx.people.push(p.name); }
  }

  for (const rel of r.relations) {
    try { if (await upsertMemberRelation(admin, w.member_id, rel, { ...ev(rel.evidence), run_id: runId }, at(rel.evidence))) out.relations += 1; }
    catch (e) { console.warn(`${LOG} relation failed`, e instanceof Error ? e.message : e); }
  }

  // One timeline line per conversation: what the member wanted, and how they sounded.
  if (r.summary) {
    const ref = { group_jid: w.group_jid, first_message_id: w.messages[0].id, last_message_id: w.messages[w.messages.length - 1].id, run_id: runId };
    const { data: dup } = await memberDb(admin).from("member_events").select("id").eq("member_id", w.member_id).eq("source", "whatsapp_group").contains("source_ref", { first_message_id: ref.first_message_id }).limit(1);
    if (!dup?.length) {
      const { error } = await memberDb(admin).from("member_events").insert({ member_id: w.member_id, occurred_at: w.from_at, kind: "message_in", source: "whatsapp_group", source_ref: ref, actor: "member", summary: r.summary, tone: r.tone, weight: r.tone === "neutral" ? 0.1 : 0.4 });
      if (error) console.warn(`${LOG} event insert failed`, error.message); else out.events = 1;
    }
  }

  for (const c of r.coming_up) {
    const due = new Date(`${c.due_at}T09:00:00+05:30`);
    if (due.getTime() < Date.now() - 86_400_000) continue; // already past: history, not something coming up
    const { data: dup } = await memberDb(admin).from("member_anticipations").select("id").eq("member_id", w.member_id).eq("kind", c.kind).ilike("title", c.title).in("status", ["pending", "surfaced"]).limit(1);
    if (dup?.length) continue;
    const { error } = await memberDb(admin).from("member_anticipations").insert({ member_id: w.member_id, kind: c.kind, title: c.title, due_at: due.toISOString(), suggested_action: c.suggested_action, evidence: ev(c.evidence), run_id: runId, status: "pending" });
    if (error) console.warn(`${LOG} coming-up insert failed`, error.message); else out.coming_up += 1;
  }
  return out;
}

// ─── The sweep ───────────────────────────────────────────────────────────────

export type SweepOptions = {
  apply: boolean;
  maxGroups?: number;
  maxWindows?: number;
  /** Pilot only: read from this moment instead of the group's cursor (never with apply). */
  startAt?: string;
  /** Pilot only: the newest N finished conversations per group instead of the oldest. */
  newestPerGroup?: number;
  /** Stop starting new windows after this many ms (the cloud task's time budget). */
  deadlineMs?: number;
  onWindow?: (o: WindowOutcome) => void;
};

export async function getBroadSenders(): Promise<Set<string>> {
  const { data, error } = await sia().rpc("profiler_broad_senders", { p_min_groups: PROFILER_BROAD_SENDER_MIN_GROUPS });
  if (error) { console.warn(`${LOG} broad senders failed`, error.message); return new Set(); }
  return new Set(((data ?? []) as { sender_jid: string }[]).map((r) => r.sender_jid));
}

export async function runProfilerSweep(opts: SweepOptions): Promise<{ groups: number; windows: number; outcomes: WindowOutcome[] }> {
  const maxGroups = opts.maxGroups ?? PROFILER_GROUPS_PER_RUN;
  const maxWindows = opts.maxWindows ?? PROFILER_WINDOWS_PER_RUN;
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  if (opts.apply && (opts.startAt || opts.newestPerGroup)) throw new Error("startAt / newestPerGroup are pilot options; they cannot be combined with apply");

  const [{ data: due, error }, broad] = await Promise.all([
    sia().rpc("profiler_due_groups", { p_limit: maxGroups, p_statuses: [...PROFILER_MEMBER_STATUSES] }),
    getBroadSenders(),
  ]);
  if (error) throw new Error(`${LOG} due groups failed: ${error.message}`);
  const groups = (due ?? []) as { group_jid: string; member_id: string; cursor_at: string | null; newest_at: string; fail_count: number | null }[];
  const outcomes: WindowOutcome[] = [];
  let sent = 0;
  let providerFailsInARow = 0;
  // Groups whose reading failed on the provider's side this run. They count as a failed
  // attempt ONLY if something else was read in the same run: that is the proof the provider
  // was up, so the trouble is this conversation (a timeout it always hits, say).
  const providerFailed: { group_jid: string; fail_count: number; w: ProfilerWindow; o: WindowOutcome }[] = [];
  const state = (groupJid: string, patch: Record<string, unknown>) =>
    sia().from("profiler_group_state").upsert({ group_jid: groupJid, ...patch }, { onConflict: "group_jid" });

  /** One more failed attempt at this conversation; at the limit, step over it. True = stepped over. */
  const countFailure = async (groupJid: string, failCount: number, w: ProfilerWindow, o: WindowOutcome): Promise<boolean> => {
    const attempts = failCount + 1;
    const why = o.error?.slice(0, 200) ?? "failed";
    if (attempts < PROFILER_MAX_ATTEMPTS) { await state(groupJid, { fail_count: attempts, last_error: why }); return false; }
    console.warn(`${LOG} stepping over a conversation after ${attempts} failed readings`, groupJid, w.from_at, w.to_at, why);
    await state(groupJid, { last_message_at: w.to_at, fail_count: 0, last_run_id: o.run_id, last_error: `stepped over ${w.from_at} to ${w.to_at} after ${attempts} failed readings: ${why}`.slice(0, 300) });
    return true;
  };

  // Groups are read side by side (PROFILER_PARALLEL_GROUPS at a time); inside one group the
  // conversations stay strictly in order, because each reading builds on the people and facts the
  // one before it filed. Two groups of the SAME member never run together: they would race on
  // that member's facts. The second one waits for the next run.
  const seenMembers = new Set<string>();
  const runnable = groups.filter((g) => (seenMembers.has(g.member_id) ? false : (seenMembers.add(g.member_id), true)));
  let stop = false;

  const readGroup = async (g: (typeof groups)[number]): Promise<void> => {
    if (stop || sent >= maxWindows || Date.now() >= deadline) return;
    const after = opts.startAt ?? g.cursor_at;
    let q = sia().from("wag_messages").select("id, sender_jid, text, type, wa_timestamp").eq("chat_jid", g.group_jid).eq("is_revoked", false).not("text", "is", null).order("wa_timestamp", { ascending: true }).limit(PROFILER_FETCH_LIMIT);
    if (after) q = q.gt("wa_timestamp", after);
    const { data: rows, error: mErr } = await q;
    if (mErr) { console.warn(`${LOG} messages read failed`, g.group_jid, mErr.message); return; }
    const msgs = ((rows ?? []) as Msg[]).filter((m) => m.text.trim().length > 0);
    // Nothing but photos, stickers or deleted messages since the bookmark: there is no text to
    // read and there never will be, so the bookmark moves past them. Left alone, the group would
    // stay "due" for ever and hold a slot other groups are waiting for.
    if (msgs.length === 0) { if (opts.apply) await state(g.group_jid, { last_message_at: g.newest_at }); return; }
    let windows = buildWindows(g.group_jid, g.member_id, msgs, Date.now());
    // A full page means the last conversation may be cut by the page, not by a quiet gap. Leave
    // it for the next pass, which starts right after the conversation before it and reads it whole.
    if ((rows ?? []).length >= PROFILER_FETCH_LIMIT && windows.length > 1) windows = windows.slice(0, -1);
    if (opts.newestPerGroup) windows = windows.slice(-opts.newestPerGroup);
    let failCount = Number(g.fail_count ?? 0);

    for (const w of windows) {
      if (stop || sent >= maxWindows || Date.now() >= deadline) break;
      const o = await profileWindow(w, { broad, apply: opts.apply });
      outcomes.push(o); opts.onWindow?.(o);
      if (o.status !== "thin") sent += 1;
      if (o.status !== "failed") providerFailsInARow = 0;
      if (!opts.apply) continue;

      if (o.status === "failed") {
        // Fails closed: the bookmark stays, so the same conversation is read again next pass.
        if (o.provider_side) {
          providerFailed.push({ group_jid: g.group_jid, fail_count: failCount, w, o });
          await state(g.group_jid, { last_error: o.error?.slice(0, 300) ?? "failed" });
          providerFailsInARow += 1;
          if (providerFailsInARow >= PROFILER_OUTAGE_STOP) { console.warn(`${LOG} the provider looks down; stopping this run`); stop = true; }
          break;
        }
        if (await countFailure(g.group_jid, failCount, w, o)) { failCount = 0; continue; }
        break;
      }
      failCount = 0;
      const { data: st } = await sia().from("profiler_group_state").select("windows_done").eq("group_jid", g.group_jid).maybeSingle();
      await state(g.group_jid, { last_message_at: w.to_at, windows_done: Number((st as { windows_done: number } | null)?.windows_done ?? 0) + 1, last_run_id: o.run_id, last_error: null, fail_count: 0 });
    }
  };
  await mapWithConcurrency(runnable, opts.apply ? PROFILER_PARALLEL_GROUPS : 1, readGroup);

  if (opts.apply && providerFailed.length && outcomes.some((o) => o.status === "read")) {
    for (const f of providerFailed) await countFailure(f.group_jid, f.fail_count, f.w, f.o);
  }

  return { groups: groups.length, windows: sent, outcomes };
}
