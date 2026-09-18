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
- Research: find what is already working in a client's niche, understand why, and turn it into hooks and scripts for them

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

## Research

Research is the part of the Content page that finds what is already working in your client's niche,
explains why it worked, and turns it into hooks and scripts they can film. It lives on the Content
page under the Research tab.

### What it does

**Find creators.** Search a niche on YouTube, or start from one Instagram account you already know
and see who Instagram itself says is similar. Track the ones worth copying, and they go on your
roster.

**Scan.** A scan reads the recent posts of everyone on your roster. For each creator it works out
what normal looks like for them, then flags the posts that beat it. That is the whole idea: a small
account's breakout counts as much as a big account's, because every post is measured against the
person who posted it, not against everybody.

**Standout videos.** The feed of those posts, strongest first, with the cover image, how far it beat
that creator's normal, and how many views it got. Filter by window, platform, format or creator.

**Why it worked.** Open a video and press Break it down. A model watches the video itself when it
can, and reads what is said when it cannot, then writes down the hook word for word, the beats with
their timestamps, the choices it makes, why people keep watching, and the pattern you can reuse. If
the video could not be watched, the breakdown says so rather than pretending.

**Make it yours.** Six hooks in your client's own voice, built on the same idea, with a shooting
plan and a shot list. Save a hook to the Board, or write the full script, which is filed in Scripted
and shows up in Record ready to film.

**Score a draft.** Paste a script or upload a video before it goes out. It is scored on the hook,
whether it is one clear idea, the payoff, the pace, the ask, and how well it matches what works in
this niche, with the exact lines to change and three stronger hooks.

### What it costs

Everything except reading Instagram is free.

| What | Who does it | Cost |
|---|---|---|
| Reading Instagram posts | Apify | About $0.0027 a post. A scan of ten accounts at fifteen posts each is about four cents. |
| Reading YouTube channels and searching a niche | YouTube Data API | Free. About a hundred searches a day across the whole key. |
| Breaking a video down, Make it yours, writing a script, scoring a draft | Groq and Gemini free tiers | Free. |
| Turning a reel's audio into words | Groq Whisper | Free. |

Every Instagram read carries a hard spend cap that Apify itself enforces, so a read that goes wrong
cannot cost more than the cap. Before you press Scan now the page tells you what the scan is
expected to cost and what its cap is, and the Runs tab shows what each scan actually cost.

### The limits, per workspace per day

Six scans, thirty video breakdowns, thirty Make it yours runs, fifteen scripts, twenty five draft
scores, twenty creator searches, and two dollars of Instagram reading. These are counted in the
database before anything is spent, so they hold even if you click twice. They reset at midnight UTC.

### The Client profile

Everything a hook or a script says about the business comes from one document in your Brain
(`/knowledge`) called `Client profile`. Write it with the client's own answers under these headings:

```
# Client profile: Their Business Name

## Who they help
## What they sell
## What they can show on camera
## How they talk
## Phrases to avoid
```

Until it is filled in, hooks come back with `[brackets]` where their own details belong, plus a note
saying exactly what to ask them for. That is deliberate. A guessed detail about a real business is a
claim published in their name.

### Keys you need

All free. Add them to `.env.local` locally, or to your project's environment variables on Vercel.
If one is missing, the page says which one and where to get it rather than failing quietly.

- `APIFY_API_TOKEN` reads Instagram. The only thing here that can cost money.
- `GROQ_API_KEY` writes the hooks and scripts, scores drafts, and turns audio into words.
- `GEMINI_API_KEY` watches the video itself.
- `YOUTUBE_API_KEY` reads YouTube channels and finds creators by niche.

### Scanning is on demand

There is no scheduled scan. Vercel's Hobby plan allows two scheduled jobs and this dashboard already
uses both, so a scan runs when you press Scan now. That is usually what you want anyway: you scan
when you are about to make content.

If you would rather it ran on its own, Supabase can do it without using a Vercel job. In your
Supabase project, under Database, enable the `pg_cron` and `pg_net` extensions, then run this in the
SQL editor, replacing the address with your own deployed dashboard and the workspace id with yours:

```sql
select cron.schedule(
  'research-weekly-scan',
  '0 12 * * 1,4',
  $$
  select net.http_get(
    url := 'https://your-dashboard.vercel.app/api/research/apify',
    headers := '{}'::jsonb
  );
  $$
);
```

That is the shape of it. You would need a small route of your own that starts a scan for a named
workspace and checks a shared secret before it does, because a scheduled job has no signed-in user
behind it. Nothing in this template ships that route, on purpose: a scheduled scan spends money
without anyone watching, and that should be a decision you make deliberately.

### One setting worth knowing about

`RESEARCH_PUBLIC_URL` is the address your dashboard is deployed at, for example
`https://your-dashboard.vercel.app`. When it is set, Apify calls your dashboard the moment a scan
finishes and the results appear on their own. When it is not set, which is normal while you are
running the dashboard on your own machine, the page checks for the results itself while it is open,
and it tells you to keep the tab open. Either way the scan works.

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
