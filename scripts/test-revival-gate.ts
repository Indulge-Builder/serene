/**
 * Lead-revival gate calibration eval — the REGRESSION CHECK for the three-verdict
 * change. Runs a hardcoded set of example lead-notes through the REAL gate + REAL
 * LLM (no model mock): it calls `judgeNotesForRevival` from
 * src/lib/services/revival-gate.ts — the exact prompt + masking + routing-tier
 * `complete()` + parser the nightly sweep uses. The only thing it skips is the DB
 * note-read (notes are hardcoded here) and the DB masking-depth lookup (passed
 * 'light', the seeded production default).
 *
 * Goal: eyeball whether the gate SEPARATES the piles — confident junk → dismiss,
 * genuine warm-but-stalled → unsure, explicit future intent → revive — before
 * trusting it in production.
 *
 * Run:
 *   mkdir -p /tmp/eval_shim
 *   printf 'export {};\n' > /tmp/eval_shim/server-only.ts
 *   printf '{\n  "extends": "%s/tsconfig.json",\n  "compilerOptions": { "paths": { "@/*": ["%s/src/*"], "server-only": ["/tmp/eval_shim/server-only.ts"] } }\n}\n' "$PWD" "$PWD" > /tmp/eval_shim/tsconfig.json
 *   npx tsx --env-file=.env.local --tsconfig /tmp/eval_shim/tsconfig.json scripts/test-revival-gate.ts
 *
 * (The `server-only` shim is only needed because revival-gate.ts carries the
 * `import "server-only"` guard, which has no Node resolution outside Next.js. The
 * shim does not change the gate — it just lets the module load in a plain script.)
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (to
 * read which model the 'routing' job maps to) and ANTHROPIC_API_KEY (the gate call).
 */

import {
  judgeNotesForRevival,
  buildRevivalNotesBlob,
} from "@/lib/services/revival-gate";
import type { RevivalTriggerStatus } from "@/lib/constants/revival";
import type { RevivalVerdict } from "@/lib/types/revival";

// The silence status the gate is told the lead is in. The example notes read like
// touched/in-discussion leads; 'touched' is a representative trigger for the eval.
const TRIGGER_STATUS: RevivalTriggerStatus = "touched";

type TestLead = { label: string; notes: string[] };

