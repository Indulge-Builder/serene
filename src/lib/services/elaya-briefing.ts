// elaya-briefing.ts — THE daily briefing: Elaya tells the founders how the day stands, unasked.
//
// Twice a day (src/trigger/elaya-briefing.ts) the live pulse is turned into a short WhatsApp
// message for every active founder. Gated by the `daily_briefing_enabled` row in elaya_settings:
// OFF unless the row says exactly true, flipping it is the on/off, no deploy.
//
//   pulse (pulse-service) ─► words (routing tier via the Elaya provider, maskPii, NO tools;
//   fails OPEN to the plain text built here, so a model outage never costs the briefing)
//   ─► WhatsApp when the founder's 24 hour session window is open, and always an in-app
//   notification.
//
// WhatsApp only lets a business send free text inside 24 hours of the person's last message.
// Outside it a Meta-approved TEMPLATE is needed, which does not exist yet: until one does, a
// founder who has not messaged Elaya in a day gets the in-app notification only. Nothing is
// stored in the conversation: a reply like "tell me more" makes Elaya read the pulse again, live.
// No `server-only` import chain (it runs from Trigger.dev), which is why the window read lives here.

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLlmForJob } from "@/lib/elaya/registry";
import { maskPii } from "@/lib/elaya/pii";
import { getPiiMaskingDepth } from "@/lib/services/llm-providers-service";
import { getLivePulse, type LivePulse } from "@/lib/services/pulse-service";
import { sendElayaWhatsAppReply } from "@/lib/services/whatsapp-api";
import { createNotification } from "@/lib/services/notifications-service";
import { markdownToWhatsApp } from "@/lib/utils/whatsapp-format";
import { mapRows } from "@/lib/utils/rows";

const LOG = "[elaya-briefing]";
const WA_WINDOW_MS = 24 * 60 * 60_000;
export type BriefingSlot = "morning" | "evening";

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

/** The briefing with no model in it: every line is a number from the pulse. Also the model's fallback. */
export function plainBriefing(p: LivePulse, slot: BriefingSlot, firstName: string): string {
  const lines: string[] = [`${slot === "morning" ? "Good morning" : "Good evening"} ${firstName}. Here is where things stand.`];
  if (p.members) {
    lines.push(p.members.waiting_count
      ? `*Members waiting on us:* ${p.members.waiting_count}. ${p.members.waiting.slice(0, 3).map((w) => `${w.member ?? w.group} (${hm(w.waiting_minutes)})`).join(", ")}`
      : "*Members waiting on us:* none right now.");
  }
  if (p.sales) lines.push(`*Sales today:* ${p.sales.leads_new_today} new leads (${p.sales.leads_new_today_not_yet_contacted} untouched), ${p.sales.calls_today} calls, ${p.sales.deals_today} deals, ${inr(p.sales.revenue_today_inr)}.`);
  if (p.freshdesk) lines.push(`*Freshdesk:* ${p.freshdesk.open} open, ${p.freshdesk.created_today} in and ${p.freshdesk.resolved_today} resolved today, ${p.freshdesk.escalated_open} escalated.`);
  if (p.work) lines.push(`*Work:* ${p.work.tasks_overdue} overdue tasks, ${p.work.ticket_suggestions_open} ticket suggestions waiting.`);
  if (p.members) lines.push(`*Ahead:* ${p.members.member_occasions_next_7_days} member occasions in 7 days, ${p.members.renewals_next_14_days} renewals in 14.`);
  lines.push("Ask me about any of these.");
  return lines.join("\n");
}

