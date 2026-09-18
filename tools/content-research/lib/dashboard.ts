// Talking to the student's own dashboard database.
//
// Only the connection and the plain-English errors live here. What gets written is in sync-map.ts
// (the mapping, which is pure and tested) and sync.ts (the writes).
//
// One rule runs through all of it: every read and every write carries the workspace id the student
// passed, spelled out in the query. Nothing relies on the database working it out, so research for
// one client can never land in another client's workspace.

export class DashboardNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardNotConfigured";
  }
}

export class DashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Dashboard {
  url: string;
  key: string;
  agencyId: string;
}

/** Read the dashboard settings out of the environment, with a plain error when they are missing. */
export function dashboardFromEnv(agencyId: string, env: NodeJS.ProcessEnv = process.env): Dashboard {
  const url = (env.DASHBOARD_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (env.DASHBOARD_SUPABASE_SERVICE_KEY ?? "").trim();
  if (!url || !key) {
    throw new DashboardNotConfigured(
      "Your dashboard is not connected yet. Add these two lines to your .env:\n" +
        "  DASHBOARD_SUPABASE_URL=https://yourproject.supabase.co\n" +
        "  DASHBOARD_SUPABASE_SERVICE_KEY=your service_role key\n" +
        "Both are in Supabase under your project, Settings, then Data API and API keys. The service_role key can " +
        "read and write everything, so keep it in .env and never paste it anywhere public.",
    );
  }
  if (!UUID.test(agencyId)) {
    throw new DashboardNotConfigured(
      `"${agencyId}" is not a workspace id. It looks like 00000000-1111-2222-3333-444444444444. Find yours in the ` +
        "dashboard address bar when that workspace is open, or in the agencies table in Supabase.",
    );
  }
  return { url, key, agencyId };
}

/** The workspace filter every query carries, written out rather than assumed. */
export function scope(db: Dashboard): string {
  return `agency_id=eq.${encodeURIComponent(db.agencyId)}`;
}

export interface RestInit {
  method?: string;
  body?: string;
  prefer?: string;
}

export async function rest(db: Dashboard, path: string, init: RestInit = {}): Promise<unknown> {
  const res = await fetch(`${db.url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    headers: {
      apikey: db.key,
      Authorization: `Bearer ${db.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const table = path.split("?")[0];
    if (res.status === 401 || res.status === 403) {
      throw new DashboardError(`Your dashboard refused the key (${res.status}). Check DASHBOARD_SUPABASE_SERVICE_KEY is the service_role key for that project.`);
    }
    if (res.status === 404) {
      throw new DashboardError(
        `Your dashboard has no table called "${table}". Check DASHBOARD_SUPABASE_URL points at the project you deployed this dashboard against, and that you ran every migration in supabase/migrations.`,
      );
    }
    throw new DashboardError(`Your dashboard answered ${res.status} writing to ${table}: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Check the workspace really exists before anything is written into it. */
export async function checkWorkspace(db: Dashboard): Promise<string> {
  const rows = (await rest(db, `agencies?select=id,name&id=eq.${encodeURIComponent(db.agencyId)}&limit=1`)) as { id: string; name: string }[] | null;
  const row = rows?.[0];
  if (!row) {
    throw new DashboardError(
      `There is no workspace with the id ${db.agencyId} in that dashboard. Open the workspace you want in the dashboard and copy the id from the address bar.`,
    );
  }
  return row.name;
}
