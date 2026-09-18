// Where Apify calls back when an Instagram read finishes.
//
// The address it calls carries a one-time token that only ever existed for this one scan, and the
// database holds nothing but that token's fingerprint. A caller whose token does not match gets a
// plain 404 with no detail, so nothing here says whether the scan exists.
//
// What the caller sends in the body is ignored completely. The scan is read back from Apify with
// this dashboard's own token, so a made-up body cannot put anything into the database.
//
// This only runs once RESEARCH_PUBLIC_URL is set to the address this dashboard is deployed at.
// Without it there is nowhere public to call, the scan carries no callback, and the Research page
// collects the result itself while it is open.

import { after } from "next/server";
import { ingestInstagramJob } from "@/lib/research/ingest";
import { webhookTokenMatches } from "@/lib/research/jobs";
import { researchServiceClient } from "@/lib/research/service-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!UUID.test(jobId) || token.length < 20) return notFound();

  const sb = researchServiceClient();
  if (!sb) {
    console.error("[research] a scan callback arrived but SUPABASE_SERVICE_ROLE_KEY is not set");
    return new Response("Not configured", { status: 503 });
  }

  const { data, error } = await sb.from("research_jobs").select("id,agency_id,webhook_token_hash,status").eq("id", jobId).maybeSingle();
  if (error) {
    console.error(`[research] reading scan ${jobId} for its callback failed:`, error.message);
    return new Response("Could not read that scan", { status: 500 });
  }
  const job = data as { id: string; agency_id: string; webhook_token_hash: string; status: string } | null;
  // Same answer for a scan that does not exist and a token that does not match, so a caller cannot
  // learn which one it was.
  if (!job || !webhookTokenMatches(token, job.webhook_token_hash)) return notFound();

  // Answer straight away: Apify treats a slow callback as a failed one and sends it again.
  after(async () => {
    try {
      const outcome = await ingestInstagramJob(sb, { id: job.id, agency_id: job.agency_id });
      console.log(`[research] callback for scan ${job.id}: ${outcome.state}`);
    } catch (e) {
      console.error(`[research] the callback for scan ${job.id} failed:`, e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ ok: true });
}
