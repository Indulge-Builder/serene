// Ticket intake (0219): the card a bishop sees, and the numbers that say how intake is doing.
import type { TicketDraft } from "@/lib/types/ticket";
import type { IntakeDismissReason } from "@/lib/constants/ticket-intake";

export type IntakeProposalMessage = { chat_jid: string; wa_message_id: string; sender_jid: string; sender_name: string | null; from_member: boolean; at: string; text: string };

export type IntakeProposal = {
  id: string;
  member_id: string;
  member_name: string;
  queendom_id: string | null;
  group_jid: string;
  kind: "request" | "update";
  status: "open" | "accepted" | "dismissed" | "expired";
  confidence: number;
  tone: string | null;
  summary: string;
  draft: Partial<TicketDraft>;
  messages: IntakeProposalMessage[];
  first_message_at: string;
  last_message_at: string;
  ticket_id: string | null;
  ticket_no: string | null;
  created_at: string;
};

export type IntakeStats = {
  days: number;
  bursts_read: number;
  by_kind: Record<string, number>;
  proposed: number;
  open: number;
  accepted: number;
  accepted_untouched: number;
  dismissed: number;
  dismissed_by_reason: Partial<Record<IntakeDismissReason, number>>;
  expired: number;
  /** Of the request cards, how many had a Freshdesk ticket for the same member within two hours: the free exam. */
  freshdesk_agreed: number;
  freshdesk_checked: number;
  /** Health signals written from the chat (complaint / praise / frustrated tone), by signal. */
  health_by_signal: Record<string, number>;
  cost_usd: number;
};
