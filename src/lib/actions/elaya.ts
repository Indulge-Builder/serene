'use server';

import { requireProfile } from '@/lib/actions/_auth';
import { resolveElayaChatSeed, type ElayaChatSeed } from '@/lib/services/elaya-service';
import { formErrors } from '@/lib/validations/form-errors';
import type { ActionResult } from '@/lib/types';

// ─────────────────────────────────────────────────────────
// getElayaChatSeedAction
// THE client entry for seeding ElayaChatShell from a 'use client' context
// (the floating Elaya widget). A client widget cannot call elaya-service
// directly (it pulls next/headers into the client bundle — A-15), so the
// seeding crosses a server boundary here. Returns the EXACT same seed the
// /elaya RSC page resolves (both go through resolveElayaChatSeed — R-01), so
// the widget continues the user's single active conversation, not a fork.
//
// No Zod: it takes no user input — identity is read from the verified profile,
// never the client (the 24h session + cap are still server-enforced).
// ─────────────────────────────────────────────────────────
export async function getElayaChatSeedAction(): Promise<ActionResult<ElayaChatSeed>> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;

  try {
    const seed = await resolveElayaChatSeed(auth.profile);
    return { data: seed, error: null };
  } catch (err) {
    console.error('[elaya-action] seed resolve failed:', err);
    return { data: null, error: formErrors.elayaUnavailable };
  }
}