const SYSTEM = `You are Elaya, the calm, precise presence inside Indulge's operating system. Write the founder's {slot} briefing for WhatsApp from the JSON pulse you are given.
Format (follow it exactly):
- Line 1: a one-line greeting with the founder's first name.
- Then 4 to 6 lines, each starting with a markdown bold label and a colon, in this order when the section exists: **Needs attention:** then **Sales today:** then **Freshdesk:** then **Work:** then **Ahead:**
- Last line: one short invitation to ask a follow-up. Nothing after it.
Rules:
- "Needs attention" names what a founder would act on first: members waiting (name them and how long; if waiting_count is 0 say nobody is waiting), leads that came in today and are not yet contacted, escalated Freshdesk tickets. Two or three items, no more.
- Every number comes from the JSON exactly, with the meaning its key says: leads_status_new_total is leads still in status "new" (never call them cold or idle), member_occasions_next_7_days is birthdays and occasions (not members), renewals_next_14_days is memberships ending.
- Never add, estimate, compare with a past you were not given, or guess a cause. A null section could not be read: leave it out.
- Tone: composed and factual, a luxury concierge's chief of staff. No alarm words ("piling up", "sitting idle"), no emojis, no exclamation marks.
- Money is Indian rupees with the ₹ sign and Indian digit grouping.`;

async function words(p: LivePulse, slot: BriefingSlot, firstName: string): Promise<string> {
  const fallback = plainBriefing(p, slot, firstName);
  try {
    const depth = await getPiiMaskingDepth();
    const llm = await resolveLlmForJob("routing");
    const r = await llm.adapter.complete({
      model: llm.model,
      maxTokens: Math.min(llm.maxTokens, 700),
      system: SYSTEM.replace("{slot}", slot),
      messages: [{ role: "user", content: `The founder's first name: ${firstName}\nThe pulse:\n${JSON.stringify(maskPii(p, depth))}` }],
    });
    const text = (r.text ?? "").trim();
    return text.length >= 80 ? markdownToWhatsApp(text) : fallback;
  } catch (e) {
    console.warn(`${LOG} model wording failed, sending the plain briefing:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

/** Did this person message Elaya on WhatsApp inside the last 24 hours? Only then may free text be sent. */
async function waWindowOpen(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("elaya_messages").select("created_at")
    .eq("sender_id", userId).eq("channel", "whatsapp").eq("role", "user")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const at = (data as { created_at: string } | null)?.created_at;
  return Boolean(at && Date.now() - new Date(at).getTime() < WA_WINDOW_MS);
}

export type BriefingOutcome = { user_id: string; name: string; whatsapp: "sent" | "failed" | "window_closed" | "no_phone"; in_app: boolean };

export async function runBriefingSweep(slot: BriefingSlot, opts: { dryRun?: boolean } = {}): Promise<{ text: string | null; outcomes: BriefingOutcome[] }> {
  const { data } = await createAdminClient().from("profiles").select("id, full_name, phone").eq("role", "founder").eq("is_active", true);
  const founders = mapRows<{ id: string; full_name: string; phone: string | null }, { id: string; full_name: string; phone: string | null }>(data, (x) => x);
  if (founders.length === 0) return { text: null, outcomes: [] };

  const pulse = await getLivePulse();
  const outcomes: BriefingOutcome[] = [];
  let sample: string | null = null;
  for (const f of founders) {
    const first = f.full_name.split(" ")[0] ?? f.full_name;
    const text = await words(pulse, slot, first);
    sample ??= text;
    if (opts.dryRun) { outcomes.push({ user_id: f.id, name: f.full_name, whatsapp: f.phone ? "window_closed" : "no_phone", in_app: false }); continue; }

    let whatsapp: BriefingOutcome["whatsapp"] = f.phone ? "window_closed" : "no_phone";
    if (f.phone && (await waWindowOpen(f.id))) whatsapp = (await sendElayaWhatsAppReply(f.phone, text, f.id)) ? "sent" : "failed";
    const { error } = await createNotification({
      recipient_id: f.id, type: "system", action_url: "/elaya",
      title: slot === "morning" ? "Elaya's morning briefing" : "Elaya's evening briefing",
      body: plainBriefing(pulse, slot, first).replace(/\*/g, "").split("\n").slice(1, 4).join(" "),
    });
    outcomes.push({ user_id: f.id, name: f.full_name, whatsapp, in_app: !error });
  }
  console.log(LOG, slot, JSON.stringify(outcomes.map((o) => ({ whatsapp: o.whatsapp, in_app: o.in_app }))));
  return { text: sample, outcomes };
}
