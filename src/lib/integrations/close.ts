/**
 * Close CRM helpers.
 *
 * Used for:
 *   - One-time import of leads/contacts from Close → OS clients
 *   - Future: two-way sync (deals close in OS → update Close)
 */

const CLOSE_API = "https://api.close.com/api/v1";

type CloseAuth = { headers: { Authorization: string; "Content-Type": string } };

function authHeaders(): CloseAuth | null {
  const key = process.env.CLOSE_API_KEY;
  if (!key) return null;
  return {
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
  };
}

export type CloseLead = {
  id: string;
  display_name: string;
  contacts: Array<{ name?: string; emails?: { email: string }[]; phones?: { phone: string }[] }>;
  status_label?: string;
  description?: string;
  date_created: string;
  date_updated: string;
};

export async function listLeads(opts: { limit?: number; cursor?: string } = {}): Promise<{ ok: true; leads: CloseLead[]; cursor?: string } | { ok: false; error: string }> {
  const auth = authHeaders();
  if (!auth) return { ok: false, error: "CLOSE_API_KEY not configured" };

  const url = new URL(`${CLOSE_API}/lead/`);
  url.searchParams.set("_limit", String(opts.limit ?? 100));
  if (opts.cursor) url.searchParams.set("_cursor", opts.cursor);

  const res = await fetch(url, auth);
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
  const data = await res.json();
  return { ok: true, leads: data.data, cursor: data.cursor_next };
}

export async function getLead(leadId: string): Promise<{ ok: true; lead: CloseLead } | { ok: false; error: string }> {
  const auth = authHeaders();
  if (!auth) return { ok: false, error: "CLOSE_API_KEY not configured" };
  const res = await fetch(`${CLOSE_API}/lead/${leadId}/`, auth);
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return { ok: true, lead: await res.json() };
}

// Pull the primary email + phone off a Close lead
export function primaryContact(lead: CloseLead): { name: string; email: string | null; phone: string | null } {
  const contact = lead.contacts?.[0];
  return {
    name: contact?.name ?? lead.display_name,
    email: contact?.emails?.[0]?.email?.toLowerCase() ?? null,
    phone: contact?.phones?.[0]?.phone ?? null,
  };
}
