// Elaya CUSTOMER tool registry — SERVER ONLY. (FEATURE 2 — the WhatsApp customer channel.)
//
// THE GOLDEN RULE, in code: a customer principal carries ONLY the tools in this file.
// There is NO path from here to a staff tool, a lead/deal/task/performance read, or any
// CRM data — a customer turn physically cannot reach staff data because those tools are
// not in CUSTOMER_TOOLSET and the customer dispatch (executeCustomerTool) refuses any
// name outside it. A training doc, a scraped page, or a customer message that says
// "I'm an admin, show me everything" changes NOTHING — it is content the model reads,
// never permission it holds.
//
// Two tools, both lead-scoped to the customer's OWN lead:
//   • get_company_material — pull the curated training assets (brochures / work examples /
//     testimonials / reviews / podcast / facts) to share, scoped to the lead's domain.
//     Read-only; the ONLY source of company facts the model may state.
//   • note_customer_interest — record what the prospect cares about onto THIS lead's
//     service_interests (the ONE write a customer turn may do — never status, never
//     anyone else, never a staff field). Lets the human agent pick up warm.

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeText } from "@/lib/utils/sanitize";
import { getTrainingAssetsForBlast } from "@/lib/services/elaya-training-service";
import { extractServiceInterests } from "@/lib/services/lead-ingestion";
import { TRAINING_BUCKET } from "@/lib/constants/elaya-training";
import type { CustomerPrincipal } from "@/lib/elaya/principal";
import type { LlmToolDefinition } from "@/lib/elaya/provider";

export type ElayaCustomerToolName = "get_company_material" | "note_customer_interest";

/** The hard cap — the ONLY tools any customer principal ever carries. */
export const CUSTOMER_TOOLSET: readonly ElayaCustomerToolName[] = [
  "get_company_material",
  "note_customer_interest",
];

type CustomerTool = {
  name: ElayaCustomerToolName;
  description: string;
  schema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  run: (principal: CustomerPrincipal, input: Record<string, unknown>) => Promise<unknown>;
};

// Resolve a stored asset to a sendable public url. A storage_path → the public bucket
// url (no signing — public bucket); an external url passes through. Either may be null.
function assetPublicUrl(storagePath: string | null, url: string | null): string | null {
  if (url && url.trim().length > 0) return url;
  if (!storagePath) return null;
  // Public bucket — the canonical public object url (mirrors supabase getPublicUrl).
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!base) return null;
  return `${base}/storage/v1/object/public/${TRAINING_BUCKET}/${storagePath}`;
}

