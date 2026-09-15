// freshdesk-api.ts — THE Freshdesk REST v2 client (server-only). The only file that talks
// to https://<domain>/api/v2. Auth is HTTP Basic with the API key as the username and "X"
// as the password. Every call runs against a FdBudget so a sync can never eat the whole
// 50-calls-a-minute allowance the member app shares (constants/freshdesk.ts).
//
// Never import this from a component. Never call it outside freshdesk-sync.ts and the
// two scripts in scripts/freshdesk/.

import { FD_PAGE_SIZE, FD_RATE_RESERVE, FD_RUN_MAX_CALLS } from "@/lib/constants/freshdesk";
import type {
  FdApiAgent,
  FdApiContact,
  FdApiConversation,
  FdApiGroup,
  FdApiSlaPolicy,
  FdApiTicket,
  FdApiTicketField,
} from "@/lib/types/freshdesk";

// ─── Config ──────────────────────────────────────────────────────────────────

function domain(): string {
  return (process.env.FRESHDESK_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
function apiKey(): string {
  return (process.env.FRESHDESK_API_KEY ?? "").trim();
}

export function isFreshdeskConfigured(): boolean {
  return domain().length > 0 && apiKey().length > 0;
}

export function freshdeskTicketUrl(ticketId: number): string {
  return `https://${domain()}/a/tickets/${ticketId}`;
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export class FdBudgetExhausted extends Error {
  constructor(message = "Freshdesk call budget exhausted for this run") {
    super(message);
    this.name = "FdBudgetExhausted";
  }
}

export class FdRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "FdRequestError";
  }
}

export type FdBudget = {
  maxCalls: number;
  reserve: number;
  calls: number;
  /** X-RateLimit-Remaining after the last call; null until the first call. */
  remaining: number | null;
};

export function createFdBudget(maxCalls = FD_RUN_MAX_CALLS, reserve = FD_RATE_RESERVE): FdBudget {
  return { maxCalls, reserve, calls: 0, remaining: null };
}

export function budgetHasRoom(b: FdBudget, needed = 1): boolean {
  if (b.calls + needed > b.maxCalls) return false;
  if (b.remaining != null && b.remaining - needed < b.reserve) return false;
  return true;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

type FdResponse<T> = { data: T; hasNext: boolean; status: number };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fdFetch<T>(
  path: string,
  budget: FdBudget,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<FdResponse<T>> {
  if (!isFreshdeskConfigured()) {
    throw new FdRequestError(0, path, "Freshdesk is not configured (FRESHDESK_DOMAIN / FRESHDESK_API_KEY)");
  }
  if (!budgetHasRoom(budget)) throw new FdBudgetExhausted();

  const url = `https://${domain()}/api/v2${path}`;
  const auth = Buffer.from(`${apiKey()}:X`, "utf8").toString("base64");

  for (let attempt = 0; attempt < 2; attempt++) {
    budget.calls += 1;
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body == null ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });

    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    if (Number.isFinite(remaining)) budget.remaining = Math.floor(remaining);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "0");
      budget.remaining = 0;
      // One short wait is worth it (the window is a minute); a long one is the next run's job.
      if (attempt === 0 && Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 20) {
        await sleep(retryAfter * 1000 + 250);
        continue;
      }
      throw new FdBudgetExhausted(`Freshdesk rate limited (retry after ${retryAfter}s)`);
    }

    if (res.status === 404) {
      return { data: null as unknown as T, hasNext: false, status: 404 };
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new FdRequestError(res.status, path, `Freshdesk ${res.status} on ${path}: ${text}`);
    }

    const link = res.headers.get("link") ?? "";
    const hasNext = /rel="next"/.test(link);
    const data = (res.status === 204 ? null : await res.json()) as T;
    return { data, hasNext, status: res.status };
  }
  throw new FdBudgetExhausted();
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export const FD_TICKET_INCLUDE = "stats,requester,description";

/**
 * One page of tickets updated since `since` (ISO), oldest update first. Freshdesk
 * returns only the last 30 days unless updated_since is given, so it always is.
 */
export async function listTicketsUpdatedSince(
  since: string,
  page: number,
  budget: FdBudget,
  include = FD_TICKET_INCLUDE,
): Promise<{ tickets: FdApiTicket[]; hasNext: boolean }> {
  const q = new URLSearchParams({
    updated_since: since,
    order_by: "updated_at",
    order_type: "asc",
    per_page: String(FD_PAGE_SIZE),
    page: String(page),
    include,
  });
  const res = await fdFetch<FdApiTicket[]>(`/tickets?${q.toString()}`, budget);
  return { tickets: Array.isArray(res.data) ? res.data : [], hasNext: res.hasNext };
}

