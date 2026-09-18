// ticket-creator.ts — the New ticket form's way into THE drafting core (member-ticket-plan.md
// 7.8, phase 1): a genie selected the messages, the core drafts the ticket. Everything that
// matters (the prompt, the vault, the checks, the run row, failing closed) lives in
// ticket-draft-core.ts and is shared with the intake sweep, so the two can never drift (R-01).

import "server-only";
import { draftTicketCore } from "@/lib/services/ticket-draft-core";
import type { DraftTicketInput } from "@/lib/validations/ticket-schema";
import type { TicketDraft } from "@/lib/types/ticket";

export async function draftTicketFromMessages(input: DraftTicketInput): Promise<TicketDraft | null> {
  if (!input.group_jid) return null; // the vault is per group; a selection always comes from one
  return draftTicketCore({
    member_id: input.member_id,
    group_jid: input.group_jid,
    via: "selection",
    messages: input.messages.map((m) => ({ wa_message_id: m.wa_message_id, sender_jid: m.sender_jid, at: m.at, text: m.text })),
  });
}
