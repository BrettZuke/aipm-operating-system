# Settoku OS

Settoku OS is a multi-tenant operating dashboard for agencies and creators (clients, revenue, sales pipeline, tasks, webinars, attribution, and an AI assistant), built on Next.js + Supabase. This is a clean starter template: it ships with no data and no credentials.

## Helping someone set it up

If the user wants to get this running, offer to walk them through these steps and run the commands with them:

1. Install dependencies: `npm install`
2. Create a free Supabase project at https://supabase.com. From Settings > API, copy the Project URL, the `anon` key, and the `service_role` key.
3. Create their env file: `cp .env.local.example .env.local`, then paste the Supabase URL and keys into it. Only the Supabase block is required to boot; every other key is optional and its feature stays off until configured.
4. Apply the database schema: run every migration in `supabase/migrations/` in order, via the Supabase SQL editor (paste each file in order) or the Supabase CLI (`supabase db push`).
5. Start it: `npm run dev`, open http://localhost:3000, and have them sign up. The first signup automatically creates their workspace.
6. Optional demo data: `npm run seed:demo` loads fake sample data so they can see the dashboard populated; `npm run seed:demo:wipe` clears it before they go live.

## Using it for their own clients

- Each person who signs up gets their own isolated workspace (enforced by Postgres row-level security), so client data never crosses between workspaces.
- They add a client in the dashboard, then feed in that client's data manually or by enabling an integration.
- Optional integrations (Stripe, Kit, Twilio, Slack, FanBasis, iClosed, WebinarJam, Google Sheets) turn on by adding the relevant keys to `.env.local`. The full, commented list is in `.env.local.example`.

## Ground rules

- This template contains no credentials. Never hardcode secrets, and never commit `.env.local` (it is git-ignored).
- Stack: Next.js (App Router) + React + TypeScript + Tailwind CSS + Supabase.

@AGENTS.md
