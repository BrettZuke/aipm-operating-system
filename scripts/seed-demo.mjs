// Demo data seeder for Settoku OS.
//
// Loads fake but realistic sample data (clients, deals, tasks, ~12 weeks of
// revenue) into your newest workspace so you can see the dashboard fully
// populated. Every demo row uses a fixed id prefix, so --wipe removes exactly
// what this script added and never touches your real data.
//
// Usage (after you have signed up in the app at least once):
//   npm run seed:demo          # load the demo data
//   npm run seed:demo:wipe     # remove the demo data
//
// Or directly:
//   node --env-file=.env.local scripts/seed-demo.mjs
//   node --env-file=.env.local scripts/seed-demo.mjs --wipe
//   node --env-file=.env.local scripts/seed-demo.mjs --agency=<agency-uuid>
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the service role
// key bypasses row-level security so the seed can write directly).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with:  node --env-file=.env.local scripts/seed-demo.mjs");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const WIPE = process.argv.includes("--wipe");
const agencyArg = process.argv.find((a) => a.startsWith("--agency="))?.split("=")[1];

// Deterministic demo ids (shared "d0d0d0d0" prefix) so --wipe is exact.
const did = (group, i) =>
  `d0d0d0d0-0000-4000-8000-00000000${group}${String(i).padStart(3, "0")}`;
const CLIENT = [1, 2, 3, 4].map((i) => did(1, i));
const DEAL = [1, 2, 3].map((i) => did(2, i));
const TASK = [1, 2, 3, 4].map((i) => did(3, i));
const PROJECT = [did(5, 1)];
const TX = Array.from({ length: 13 }, (_, i) => did(4, i + 1));

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const dateAgo = (n) => daysAgo(n).slice(0, 10);

async function resolveAgency() {
  if (agencyArg) return { id: agencyArg, owner_id: null, name: agencyArg };
  const { data, error } = await sb
    .from("agencies")
    .select("id, owner_id, name")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("Database error:", error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.error("No workspace found. Open the app and sign up once to create your workspace, then re-run.");
    process.exit(1);
  }
  return data[0];
}

async function wipe(agency) {
  const tables = [
    ["transactions", TX],
    ["tasks", TASK],
    ["deals", DEAL],
    ["projects", PROJECT],
    ["clients", CLIENT],
  ];
  for (const [table, ids] of tables) {
    const { error } = await sb.from(table).delete().in("id", ids);
    if (error) console.warn(`  ${table}: ${error.message}`);
  }
  console.log(`Demo data removed from workspace "${agency.name}".`);
}

async function seed(agency) {
  const agency_id = agency.id;
  const owner = agency.owner_id; // student's profile id (may be null if --agency was passed)

  const clients = [
    { id: CLIENT[0], name: "Acme Co", email: "ops@acme.example.com", status: "active", mrr: 2500, start_date: dateAgo(120) },
    { id: CLIENT[1], name: "Bright Labs", email: "hello@brightlabs.example.com", status: "active", mrr: 1800, start_date: dateAgo(75) },
    { id: CLIENT[2], name: "Northwind Media", email: "team@northwind.example.com", status: "lead", mrr: 0, start_date: null },
    { id: CLIENT[3], name: "Summit Studio", email: "studio@summit.example.com", status: "paused", mrr: 900, start_date: dateAgo(200) },
  ].map((c) => ({ ...c, agency_id, data: { _demo: true } }));

  const projects = [
    { id: PROJECT[0], agency_id, owner_id: owner, name: "Q3 Client Delivery", status: "active", data: { _demo: true } },
  ];

  const deals = [
    { id: DEAL[0], agency_id, client_id: CLIENT[0], owner_id: owner, name: "Acme Co Annual Retainer", stage: "won", amount: 30000, closed_at: daysAgo(20), data: { _demo: true } },
    { id: DEAL[1], agency_id, client_id: CLIENT[2], owner_id: owner, name: "Northwind Launch Package", stage: "proposal", amount: 12000, expected_close_date: dateAgo(-14), data: { _demo: true } },
    { id: DEAL[2], agency_id, client_id: null, owner_id: owner, name: "Inbound Discovery Call", stage: "new", amount: 5000, expected_close_date: dateAgo(-30), data: { _demo: true } },
  ];

  const tasks = [
    { id: TASK[0], agency_id, client_id: CLIENT[0], assignee_id: owner, created_by: owner, title: "Onboard Acme Co", status: "in_progress", priority: "high", due_date: daysAgo(-3), data: { _demo: true } },
    { id: TASK[1], agency_id, client_id: CLIENT[2], assignee_id: owner, created_by: owner, title: "Send Northwind proposal", status: "todo", priority: "urgent", due_date: daysAgo(-1), data: { _demo: true } },
    { id: TASK[2], agency_id, client_id: CLIENT[1], assignee_id: owner, created_by: owner, title: "Prepare Bright Labs monthly report", status: "todo", priority: "medium", due_date: daysAgo(-7), data: { _demo: true } },
    { id: TASK[3], agency_id, client_id: CLIENT[3], assignee_id: owner, created_by: owner, title: "Renew Summit Studio contract", status: "done", priority: "low", completed_at: daysAgo(5), due_date: daysAgo(2), data: { _demo: true } },
  ];

  const txClients = [CLIENT[0], CLIENT[1], CLIENT[3]];
  const txAmounts = [2500, 1800, 900];
  const transactions = [];
  let k = 0;
  for (let week = 0; week < 4; week++) {
    for (let c = 0; c < txClients.length; c++) {
      transactions.push({
        id: TX[k], agency_id, client_id: txClients[c], member_id: owner,
        amount: txAmounts[c], currency: "USD", kind: "payment",
        description: "Monthly subscription", occurred_at: daysAgo(week * 28 + 3),
        metadata: { _demo: true },
      });
      k++;
    }
  }
  transactions.push({
    id: TX[k], agency_id, client_id: CLIENT[1], member_id: owner,
    amount: 300, currency: "USD", kind: "refund",
    description: "Partial refund", occurred_at: daysAgo(10), metadata: { _demo: true },
  });

  const steps = [
    ["clients", clients],
    ["projects", projects],
    ["deals", deals],
    ["tasks", tasks],
    ["transactions", transactions],
  ];
  for (const [table, rows] of steps) {
    const { error } = await sb.from(table).upsert(rows, { onConflict: "id" });
    if (error) console.warn(`  ${table}: ${error.message}`);
    else console.log(`  ${table}: ${rows.length} rows`);
  }
  console.log(`\nDemo data loaded into workspace "${agency.name}". Open the dashboard to explore.`);
  console.log("Remove it any time with:  npm run seed:demo:wipe");
}

const agency = await resolveAgency();
if (WIPE) await wipe(agency);
else await seed(agency);
