import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Returns the singleton browser Supabase client.
 * Calling this function twice returns the same object reference.
 * One WebSocket connection, one channel registry, zero extra memory footprint.
 *
 * Rule 05: One Supabase client per context. Never instantiate elsewhere.
 */
export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}

/**
 * Test-only escape hatch. Resets the singleton so tests run in isolation.
 * Never call this in application code.
 */
export function _resetClientForTests(): void {
  if (process.env.NODE_ENV === "test") {
    _client = null;
  }
}
