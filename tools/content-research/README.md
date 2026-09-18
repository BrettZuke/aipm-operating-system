# Content Research

Find the posts that are beating their own creator's normal numbers, work out exactly why they
worked, and turn that into hooks and scripts written in your client's voice.

It is a command line tool. There is nothing to deploy, no database, no login. Everything for one
client lives in a folder you can open in a text editor.

New here? Read **[START-HERE.md](START-HERE.md)** first. This file is the detail.

---

## The idea

Most competitor research is a list of accounts with big numbers on them. That tells you nothing,
because a post with 500,000 views from an account that always gets 500,000 views is just Tuesday.

This tool only cares about one thing: **did this post beat what that creator normally gets?**

A post has to beat its own creator's normal by 2x before it counts. That puts a 15,000 view account
and a 1.5 million view account on the same scale, so a small local creator's genuine hit ranks
above a big account's average day. It is the difference between "here are some popular videos" and
"here is what actually worked, and here is why".

The normal is worked out like this:

- It is the middle number of that creator's recent posts, not the average, so one freak hit cannot
  drag it up.
- Only posts at least **72 hours old** count towards it. A post from yesterday is still growing, and
  letting it set the bar would make everything else look better than it is. A young post can still
  BE a standout, it just does not get a vote.
- It reads the most recent **60** qualifying posts, so it tracks who that creator is now.
- Fewer than **5** settled posts and there is no normal. The tool says so and calls nothing a
  standout, rather than inventing a comparison.
- Instagram accounts that post mostly carousels get no view count, so they are measured on likes
  plus comments instead.
- YouTube Shorts and long videos get separate normals once each has enough posts, because they live
  on completely different scales.

## What you get

| Command | What it gives you |
|---|---|
| `setup` | Which keys you have, what each is for, and where to get the missing ones |
| `client add "Name"` | The profile every hook is written from: who they help, what they sell, what they can show on camera, how they talk, what never to say |
| `client show [name]` | What the tool knows about a client, and what it has spent on them |
| `track <client> <handles...>` | Watch an Instagram handle, a YouTube @handle, or a channel link |
| `find <client> "niche"` | Creators making the most watched videos in a niche, ranked, with an offer to track them |
| `scan <client>` | Reads everybody's recent posts and works out which beat their own normal |
| `report <client>` | The standouts, ranked, with the real numbers and any breakdowns, as markdown you can send |
| `breakdown <client> <n>` | The AI watches that video and says exactly why it worked, with quotes and timestamps |
| `hooks <client> <n>` | Six hooks in your client's voice, built on that video's mechanism |
| `script <client> <n>` | The full script from the chosen hook |
| `score <client> <file>` | Scores a draft out of 100, part by part, with the exact lines to fix |
| `sync <client> --workspace <id>` | Sends it all into your own dashboard |

Everything runs as `npx tsx research.ts <command>`.

## What it costs

| Thing | Cost |
|---|---|
| Reading one Instagram post | about 0.0027 US dollars, from Apify's free monthly credit |
| A normal weekly scan, 3 creators, 15 posts each | about 0.12 US dollars |
| Everything on YouTube | free |
| Watching a video and breaking it down | free |
| Writing hooks, scripts and scores | free |

Every command that can spend prints the estimate first and will not go over a dollar without you
adding `--yes`. Every Apify run also carries a hard cap that Apify itself enforces, so even a run
that goes wrong cannot go past it.

**It never uses a paid key.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are ignored on purpose, even
if they are sitting in your `.env`. The AI providers are filtered in code, not by convention.

## Where the work lives

```
clients/<their-name>/
  profile.md              who they help, what they sell, what they can show, how they talk
  creators.json           the accounts you are watching
  posts.json              every post read, with its numbers worked out
  baselines.json          what each creator's normal was, and how it was worked out
  runs.json               what each command spent and which model answered
  breakdowns/<id>.json    why one post worked
  hooks/<id>.json         six hooks, plus the ones that were thrown away and why
  scripts/<id>.md         the full script
  reports/<date>.md       the report you send
```

Plain files, on purpose. You can open any of it, edit it, or delete it. To stop watching a creator,
open `creators.json` and delete their block.

The `clients/` folder is not committed, because it holds your clients' details and their research.
The work you want to keep belongs in your dashboard, which is what `sync` is for.

## Connecting it to your dashboard

This tool sits inside the Settoku OS dashboard. If you have deployed that dashboard, add two lines
to `.env`:

```
DASHBOARD_SUPABASE_URL=https://yourprojectref.supabase.co
DASHBOARD_SUPABASE_SERVICE_KEY=your service_role key
```

