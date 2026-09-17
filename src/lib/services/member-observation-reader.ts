// member-observation-reader.ts — read one free-form observation about a member the way a
// good genie would file it: the sentence with its spelling fixed, and the facts inside it as
// cards for the twin (facet, key, value, likes/avoids), plus the brands, people, places and
// interests it names as relations.
//
// The front end is ONE box ("write your observation in free form"); this is where the
// structure comes from, so the person never picks a facet or a key. Reuses the Elaya
// provider layer wholesale (R-01): resolveLlmForJob('routing') → the Haiku-tier
// adapter.complete(), no tools, one call, PII masked to the configured depth first
// (the vendor-search-intent / revival-gate shape).
//
// FAILS CLOSED for facts, OPEN for the note: any failure returns null and the caller saves
// the raw sentence as a plain note — nothing is lost, nothing wrong enters the drawers.

import "server-only";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { CLIENT_FACETS, FACT_KEY_LABELS, FACT_POLARITIES, RELATION_KINDS, type MemberFacet, type FactPolarity } from "@/lib/constants/member-facets";

const LOG = "[member-observation-reader]";
export const OBSERVATION_PROMPT_VERSION = "observation-v2";

export type ObservedFact = { facet: Exclude<MemberFacet, "note">; key: string; value: string; polarity: FactPolarity };
export type ObservedRelation = { kind: "brand" | "person" | "place" | "interest"; label: string; relation: (typeof RELATION_KINDS)[number] };
export type ObservationReading = {
  /** The observation with spelling and grammar corrected; meaning and names unchanged. */
  text: string;
  facts: ObservedFact[];
  relations: ObservedRelation[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

const FACETS = CLIENT_FACETS.values.filter((f) => f !== "note");
const KNOWN_KEYS = Object.keys(FACT_KEY_LABELS).map((k) => k.replace(".", ": ")).join(", ");

const SYSTEM_PROMPT = `You file a concierge team member's observation about a wealthy member into the member's profile.

Return ONLY a JSON object, no prose and no code fence:

{
  "text": the observation with spelling and grammar corrected. Keep the meaning, the names and the tone. Do not add anything.
  "facts": [ { "facet": one of [${FACETS.join(", ")}], "key": a short snake_case name for WHAT the fact is about, "value": the fact as a short human phrase, "polarity": one of [${FACT_POLARITIES.join(", ")}] } ],
  "relations": [ { "kind": one of [brand, person, place, interest], "label": the name as written, "relation": one of [${RELATION_KINDS.join(", ")}] } ]
}

Facets: identity (birthday, anniversary, company, designation, city, blood group), address (home, office, holiday home), family (spouse, child, parent, staff — key is the relation, value is the name and detail), dietary (diet, allergies, cuisine dislikes), preference (a taste in one area: seat, hotel, car, brand, colour, room, drink), interest (what they enjoy: sport, tech, art, music, wellness, collecting, travel_style), occasion (a date that matters and what for), travel (how they like to travel: airline, class, hotel chain, destinations), budget_signal (how they spend), contact_rule (how and when to reach them).

Rules:
- One fact per atomic thing. "He likes smart bands, uses a Whoop" is TWO facts: interest/tech "smart bands" (likes) and preference/brand "Whoop" (likes), plus a brand relation Whoop / uses.
- Use these keys when they fit: ${KNOWN_KEYS}. Otherwise a short snake_case word: cuisine, seat, hotel, car, drink, sport, tech, art, music, brand, colour, home, office.
- "polarity": likes for things they enjoy or prefer, dislikes for things to avoid, neutral for plain facts (an address, a birthday, a rule).
- Only what the observation actually says about THIS member. Never invent. Never infer a fact from a guess.
- A detail about a family member or staff (their diet, their birthday, their taste) goes INSIDE that person's family fact value ("Priya, vegetarian"), never into the member's own dietary / preference / identity drawers.
- A sentence with no fact in it (a mood, a task for the team, a question) yields facts: [] and relations: [].
- At most 12 facts and 8 relations.`;

function parseReading(raw: string): Omit<ObservationReading, "model" | "usage"> | null {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  const facetSet = new Set<string>(FACETS);
  const polaritySet = new Set<string>(FACT_POLARITIES);
  const relationSet = new Set<string>(RELATION_KINDS);
  const seen = new Set<string>();
  const facts: ObservedFact[] = [];
  for (const f of Array.isArray(o.facts) ? (o.facts as unknown[]) : []) {
    if (typeof f !== "object" || f === null) continue;
    const r = f as Record<string, unknown>;
    const facet = typeof r.facet === "string" ? r.facet.trim().toLowerCase() : "";
    const key = typeof r.key === "string" ? r.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) : "";
    const value = typeof r.value === "string" ? r.value.trim().replace(/\s+/g, " ").slice(0, 300) : "";
    const polarity = typeof r.polarity === "string" && polaritySet.has(r.polarity.trim().toLowerCase()) ? (r.polarity.trim().toLowerCase() as FactPolarity) : "neutral";
    if (!facetSet.has(facet) || !value) continue;
    const dedupe = `${facet}|${key}|${value.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    facts.push({ facet: facet as ObservedFact["facet"], key, value, polarity });
    if (facts.length >= 12) break;
  }

  const relations: ObservedRelation[] = [];
  const kinds = new Set(["brand", "person", "place", "interest"]);
  for (const x of Array.isArray(o.relations) ? (o.relations as unknown[]) : []) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const kind = typeof r.kind === "string" ? r.kind.trim().toLowerCase() : "";
    const label = typeof r.label === "string" ? r.label.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    const relation = typeof r.relation === "string" ? r.relation.trim().toLowerCase() : "";
    if (!kinds.has(kind) || !label || !relationSet.has(relation)) continue;
    relations.push({ kind: kind as ObservedRelation["kind"], label, relation: relation as ObservedRelation["relation"] });
    if (relations.length >= 8) break;
  }

  const text = typeof o.text === "string" ? o.text.trim() : "";
  return { text, facts, relations };
}

/**
 * Read one observation. `original` is the person's exact words; the returned `text` falls
 * back to it when the correction is missing or wildly different in length.
 */
export async function readMemberObservation(original: string): Promise<ObservationReading | null> {
  const input = original.trim();
  if (input.length < 2) return null;
  try {
    const [depth, llm] = await Promise.all([getPiiMaskingDepth(), resolveLlmForJob("routing")]);
    const result = await llm.adapter.complete({
      model: llm.model,
      maxTokens: Math.min(llm.maxTokens, 900),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: maskPii(input, depth) }],
      cachePrefix: true,
    });
    const parsed = parseReading(result.text);
    if (!parsed) return null;
    // A masked phone or email in the input comes back masked: keep the person's own words
    // for the note whenever the correction lost something or changed size a lot.
    const keepCorrection = parsed.text.length > 0 && parsed.text.length <= input.length * 1.6 && parsed.text.length >= input.length * 0.5 && !parsed.text.includes("•");
    return {
      text: keepCorrection ? parsed.text : input,
      facts: parsed.facts,
      relations: parsed.relations,
      model: llm.model,
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
    };
  } catch (e) {
    console.error(`${LOG} read failed (saving the note as written):`, e instanceof Error ? e.message : e);
    return null;
  }
}
