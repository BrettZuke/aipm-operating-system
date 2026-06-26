/**
 * FanBasis API helpers.
 *
 * Status (2026-05-07): the coach doesn't have the API key yet. Today FanBasis →
 * Settoku OS flows via Zapier → /api/webhook/fanbasis. Once the API key arrives,
 * set:
 *
 *   FANBASIS_API_KEY=...
 *   FANBASIS_API_URL=https://api.fanbasis.com   (override if path differs)
 *
 * Then the helpers below light up + the integrations page goes green.
 *
 * Endpoint paths are best-guess based on common payment-platform patterns.
 * If FanBasis uses different paths, change the constants below — no other
 * file references hardcoded paths.
 */

const DEFAULT_BASE = "https://api.fanbasis.com";
const PATH_ME            = "/v1/me";
const PATH_LIST_TXS      = "/v1/transactions";
const PATH_LIST_CUSTOMERS = "/v1/customers";
const PATH_GET_CUSTOMER  = "/v1/customers";  // suffix /:id

type FanbasisAuth = { ok: true; token: string; baseUrl: string } | { ok: false; error: string };

function getAuth(): FanbasisAuth {
  const token = process.env.FANBASIS_API_KEY;
  if (!token) return { ok: false, error: "FANBASIS_API_KEY not set" };
  const baseUrl = (process.env.FANBASIS_API_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  return { ok: true, token, baseUrl };
}

async function request<T>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | number> } = {}): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status?: number }> {
  const auth = getAuth();
  if (!auth.ok) return { ok: false, error: auth.error };

  const url = new URL(auth.baseUrl + path);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));

  try {
    const res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) return { ok: false, status: res.status, error: (json as { message?: string }).message ?? `HTTP ${res.status}` };
    return { ok: true, status: res.status, data: json as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown fetch error" };
  }
}

// ── Connectivity check ──────────────────────────────────────────────────────
export async function checkFanbasis(): Promise<{ ok: boolean; status: "connected" | "configured" | "missing" | "error"; info: string }> {
  const auth = getAuth();
  if (!auth.ok) return { ok: false, status: "missing", info: "FANBASIS_API_KEY not set — payments still flow via Zapier webhook" };

  const r = await request<{ email?: string; name?: string }>(PATH_ME);
  if (!r.ok) {
    // 404 likely means the path is wrong; surface so we know to adjust the constant
    if (r.status === 404) return { ok: false, status: "error", info: `Endpoint ${PATH_ME} returned 404 — check FANBASIS_API_URL or update PATH_ME` };
    if (r.status === 401 || r.status === 403) return { ok: false, status: "error", info: "API key invalid or expired" };
    return { ok: false, status: "error", info: r.error };
  }
  return { ok: true, status: "connected", info: r.data.email ?? r.data.name ?? "Connected" };
}

// ── Transactions ────────────────────────────────────────────────────────────
export type FanbasisTransaction = {
  id: string;
  customer_email?: string;
  customer_name?: string;
  amount: number;
  currency?: string;
  status?: string;
  product_name?: string;
  paid_at?: string;
  external_id?: string;
};

export async function listTransactions(opts: { limit?: number; cursor?: string; since?: string } = {}) {
  const query: Record<string, string | number> = {};
  if (opts.limit) query.limit = opts.limit;
  if (opts.cursor) query.cursor = opts.cursor;
  if (opts.since) query.since = opts.since;
  return request<{ data: FanbasisTransaction[]; next_cursor?: string }>(PATH_LIST_TXS, { query });
}

// ── Customers ──────────────────────────────────────────────────────────────
export type FanbasisCustomer = {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  total_spent?: number;
  created_at?: string;
};

export async function listCustomers(opts: { limit?: number; cursor?: string } = {}) {
  const query: Record<string, string | number> = {};
  if (opts.limit) query.limit = opts.limit;
  if (opts.cursor) query.cursor = opts.cursor;
  return request<{ data: FanbasisCustomer[]; next_cursor?: string }>(PATH_LIST_CUSTOMERS, { query });
}

export async function getCustomer(id: string) {
  return request<FanbasisCustomer>(`${PATH_GET_CUSTOMER}/${encodeURIComponent(id)}`);
}

// ── Sync helper: pull all transactions and idempotently insert ─────────────
//    Used by /api/cron/sync-fanbasis (to be added once API key is live) or
//    a manual `node scripts/sync-fanbasis.mjs` run.
export async function pullAllTransactionsSince(sinceISO?: string): Promise<{ ok: true; transactions: FanbasisTransaction[] } | { ok: false; error: string }> {
  const all: FanbasisTransaction[] = [];
  let cursor: string | undefined;
  let safety = 0;
  while (safety++ < 200) {
    const r = await listTransactions({ limit: 100, cursor, since: sinceISO });
    if (!r.ok) return { ok: false, error: r.error };
    all.push(...(r.data.data ?? []));
    if (!r.data.next_cursor) break;
    cursor = r.data.next_cursor;
  }
  return { ok: true, transactions: all };
}
