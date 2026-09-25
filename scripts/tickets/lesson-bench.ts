// scripts/tickets/lesson-bench.ts — THE lesson writer's bench (0240): asks the model with a few
// hand-made verdicts and prints the document it would write. Nothing is written to
// sia.intake_lessons (dryRun); the run row in sia.extraction_runs says dry_run. About one rupee.
//
//   pnpm tsx scripts/tickets/lesson-bench.ts [intake|ticket_creator|sentinel]
import { writeLessonDraft } from "@/lib/services/intake-lessons";
import type { DraftReview, LessonKind } from "@/lib/types/intake";

const kind = (process.argv[2] as LessonKind) || "ticket_creator";
const at = new Date().toISOString();
const base = { member_id: null, queendom_id: null, proposal_id: null, ticket_id: null, run_id: null, prompt_version: "ticket-draft-v3", final: null, dismiss_reason: null, feedback: null, decided_by: null, decided_at: at };
const reviews: DraftReview[] = [
  { ...base, id: "r1", source: "intake_card", decision: "edited", draft: { category: "travel", title: "Flight to Goa", priority: "medium", brief: { pax: "2" } }, final: { category: "travel", sub_category: "flights", title: "Two business-class seats BOM to GOI on 3 Oct", priority: "high", brief: { pax: "2", from_location: "BOM", to_location: "GOI", date: "2026-10-03" } }, corrections: [{ field: "sub_category", from: null, to: "flights" }, { field: "title", from: "Flight to Goa", to: "Two business-class seats BOM to GOI on 3 Oct" }, { field: "priority", from: "medium", to: "high" }, { field: "brief.from_location", from: null, to: "BOM" }, { field: "brief.to_location", from: null, to: "GOI" }, { field: "brief.date", from: null, to: "2026-10-03" }], feedback: "the dates and airports were in the chat, always put them in" },
  { ...base, id: "r2", source: "intake_card", decision: "edited", draft: { category: "dining", title: "Dinner booking", priority: "medium", brief: { pax: "4" } }, final: { category: "dining", title: "Table for 4 at Wasabi, Taj Colaba, Saturday 8 pm", priority: "medium", brief: { pax: "4", date: "2026-09-27", time: "20:00", notes: "window table, one vegetarian" } }, corrections: [{ field: "title", from: "Dinner booking", to: "Table for 4 at Wasabi, Taj Colaba, Saturday 8 pm" }, { field: "brief.date", from: null, to: "2026-09-27" }, { field: "brief.time", from: null, to: "20:00" }, { field: "brief.notes", from: null, to: "window table, one vegetarian" }], feedback: null },
  { ...base, id: "r3", source: "ticket_creator", decision: "accepted", draft: { category: "gifting", title: "Birthday hamper for MEMBER_2's mother, deliver Friday", priority: "high", brief: { delivery_address: "home", date: "2026-09-26" } }, final: { category: "gifting", title: "Birthday hamper for MEMBER_2's mother, deliver Friday", priority: "high", brief: { delivery_address: "home", date: "2026-09-26" } }, corrections: [] },
  { ...base, id: "r4", source: "intake_card", decision: "edited", draft: { category: "special_request", title: "Help with visa", priority: "low", brief: {} }, final: { category: "travel", sub_category: "visa", title: "Schengen visa appointment, travel 15 Oct", priority: "urgent", brief: { date: "2026-10-15", notes: "passport expires 2027" } }, corrections: [{ field: "category", from: "special_request", to: "travel" }, { field: "sub_category", from: null, to: "visa" }, { field: "title", from: "Help with visa", to: "Schengen visa appointment, travel 15 Oct" }, { field: "priority", from: "low", to: "urgent" }], feedback: "visa is travel, and with travel in 3 weeks it is urgent" },
];
(async () => {
  const t = Date.now();
  const r = await writeLessonDraft(kind, { force: true, dryRun: true, reviewsOverride: reviews });
  console.log("status:", r.status, "in", Math.round((Date.now() - t) / 1000), "s");
  if (r.status === "written") { console.log("\nSUMMARY:", r.lesson.summary, "\n\nBODY:\n", r.lesson.body); } else console.log(r);
})();
