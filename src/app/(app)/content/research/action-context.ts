// What every Research server action starts from, and how a failure becomes a sentence the student
// can act on.
//
// A server action is its own entry point: it does not pass through the page, so it cannot assume
// anything the page checked. Each one therefore starts here. The workspace id only ever comes from
// the signed-in session, never from the browser, and an action refuses outright when there is no
// active workspace.
//
// Research writes with the service-role key because members can read the research tables and never
// write them. Reads the member is allowed to make still go through their own client. Either way,
// every query spells out agency_id.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext } from "@/lib/auth";
import { ResearchUserError } from "@/lib/research/errors";
import { DailyQuotaSpent } from "@/lib/research/llm";
import { researchServiceClient } from "@/lib/research/service-client";

export type Fail = { ok: false; error: string };

export interface ActionContext {
  agencyId: string;
  userId: string;
  /** The service-role client, for scan state, AI answers and storage. */
  sb: SupabaseClient;
  /** The member's own client, for reads they are allowed to make. */
  member: SupabaseClient;
}

export const SOMETHING_BROKE = "Something went wrong on our side. Try again in a minute.";
export const FREE_ALLOWANCE_SPENT = "Today's free AI allowance is used up, so this could not run. It resets tomorrow.";
export const NO_SERVICE_KEY =
  "Research is not set up on this dashboard yet. Add SUPABASE_SERVICE_ROLE_KEY to your environment and restart it.";

/** The context an action works in, or the reason it cannot run. */
export async function researchContext(): Promise<ActionContext | Fail> {
  const { supabase, user, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "Open a workspace first." };
  const sb = researchServiceClient();
  if (!sb) return { ok: false, error: NO_SERVICE_KEY };
  return { agencyId, userId: user.id, sb, member: supabase as unknown as SupabaseClient };
}

export function isFail(ctx: ActionContext | Fail): ctx is Fail {
  return (ctx as Fail).ok === false;
}

/** A caught failure as the student should see it: a message written for them shown as it is, a
    spent free allowance said in plain words, and anything else logged in full on the server and
    replaced with one generic line. */
export function actionFailure(e: unknown, action: string, agencyId: string): Fail {
  if (e instanceof ResearchUserError) return { ok: false, error: e.message };
  if (e instanceof DailyQuotaSpent) {
    console.warn(`[research] ${action} for ${agencyId}: the free allowance is spent (${e.providerName}): ${e.message}`);
    return { ok: false, error: FREE_ALLOWANCE_SPENT };
  }
  console.error(`[research] ${action} failed for ${agencyId}:`, e);
  return { ok: false, error: SOMETHING_BROKE };
}
