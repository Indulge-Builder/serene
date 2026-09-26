// auth.ts — bearer token → verified Serene person → Elaya principal. SERVER ONLY.
//
// The Supabase OAuth server issues ordinary Supabase user JWTs (plus a `client_id` claim
// naming the AI app). Verification is the same call every session path makes,
// auth.getUser(token), on the admin client because there is no cookie here. Authorization is
// then read from public.profiles (Rule 09), never from the token, and the principal is the same
// object the in-app and WhatsApp brains use, so the connector is Elaya's third channel by
// construction (the channel-parity rule in src/lib/elaya/CLAUDE.md).

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveStaffPrincipal, type StaffPrincipal } from '@/lib/elaya/principal';
import { getMcpAudience } from '@/lib/services/llm-providers-service';
import { hasElayaAccess } from '@/lib/utils/route-access';
import type { Profile } from '@/lib/types';

export type McpIdentity = {
  principal: StaffPrincipal;
  /** The OAuth client (the AI app) the token was issued to, from the JWT's client_id claim. */
  clientId: string | null;
  /** False when the person is real but their role is outside the audience (the `mcp_audience`
   *  settings row, 0233): the server then answers with zero tools and a sentence, instead of a 401
   *  that would loop the login. */
  allowed: boolean;
};

/** The client_id claim, read from an already-verified JWT's payload. Never used for authorization. */
function readClientId(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const claims = JSON.parse(json) as { client_id?: unknown };
    return typeof claims.client_id === 'string' ? claims.client_id : null;
  } catch {
    return null;
  }
}

/** Verify a bearer token and resolve the person behind it. Null = not a valid, active Serene user. */
export async function verifyMcpBearer(token: string): Promise<McpIdentity | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const [{ data: row }, audience] = await Promise.all([
    admin.from('profiles').select('*').eq('id', data.user.id).maybeSingle(),
    getMcpAudience(),
  ]);
  const profile = row as Profile | null;
  if (!profile || !profile.is_active) return null;

  return {
    principal: resolveStaffPrincipal(profile),
    clientId: readClientId(token),
    // The role must be in the audience AND the person's team must have Elaya at all (ELAYA_DOMAINS).
    allowed: audience.includes(profile.role) && hasElayaAccess(profile),
  };
}
