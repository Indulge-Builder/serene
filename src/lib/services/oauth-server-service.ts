// oauth-server-service.ts — THE Supabase OAuth server reads and writes for the signed-in user.
//
// Serene is the consent screen of its own OAuth server (Authentication → OAuth Server →
// Authorization path = /oauth/consent). When an AI app asks to connect, Supabase sends the
// person's browser here with an authorization_id; these functions read what is being asked,
// record the answer, and later list or revoke the apps the person connected. Everything runs on
// the SESSION client: the OAuth server decides as the logged-in user, never as the service role.

import { createClient } from '@/lib/supabase/server';

export type OAuthConsentRequest = {
  authorizationId: string;
  client: { id: string; name: string; uri: string; logoUri: string };
  redirectUri: string;
  scope: string;
  userEmail: string;
};

export type OAuthConsentLookup =
  | { kind: 'consent'; request: OAuthConsentRequest }
  | { kind: 'redirect'; url: string }
  | { kind: 'error'; message: string };

/** What the AI app is asking for, or a redirect when the person already consented to it. */
export async function getOAuthConsentRequest(authorizationId: string): Promise<OAuthConsentLookup> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return { kind: 'error', message: error?.message ?? 'authorization not found' };
  if ('redirect_url' in data) return { kind: 'redirect', url: data.redirect_url };
  return {
    kind: 'consent',
    request: {
      authorizationId: data.authorization_id,
      client: {
        id: data.client.id,
        name: data.client.name,
        uri: data.client.uri,
        logoUri: data.client.logo_uri,
      },
      redirectUri: data.redirect_uri,
      scope: data.scope,
      userEmail: data.user.email,
    },
  };
}

/** Record the answer. Returns the URL that sends the browser back to the AI app. */
export async function answerOAuthConsent(
  authorizationId: string,
  decision: 'approve' | 'deny',
): Promise<{ redirectUrl: string } | { error: string }> {
  const supabase = await createClient();
  const opts = { skipBrowserRedirect: true };
  const { data, error } =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, opts)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, opts);
  if (error || !data?.redirect_url) return { error: error?.message ?? 'consent failed' };
  return { redirectUrl: data.redirect_url };
}

export type ConnectedApp = {
  clientId: string;
  name: string;
  uri: string;
  scopes: string[];
  grantedAt: string;
};

/** The AI apps this person has connected. Empty (never an error) when the OAuth server is off. */
export async function listConnectedApps(): Promise<ConnectedApp[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error || !data) return [];
  return data.map((g) => ({
    clientId: g.client.id,
    name: g.client.name,
    uri: g.client.uri,
    scopes: g.scopes ?? [],
    grantedAt: g.granted_at,
  }));
}

/** Disconnect one app: every token it holds for this person stops working at once. */
export async function revokeConnectedApp(clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  return { error: error?.message ?? null };
}
