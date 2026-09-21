// /oauth/consent — THE consent screen of Serene's OAuth server (docs/architecture/mcp-plan.md §5).
//
// Supabase Auth sends the person's browser here with ?authorization_id=… when an AI app asks to
// connect. Not signed in → the login page, with this exact URL as the return path. Already
// consented to this app → straight back to it. Otherwise the person sees who is asking and
// answers Allow or Deny (answerOAuthConsentAction).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import { getOAuthConsentRequest } from '@/lib/services/oauth-server-service';
import { OAUTH_CONSENT_PATH } from '@/lib/constants/mcp';
import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Connect an app — Serene' };

const ID_RE = /^[A-Za-z0-9._~-]{8,200}$/;

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.authorization_id) ? params.authorization_id[0] : params.authorization_id;
  const authorizationId = raw && ID_RE.test(raw) ? raw : null;

  if (!authorizationId) {
    return <ConsentForm state={{ kind: 'error', message: 'This connection link is not valid. Start again from the app you are connecting.' }} />;
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    const next = `${OAUTH_CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const lookup = await getOAuthConsentRequest(authorizationId);
  if (lookup.kind === 'redirect') redirect(lookup.url);
  if (lookup.kind === 'error') {
    return <ConsentForm state={{ kind: 'error', message: 'This connection request has expired or was already answered. Start again from the app you are connecting.' }} />;
  }

  return <ConsentForm state={{ kind: 'consent', request: lookup.request, fullName: profile.full_name }} />;
}
