// Elaya row types — hand-declared until `supabase gen types typescript` is re-run
// after migration 0116 is applied (the generated Database type does not know the
// elaya_* / llm_providers / user_context tables yet). Shapes mirror the migration
// exactly. Types only — no runtime values.

export type ElayaChannel = 'in_app' | 'whatsapp';
export type ElayaMessageRole = 'user' | 'assistant' | 'tool';

export type ElayaConversation = {
  id: string;
  user_id: string;
  channel: ElayaChannel;
  title: string | null;
  last_message_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ElayaMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  role: ElayaMessageRole;
  channel: ElayaChannel;
  content: string;
  tool_calls: ElayaToolCallRecord[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

/** Normalized tool-call record persisted on assistant message rows (audit trail). */
export type ElayaToolCallRecord = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ElayaActionStatus = 'proposed' | 'approved' | 'dismissed' | 'executed' | 'failed';

export type ElayaActionRow = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  user_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: ElayaActionStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type LlmJobType = 'routing' | 'reasoning';
export type LlmProviderName = 'anthropic' | 'google' | 'openai';

export type LlmProviderRow = {
  job_type: LlmJobType;
  provider: LlmProviderName;
  model: string;
  max_tokens: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserContextRow = {
  user_id: string;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