// ── 12 calibration leads (real anonymised note shapes) ────────────────────────
const testLeads: TestLead[] = [
  {
    label: "Repeat NR, no conversation ever",
    notes: [
      "sent messages, will try calling again",
      "sent messages, will try calling again",
      "NR, msg sent",
    ],
    // expected: DISMISS — pure unreachable, no real engagement
  },
  {
    label: "School teacher, doesn't recall ad",
    notes: [
      "Said he is a school teacher, doesnt recall clicking any ads",
    ],
    // expected: DISMISS — disqualified, no intent
  },
  {
    label: "Own network, doesn't need us",
    notes: [
      "He was just curious about us, saw an ad on insta, went through the deets, doesnt need our services, he himself has a good network that gets things and services sorted for him",
    ],
    // expected: DISMISS — explicitly disqualified
  },
  {
    label: "Kartik — wife expecting, adventure sports, then on hold",
    notes: [
      "Never heard about the concept of concierge, said he hardly travels in a year max once or twice and now he has stopped as his wife is expecting, will think about it and discuss with his wife, is into Sky diving, bungee jumping, adventure sports, asked to check with him on Fri",
      "Asked to speak in the afternoon",
      "Called him as requested, said he was busy still",
      "NR, msg sent",
      "He said he has kept the membership on hold, not sure when he'll take it up",
    ],
    // expected: UNSURE — warm-but-stalled, must NOT be auto-dismissed
  },
  {
    label: "Betul MP, affordability-dead",
    notes: [
      "he is from betul and interior district in MP, He was curious as he found the ad attractive, spoke in hindi only, said 4L is not an affordable membership for him, once he is rich he'll think about it",
    ],
    // expected: DISMISS — affordability-dead (soft "when rich" caveat is not real intent)
  },
  {
    label: "Call not connecting, details sent",
    notes: [
      "Call not getting connected. Details sent",
    ],
    // expected: UNSURE — too little info, no conversation yet
  },
  {
    label: "Vivek — astrology seminars, will get back",
    notes: [
      "vivek, Said he will take a look and get back to me. Delhi, does seminars on astrology.",
    ],
    // expected: UNSURE — engaged but vague
  },
  {
    label: "Ratlam — chemical plant, onboard in 3-4 months",
    notes: [
      "Ratlam, has a manf plant for chemicals, very busy with the setup currently, wants to come onboard in the next 3-4 months.",
    ],
    // expected: REVIVE — explicit future intent with window (the revive bar must hold)
  },
  {
    label: "Girijatmak — disconnected, will reach out when ready",
    notes: [
      "Disconnected the call, sent details.",
      "No response, HOB sent",
      "Said he will reach out when he's ready",
    ],
    // expected: UNSURE — soft signal, no real conversation
  },
  {
    label: "Nitika — incoming calls barred",
    notes: [
      "Sent msg to Call later",
      "Incoming Calls Barred",
      "No Incoming calls can be Received. Sent Day 6 msg",
    ],
    // expected: DISMISS — unreachable wall, no engagement
  },
  {
    label: "Richa — NR, sent video + brochure",
    notes: [
      "Sent msg to call later. Disappearing msg set up",
      "NR. Sent msg, video and Brochure and asked to connect",
    ],
    // expected: UNSURE — effort made, no response yet
  },
  {
    label: "Sayan — MBA student, only wanted details",
    notes: [
      "NR. Sent msg to connect",
      "MBA Student. Only wanted details. Sharing details but not a Prospect",
    ],
    // expected: DISMISS — explicitly not a prospect
  },
];
// ──────────────────────────────────────────────────────────────────────────────

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.map((l, i) => (i === 0 ? l : indent + l)).join("\n");
}

const VERDICT_TAG: Record<RevivalVerdict, string> = {
  revive: "REVIVE ",
  dismiss: "DISMISS",
  unsure: "unsure ",
};

async function main() {
  console.log(`\nRevival gate eval — ${testLeads.length} leads · trigger="${TRIGGER_STATUS}" · real routing model · masking=light\n`);
  console.log("═".repeat(100));

  const tally: Record<RevivalVerdict, number> = { revive: 0, unsure: 0, dismiss: 0 };

  for (let i = 0; i < testLeads.length; i++) {
    const lead = testLeads[i]!;
    const blob = buildRevivalNotesBlob(
      // Newest-first to mirror getLeadNotesFull's ordering; the arrays read
      // oldest→newest, so reverse to feed the gate the same way production does.
      [...lead.notes].reverse().map((content) => ({ content, created_at: null })),
    );

    // Real gate + real LLM. Sequential so we don't trip routing-tier rate limits.
    const v = await judgeNotesForRevival(blob, TRIGGER_STATUS, "light");
    tally[v.verdict] += 1;

    const num = String(i + 1).padStart(2, " ");
    console.log(`\n${num}. ${lead.label}`);
    console.log(`    verdict   : ${VERDICT_TAG[v.verdict]}${v.suggestedReviveAt ? `  (suggested ${v.suggestedReviveAt.slice(0, 10)})` : ""}`);
    console.log(`    reasoning : ${wrap(v.reasoning, 84, "                ")}`);
    console.log(`    notes     : ${wrap(lead.notes.join("  |  "), 84, "                ")}`);
  }

  console.log("\n" + "═".repeat(100));
  console.log(`\nDistribution:  revive=${tally.revive}   unsure=${tally.unsure}   dismiss=${tally.dismiss}   (of ${testLeads.length})`);
  console.log("\nMapping: revive → auto-task · unsure → review tab · dismiss → status='dismissed' (audit log, never surfaced).\n");
}

main().catch((e) => {
  console.error("\nEval failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
