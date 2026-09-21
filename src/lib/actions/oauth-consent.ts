'use server';

// The consent screen's two answers (docs/architecture/mcp-plan.md §5). Session-gated,
// Zod-first, then the OAuth server records the decision as this user and we send the browser
// back to the AI app. Same shape as loginAction: `{ error }` for the form, a redirect on success.

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireProfile } from './_auth';
import { answerOAuthConsent } from '@/lib/services/oauth-server-service';
import { formErrors } from '@/lib/validations/form-errors';

const consentSchema = z.object({
  authorizationId: z.string().trim().min(8).max(200),
  decision: z.enum(['approve', 'deny']),
});

export async function answerOAuthConsentAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const parsed = consentSchema.safeParse({
    authorizationId: formData.get('authorizationId'),
    decision: formData.get('decision'),
  });
  if (!parsed.success) return { error: formErrors.generic };

  const auth = await requireProfile();
  if (!auth.ok) return { error: formErrors.unauthorized };

  const result = await answerOAuthConsent(parsed.data.authorizationId, parsed.data.decision);
  if ('error' in result) {
    console.error('[oauth-consent-action] consent failed:', result.error);
    return { error: formErrors.generic };
  }
  redirect(result.redirectUrl);
}
