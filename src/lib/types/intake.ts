// Ticket intake (0219): the card a bishop sees, and the numbers that say how intake is doing.
import type { TicketDraft } from "@/lib/types/ticket";
import type { DRAFT_REVIEW_DECISIONS, DRAFT_REVIEW_SOURCES, IntakeDismissReason, LESSON_KINDS, LESSON_STATUSES } from "@/lib/constants/ticket-intake";
import type { DraftCorrection } from "@/lib/utils/draft-diff";

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
  /** The model call that drafted the ticket (sia.extraction_runs); the ledger keeps it. */
  draft_run_id: string | null;
  created_at: string;
};

/** One human verdict on a machine draft (0239, sia.draft_reviews). */
export type DraftReviewSource = (typeof DRAFT_REVIEW_SOURCES)[number];
export type DraftReviewDecision = (typeof DRAFT_REVIEW_DECISIONS)[number];
export type DraftReview = {
  id: string;
  source: DraftReviewSource;
  decision: DraftReviewDecision;
  member_id: string | null;
  queendom_id: string | null;
  proposal_id: string | null;
  ticket_id: string | null;
  run_id: string | null;
  prompt_version: string | null;
  draft: Record<string, unknown>;
  final: Record<string, unknown> | null;
  corrections: DraftCorrection[];
  dismiss_reason: string | null;
  feedback: string | null;
  decided_by: string | null;
  decided_at: string;
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

/** A lesson (0240, sia.intake_lessons): one versioned instruction document per kind of work. */
export type LessonKind = (typeof LESSON_KINDS)[number];
export type LessonStatus = (typeof LESSON_STATUSES)[number];
export type IntakeLesson = {
  id: string;
  kind: LessonKind;
  version: number;
  status: LessonStatus;
  body: string;
  summary: string;
  evidence: Record<string, unknown>;
  run_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of sia.draft_review_scoreboard: the verdicts by source and prompt version. */
export type DraftReviewScoreboardRow = { source: DraftReviewSource; prompt_version: string; decided: number; accepted: number; edited: number; dismissed: number; with_feedback: number };