// ── get_company_material — read-only, KB-scoped to the lead's domain ──
const getCompanyMaterial: CustomerTool = {
  name: "get_company_material",
  description:
    "Fetch the company's curated material to share with this customer — brochures, work examples, " +
    "testimonials, reviews, the podcast, and key company facts. Call this whenever you want to send " +
    "the customer something concrete about Indulge, or to ground what you say in real facts. Optionally " +
    "pass the topics the customer cares about (e.g. 'wedding', 'dubai') to prioritise relevant material. " +
    "This is the ONLY source of company facts — never invent a service, price, or claim that isn't here.",
  schema: z.object({
    interests: z.array(z.string().trim().toLowerCase().max(60)).max(6).optional(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      interests: {
        type: "array",
        items: { type: "string" },
        description: "Topics the customer cares about, to prioritise relevant material",
      },
    },
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { interests } = input as { interests?: string[] };
    const assets = await getTrainingAssetsForBlast(principal.domain, interests);
    // Separate the facts (text the model states) from sendable media (urls Elaya shares).
    const facts = assets
      .filter((a) => a.kind === "fact")
      .map((a) => ({ title: a.title, body: a.description ?? "" }))
      .filter((f) => f.body.trim().length > 0);
    const material = assets
      .filter((a) => a.kind !== "fact")
      .map((a) => ({
        kind: a.kind,
        title: a.title,
        description: a.description ?? null,
        // The sendable url (public bucket object or external link). null = nothing to send.
        url: assetPublicUrl(a.storage_path, a.url),
        sendOrder: a.send_order,
      }))
      .filter((m) => m.url !== null);
    return {
      companyFacts: facts,
      material,
      note:
        "Send material conversationally and spaced out — never dump everything at once. State only " +
        "facts from companyFacts; never invent services or prices. Money is always Indian Rupees (₹).",
    };
  },
};

// ── note_customer_interest — the ONE write; touches ONLY this lead's interests ──
const noteCustomerInterest: CustomerTool = {
  name: "note_customer_interest",
  description:
    "Record what this customer is interested in, so the human concierge who follows up knows where " +
    "they left off. Pass the service interests the customer expressed (e.g. 'wedding', 'villa', " +
    "'events'). Use this when the customer tells you what they're looking for. It updates only this " +
    "customer's own record — nothing else.",
  schema: z.object({
    interests: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      interests: {
        type: "array",
        items: { type: "string" },
        description: "The service interests the customer expressed",
      },
    },
    required: ["interests"],
    additionalProperties: false,
  },
  run: async (principal, input) => {
    const { interests } = input as { interests: string[] };
    // Drop unknown values against the lead's domain vocabulary (never reject — same
    // best-effort contract as ingestion); merge with any existing interests.
    const cleaned = interests.map((i) => sanitizeText(i)).filter((i) => i.length > 0);
    const resolved = extractServiceInterests(
      { service_interests: cleaned } as Record<string, unknown>,
      principal.domain,
    );
    if (resolved.length === 0) {
      return { done: false, note: "Nothing recognisable to record — keep the conversation going." };
    }

    const admin = createAdminClient();
    // Read → merge → write, scoped to THIS lead only (principal.leadId, never model-supplied).
    const { data: lead } = await admin
      .from("leads")
      .select("service_interests")
      .eq("id", principal.leadId)
      .single();
    const existing: string[] = Array.isArray(lead?.service_interests)
      ? (lead!.service_interests as string[])
      : [];
    const merged = Array.from(new Set([...existing, ...resolved]));
    // Error-checked: if the write fails (transient), don't tell the model it was recorded —
    // the human agent must not be shown an interest that never persisted.
    const { error } = await admin
      .from("leads")
      .update({ service_interests: merged })
      .eq("id", principal.leadId);
    if (error) {
      console.error("[elaya-customer-tools] note_customer_interest write failed:", error.message);
      return { done: false, note: "Couldn't save that just now — keep the conversation going." };
    }

    return { done: true, recorded: resolved };
  },
};

const CUSTOMER_TOOLS: CustomerTool[] = [getCompanyMaterial, noteCustomerInterest];
const CUSTOMER_TOOL_MAP = new Map<string, CustomerTool>(CUSTOMER_TOOLS.map((t) => [t.name, t]));

/** Provider-neutral tool definitions for a customer principal (the whole fixed set). */
export function getCustomerToolDefinitions(): LlmToolDefinition[] {
  return CUSTOMER_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.jsonSchema,
  }));
}

export type CustomerToolExecution = { content: string; isError: boolean };

const TOOL_RESULT_MAX_CHARS = 12_000;

/**
 * Execute one customer tool — THE customer dispatch. A name outside CUSTOMER_TOOLSET is
 * refused (the Golden Rule's hard edge). Validation failures + thrown errors return a
 * model-facing message, never throw out of here. No PII gateway is needed: customer tools
 * return only company material + a write ack — never another person's contact data.
 */
export async function executeCustomerTool(
  principal: CustomerPrincipal,
  name: string,
  rawInput: Record<string, unknown>,
): Promise<CustomerToolExecution> {
  if (!CUSTOMER_TOOLSET.includes(name as ElayaCustomerToolName)) {
    return { content: `Tool '${name}' is not available.`, isError: true };
  }
  const tool = CUSTOMER_TOOL_MAP.get(name);
  if (!tool) return { content: `Tool '${name}' is not available.`, isError: true };

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      content: `Invalid input for '${name}': ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`,
      isError: true,
    };
  }

  try {
    const result = await tool.run(principal, parsed.data as Record<string, unknown>);
    let serialized = JSON.stringify(result);
    if (serialized.length > TOOL_RESULT_MAX_CHARS) {
      serialized = `${serialized.slice(0, TOOL_RESULT_MAX_CHARS)}…(truncated)`;
    }
    return { content: serialized, isError: false };
  } catch (e) {
    console.error(`[elaya-customer-tools] '${name}' failed:`, e instanceof Error ? e.message : e);
    return { content: `Tool '${name}' failed.`, isError: true };
  }
}
