// The service-role Supabase client Research writes with.
//
// Members can read the research tables and never write them, so every write (a scan's state, a
// saved breakdown, a stored cover image) runs through this client on the server. It carries no
// user session, so it is never handed to a browser and every query it makes still spells out the
// workspace id it is for.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Null when the dashboard has no service-role key set, which is a setup problem, not a crash. */
export function researchServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
