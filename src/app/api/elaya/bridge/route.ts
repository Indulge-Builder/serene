// POST /api/elaya/bridge — the Python brain's WRITE bridge (service-to-service),
// plus the two vendor READ tools it runs here rather than porting (2026-09-12).
//
// Sanctioned P-02 exception (Decision Log 2026-08-30): the Python brain (Step 3)
// must never re-implement a mutation core ("NEVER re-implement a lead mutation
// outside a core"), so its write tools execute HERE — through the exact same
// write-registry run() paths, cores, gates, and elaya_actions ledger the Node
// brain uses. One mutation authority; the AI layer above is swappable.
//
// Trust model: service-to-service, authenticated by the shared BRAIN_API_SECRET
// (timing-safe compare, fail-closed when unset). The payload names a userId; the
// DATABASE decides what that user may do — the profile is re-fetched and the
// principal re-derived here on every call (A-01: never trust caller-supplied
// role/identity claims beyond the id itself).
//
// Ops:
//   definitions       → the write-tool definitions for this principal's role,
//                       plus the bridged READ tools (BRIDGED_READ_TOOL_NAMES —
//                       the vendor pair, whose ranker is the one ranking in the
//                       codebase and is never re-implemented). Node stays the
//                       single source of the model-facing schema — the Python
//                       brain fetches, never duplicates.
//   execute_tool      → run ONE write tool or bridged read tool through the
//                       shared dispatch (inline tools mutate + ledger
//                       `executed`; state-changing tools only record a proposal
//                       — enforced by the registry, not by this route; reads are
//                       PII-masked by the same seam)
//   execute_proposed  → run the resolver executor on a still-live proposal the
//                       Python brain has already verdict-checked (its resolver
//                       owns TTL/affirmation/H3b; execution stays here)

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveStaffPrincipal } from '@/lib/elaya/principal';
import type { Profile } from '@/lib/types';
import {
  BRIDGED_READ_TOOL_NAMES,
  executeTool,
  getToolDefinitionsForPrincipal,
} from '@/lib/elaya/tools/registry';
import { WRITE_TOOL_REGISTRY, executeProposedAction } from '@/lib/elaya/tools/write-registry';
import { getPiiMaskingDepth } from '@/lib/services/llm-providers-service';
import { readJsonBody, safeSecretCompare } from '@/lib/utils/webhook';
import type { ElayaActionRow, ElayaChannel } from '@/lib/types/elaya';

// Write tools run cores with awaited notifications (Gupshup/web-push) — give the
// lambda the same headroom a server-action mutation gets.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BridgeBody = {
  op?: 'definitions' | 'execute_tool' | 'execute_proposed';
  userId?: string;
  conversationId?: string;
  channel?: ElayaChannel;
  toolName?: string;
  input?: Record<string, unknown>;
  actionId?: string;
};

export async function POST(request: Request) {
  const secret = process.env.BRAIN_API_SECRET ?? '';
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Fail CLOSED: no configured secret = no access, ever.
  if (!secret || !token || !safeSecretCompare(token, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return NextResponse.json({ error: 'bad body' }, { status: 400 });
  const body = parsed.body as BridgeBody;

  if (!body.userId || !UUID_RE.test(body.userId)) {
    return NextResponse.json({ error: 'bad userId' }, { status: 400 });
  }

  // The id names an identity; the DB decides what it may do (the Golden Rule).
  // ADMIN client — this call is sessionless by construction (the parity rule:
  // a session-client read blanks here), and the bearer gate above is the
  // trust boundary.
  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', body.userId)
    .maybeSingle();
  const profile = profileRow as Profile | null;
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: 'unknown or inactive user' }, { status: 403 });
  }
  const principal = resolveStaffPrincipal(profile);

  try {
    if (body.op === 'definitions') {
      // The write subset + the bridged reads — the Python brain owns every
      // other read tool locally.
      const defs = getToolDefinitionsForPrincipal(principal).filter(
        (d) => WRITE_TOOL_REGISTRY.has(d.name) || BRIDGED_READ_TOOL_NAMES.has(d.name),
      );
      return NextResponse.json({ definitions: defs });
    }

    if (body.op === 'execute_tool') {
      const toolName = body.toolName;
      if (
        !toolName ||
        !(WRITE_TOOL_REGISTRY.has(toolName) || BRIDGED_READ_TOOL_NAMES.has(toolName))
      ) {
        return NextResponse.json({ error: 'not a bridged tool' }, { status: 400 });
      }
      if (!body.conversationId || !UUID_RE.test(body.conversationId)) {
        return NextResponse.json({ error: 'bad conversationId' }, { status: 400 });
      }
      const maskingDepth = await getPiiMaskingDepth();
      const execution = await executeTool(
        principal,
        toolName,
        body.input ?? {},
        maskingDepth,
        { conversationId: body.conversationId, channel: body.channel ?? 'in_app' },
      );
      return NextResponse.json({ content: execution.content });
    }

    if (body.op === 'execute_proposed') {
      if (!body.actionId || !UUID_RE.test(body.actionId)) {
        return NextResponse.json({ error: 'bad actionId' }, { status: 400 });
      }
      // Re-fetch the row HERE (never trust a caller-supplied payload) and require
      // it to be a still-live proposal belonging to this user.
      const supabase = createAdminClient();
      const { data: row } = await supabase
        .from('elaya_actions')
        .select('*')
        .eq('id', body.actionId)
        .eq('user_id', principal.userId)
        .eq('status', 'proposed')
        .maybeSingle();
      if (!row) {
        return NextResponse.json({ error: 'no live proposal' }, { status: 404 });
      }
      const outcome = await executeProposedAction(principal, row as ElayaActionRow);
      return NextResponse.json({ status: outcome.status, line: outcome.line });
    }

    return NextResponse.json({ error: 'unknown op' }, { status: 400 });
  } catch (e) {
    // D-05: log the failure shape, never tool inputs (they can carry lead text).
    console.error('[elaya-bridge]', body.op, 'failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'bridge op failed' }, { status: 500 });
  }
}