Both are in Supabase, under your project, in Settings: the URL under Data API, the key under API
keys. The service_role key can read and write everything in your database, so keep it in `.env` and
never paste it anywhere else.

Then:

```bash
npx tsx research.ts sync <client> --workspace <that client's workspace id>
```

The workspace id is in your dashboard's address bar when that client's workspace is open. One
workspace per client is the usual setup, and sync only ever touches the one you name.

### What appears where, after a sync

| In your dashboard | What lands there | The table behind it |
|---|---|---|
| Content, Creators, Roster | Every competitor you track, as a copy target, with how many posts and videos have been read and when | `content_creators` |
| Content, Creators, What it found | Every standout, with its numbers, and the hook type, template, format, ask and why it worked for the ones you broke down | `content_outliers` |
| Content, Creators, Run history | What your last scan read and found | `content_machine_runs` |
| Content, Board, Ideas | One card per hook, the chosen one first | `content_cards`, stage `ideas` |
| Content, Board, Scripted, and the Record tab | The script, laid out so Record can film from it: the hook big, the words in lines, the shot list as a list | `content_cards`, stage `scripted` |
| Knowledge | One doc per client, `Competitor research: <Their Name>` | `knowledge_docs` |

It also reads the Brain first. If a knowledge doc called `Client profile: <Their Name>` exists in
that workspace, that becomes the truth the hooks are written from, so you are not keeping two copies
of who the client is. Add `--pull-profile` to copy it back down to the local file too.

### Running it twice

Nothing doubles. The roster matches on the handle, the standouts on the post's link, the cards on a
marker this tool puts in each card's `source` field. A second sync updates what is there.

Three things are deliberately left alone on an update, because they are yours:

- **A creator's role or status.** If you pause a creator in the dashboard, the next sync leaves them
  paused. Only their name, counts and last scan time are refreshed.
- **A card you have dragged.** If you moved a hook from Ideas to Filming, sync updates its words but
  not its column.
- **An analysis already on a standout.** The numbers and the analysis are written separately, so
  re-syncing the numbers can never blank a breakdown.

`sync <client> --workspace <id> --remove` takes it all back out. Cards and run history carry this
tool's marker so those are exact. The roster and the standouts have no spare column to mark, so they
are matched on the handles you track and the links your research produced.

## The honest limits

- **Instagram search does not exist here.** There is no free way to search Instagram by niche, so
  `find` is YouTube only. Most creators worth copying post on both, and their YouTube channel
  description often says where. When it does, the tool shows the handle as a guess, never as fact.
- **A private or renamed Instagram account returns nothing**, and you still pay for the attempt
  (about a third of a penny). The tool says plainly which account came back empty.
- **Instagram view counts are only on video posts.** A carousel-heavy account is measured on likes
  plus comments instead, which is a different thing and the report says so.
- **The free video allowance is small.** Gemini gives roughly 20 video requests a day per key, so
  about 20 breakdowns a day. When it runs out the tool falls back to the video's words, and marks
  the breakdown as not watched so you never mistake one for the other.
- **A YouTube video cannot be transcribed without watching it.** If the video watching allowance is
  spent, a YouTube breakdown falls back to the title, description and numbers only, and says so.
- **YouTube searching is limited to about 100 a day** for the whole key, shared across every client
  you run. Tracking creators by handle does not touch that limit.
- **It reads public posts only.** No login, no private accounts, no stories, no follower counts over
  time.
- **A creator with fewer than five settled posts gets no normal at all.** New accounts are invisible
  to this tool by design, because there is nothing honest to compare against yet.
- **The numbers are a snapshot.** A post read today will have more views tomorrow. Scan weekly and
  the picture stays current.
- **Sync needs the dashboard's content tables.** They come from `supabase/migrations` at the root of
  this repo. If you deployed the dashboard before those migrations existed, run them and sync again.
  The error message names the missing table.

## The rule that matters most

**No number about a client is ever invented.** Every figure in a hook or a script has to appear in
that client's profile, and the check runs in code after the model answers, not as an instruction in
a prompt. Digits and quantities written out as words both count, because a model that is told not to
say "30,000" will happily say "thirty thousand".

A hook that claims a result nobody can check, promises a personal reply, uses a phrase the client
bans, or is too long to say in three seconds, gets thrown away and the reason is printed. If fewer
than three survive, the tool asks again with the failures quoted.

If the client profile is too thin to write from, hooks come back with `[brackets]` where the real
detail goes, and a note telling you exactly what to ask the client for. It will not fill a bracket
in with a plausible guess.
