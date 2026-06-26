import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = Record<string, any>;

let _client: ReturnType<typeof createClient<AnyDB>> | null = null;

export function getSettokuClient() {
  if (!_client) {
    const url = process.env.SETTOKU_SUPABASE_URL;
    const key = process.env.SETTOKU_SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("Settoku Supabase env vars not set");
    _client = createClient<AnyDB>(url, key, { auth: { persistSession: false } });
  }
  return _client;
}