/** One ticket, or null when Freshdesk no longer returns it (deleted / spam-purged). */
export async function getTicket(id: number, budget: FdBudget): Promise<FdApiTicket | null> {
  const res = await fdFetch<FdApiTicket | null>(`/tickets/${id}?include=${FD_TICKET_INCLUDE}`, budget);
  return res.status === 404 ? null : res.data;
}

/** Every conversation on a ticket (notes + replies), oldest first, paged until done. */
export async function listConversations(ticketId: number, budget: FdBudget): Promise<FdApiConversation[]> {
  const out: FdApiConversation[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fdFetch<FdApiConversation[] | null>(
      `/tickets/${ticketId}/conversations?per_page=${FD_PAGE_SIZE}&page=${page}`,
      budget,
    );
    if (res.status === 404 || !Array.isArray(res.data)) break;
    out.push(...res.data);
    if (!res.hasNext || res.data.length < FD_PAGE_SIZE) break;
  }
  return out;
}

// ─── Contacts / agents / groups / fields / SLA ───────────────────────────────

export async function listContactsUpdatedSince(
  since: string,
  page: number,
  budget: FdBudget,
): Promise<{ contacts: FdApiContact[]; hasNext: boolean }> {
  const q = new URLSearchParams({ _updated_since: since, per_page: String(FD_PAGE_SIZE), page: String(page) });
  const res = await fdFetch<FdApiContact[]>(`/contacts?${q.toString()}`, budget);
  return { contacts: Array.isArray(res.data) ? res.data : [], hasNext: res.hasNext };
}

export async function getContact(id: number, budget: FdBudget): Promise<FdApiContact | null> {
  const res = await fdFetch<FdApiContact | null>(`/contacts/${id}`, budget);
  return res.status === 404 ? null : res.data;
}

export async function listAgents(budget: FdBudget): Promise<FdApiAgent[]> {
  const out: FdApiAgent[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fdFetch<FdApiAgent[]>(`/agents?per_page=${FD_PAGE_SIZE}&page=${page}`, budget);
    if (!Array.isArray(res.data)) break;
    out.push(...res.data);
    if (!res.hasNext || res.data.length < FD_PAGE_SIZE) break;
  }
  return out;
}

export async function listGroups(budget: FdBudget): Promise<FdApiGroup[]> {
  const res = await fdFetch<FdApiGroup[]>(`/groups?per_page=${FD_PAGE_SIZE}`, budget);
  return Array.isArray(res.data) ? res.data : [];
}

/** The field list. Choices are NOT included here; fetch them per field (getTicketField). */
export async function listTicketFields(budget: FdBudget): Promise<FdApiTicketField[]> {
  const res = await fdFetch<FdApiTicketField[]>(`/admin/ticket_fields`, budget);
  return Array.isArray(res.data) ? res.data : [];
}

export async function getTicketField(id: number, budget: FdBudget): Promise<FdApiTicketField | null> {
  const res = await fdFetch<FdApiTicketField | null>(`/admin/ticket_fields/${id}`, budget);
  return res.status === 404 ? null : res.data;
}

export async function listSlaPolicies(budget: FdBudget): Promise<FdApiSlaPolicy[]> {
  const res = await fdFetch<FdApiSlaPolicy[]>(`/sla_policies`, budget);
  return Array.isArray(res.data) ? res.data : [];
}

// ─── Automations (the webhook registration) ──────────────────────────────────

/** Freshdesk automation types: 1 = ticket creation, 3 = time triggers, 4 = ticket updates. */
export type FdAutomationType = 1 | 3 | 4;

export type FdAutomationRule = {
  id?: number;
  name: string;
  active?: boolean;
  [key: string]: unknown;
};

export async function listAutomationRules(type: FdAutomationType, budget: FdBudget): Promise<FdAutomationRule[]> {
  const res = await fdFetch<FdAutomationRule[]>(`/automations/${type}/rules`, budget);
  return Array.isArray(res.data) ? res.data : [];
}

export async function createAutomationRule(
  type: FdAutomationType,
  rule: FdAutomationRule,
  budget: FdBudget,
): Promise<FdAutomationRule> {
  const res = await fdFetch<FdAutomationRule>(`/automations/${type}/rules`, budget, { method: "POST", body: rule });
  return res.data;
}
