// Admin client using the service-role key.
// Used ONLY for operations that require bypassing RLS —
// specifically, creating users via auth.admin.createUser().
// Never use this client for user-scoped reads or writes.
// Never expose this client to the browser.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClientOptions } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type RealtimeOptions = NonNullable<SupabaseClientOptions<"public">["realtime"]>;

// supabase-js constructs a RealtimeClient eagerly in its constructor, which needs
// a WebSocket. On Node < 22 (e.g. the Trigger.dev worker, runtime "node" → Node 21)
// there is no native global WebSocket, so realtime-js throws at construction time
// even though this admin client never uses realtime. Provide the "ws" package as the
// realtime transport ONLY when no native WebSocket exists — a no-op on Node 22+ and
// in the Next.js server runtime, where globalThis.WebSocket is present.
function realtimeTransport(): RealtimeOptions | undefined {
  if (typeof globalThis.WebSocket !== "undefined") return undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require("ws");
  return { transport: ws.default ?? ws };
}

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
    realtime: realtimeTransport(),
  });
}
