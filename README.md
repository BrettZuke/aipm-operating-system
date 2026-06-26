# Settoku OS

An all-in-one operating dashboard for agencies and creators. Manage clients, revenue, sales pipeline, tasks, webinars, attribution, and an in-app AI assistant in one multi-tenant workspace. Built on Next.js and Supabase, with row-level security so each workspace's data stays isolated.

## Stack

- Next.js (App Router) + React 19 + TypeScript
- Supabase (Postgres + Auth + Row Level Security)
- Tailwind CSS
- Zustand for client state
- Radix UI primitives + lucide-react icons
- Recharts for data visualization
- Optional AI chat via Groq (free tier) or Anthropic

## Features

- Multi-tenant workspaces, isolated by row-level security
- Clients / CRM, revenue and MRR tracking, sales pipeline, commissions, payments
- Tasks, projects, goals, and a leaderboard
- Webinar registrations and attendance
- UTM link builder, a channel link bank (`/go/...`), and lead attribution (see `UTM-GUIDE.md`)
- Settoku Chat, an in-app AI assistant grounded in your workspace data
- Coach and creator dashboard templates with pluggable revenue readers (Stripe, FanBasis, and more)

## Getting started

### 1. Install dependencies
```bash
npm install
```

### 2. Create a Supabase project
Create a project at [supabase.com](https://supabase.com). From Settings > API, copy your project URL, anon key, and service role key.

### 3. Configure environment
```bash
cp .env.local.example .env.local
```
Fill in the Supabase values. Only the Supabase block is required to boot; every integration key is optional, and each feature degrades gracefully when its key is absent.

### 4. Apply the database schema
Run the migrations in `supabase/migrations/` against your project, either with the Supabase CLI:
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```
or by pasting each file, in order, into the Supabase SQL editor.

### 5. Run the app
```bash
npm run dev
```
Open http://localhost:3000 and sign up. A database trigger provisions your profile, workspace, and membership automatically on first signup.

### 6. (Optional) Load demo data
Want to see the dashboard populated before you add real clients? After signing up, load a set of fake sample data (clients, deals, tasks, and a few months of revenue):
```bash
npm run seed:demo
```
Remove it any time. This only deletes the demo rows and never touches your real data:
```bash
npm run seed:demo:wipe
```

## Environment variables

See `.env.local.example` for the full, commented list. Required: the Supabase URL and keys. Everything else (Stripe, Kit, Twilio, Slack, FanBasis, iClosed, WebinarJam, Google Sheets, and so on) is optional.

## Project structure

```
src/
  app/
    (auth)/        login, signup, forgot-password
    (app)/         authenticated app shell (sidebar + topbar)
    api/           route handlers, webhooks, cron jobs
  components/      UI components and primitives
  lib/             data layer, integrations, auth, Supabase clients
supabase/
  migrations/      Postgres schema (tables, RLS policies, triggers)
```

## Generate TypeScript types

After applying migrations, regenerate type-safe Supabase types:
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/supabase/types.generated.ts
```

## Deploy

Designed for Vercel. Create a project, set the same environment variables, connect your Supabase instance, and deploy.

## Security

- Row-level security on every business table, scoped per workspace.
- Auth cookies are HttpOnly via `@supabase/ssr` middleware.
- Per-tenant secrets are encrypted at rest (`SECRETS_ENCRYPTION_KEY`).
- A secret scan lives in `scripts/check-no-secrets.sh`.

## Notes

This is a starting template. Bring your own Supabase project, API keys, and branding. No credentials are included; configure your own in `.env.local`.

## License

Choose a license before sharing (MIT is a common choice for templates).
