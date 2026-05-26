// Admin client using the service-role key.
// Used ONLY for operations that require bypassing RLS —
// specifically, creating users via auth.admin.createUser().
// Never use this client for user-scoped reads or writes.
// Never expose this client to the browser.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}
