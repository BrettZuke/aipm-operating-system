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

## Research, on the Content page

The Content page has a Research tab that finds what is already working in a client's niche, explains why, and turns it into hooks and scripts in that client's voice. It needs four free keys (`APIFY_API_TOKEN`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`); each one that is missing just turns off the part that needs it, and the page names the key and where to get one. Reading Instagram through Apify is the only thing that can cost money, and every read carries a hard spend cap. Scanning is on demand, not scheduled. The README has the detail, the costs and the daily limits.

Never point Research at a paid provider. It builds its providers from free keys only, and there is a test that proves an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` sitting in the environment is ignored.

## The command line version

`tools/content-research/` is the same engine as a command line tool, for when there is no dashboard deployed yet, when a written report file is wanted, or for a scan too large for a browser tab. It has its own README, START-HERE.md and SKILL.md, its own `.env`, and its own test suite (`cd tools/content-research && npm install && npm test`). Its `sync` command writes its findings into this dashboard's own tables.

## Ground rules

- This template contains no credentials. Never hardcode secrets, and never commit `.env.local` (it is git-ignored).
- Stack: Next.js (App Router) + React + TypeScript + Tailwind CSS + Supabase.

@AGENTS.md
