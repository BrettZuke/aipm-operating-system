---
name: content-research
description: >
  Find the social posts that beat their own creator's normal numbers, work out why they worked, and
  turn the pattern into hooks and scripts for one of your clients. Reads Instagram through Apify and
  YouTube through its own free API, watches the standout videos with Gemini, and writes in the
  client's voice from a profile you fill in. Everything is per client, on free keys, and every
  number about a client is checked in code before it can be written. Use when the student wants
  competitor research, content ideas, hooks, video scripts, or a content report for a client.
  Triggers: "what should my client post", "competitor research", "find me hooks", "why did that
  video do well", "write a script for", "content ideas for", "score this script".
---

# content-research

Turn "what should my client post" into a ranked list of what is actually working, a breakdown of
why, and a script they can film this week.

Everything runs from `tools/content-research`:

```bash
cd tools/content-research
npx tsx research.ts <command>
```

## When to use this

Use it when a student needs content for a client and wants it grounded in something real rather
than invented. It answers four questions in order:

1. What is working right now in this client's world? (`scan`, `report`)
2. Why did that particular post work? (`breakdown`)
3. What is our version of it? (`hooks`, `script`)
4. Is this draft any good? (`score`)

Do not use it to find leads, to build a site, or to post anything. It never posts. It reads public
posts and writes drafts.

## The dashboard has this built in now

This tool lives inside the Settoku OS dashboard, at `tools/content-research`. The same thing runs in
the dashboard itself, on the Content page under the Research tab: the standout
videos with their cover images, the breakdown of any one of them, Make it yours, saving a hook or
writing a script straight onto the Board, the creator finder, and the draft scorer. It uses the
student's own free keys, keeps its own daily limits, and puts every result where they already work.

**Use the dashboard for normal work.** It is where the student already is, the results live next to
their Board and their Record tab, and nothing has to be synced anywhere.

**Use this command line tool when:**

- The student has not deployed this dashboard yet, or is working for a client who has no workspace
  in it.
- You want a written report as a file (`report`) to send a client, rather than a screen.
- You are running something large or unattended: a deep scan of thirty accounts, or a batch of
  breakdowns, where a browser tab would time out.
- You are debugging what a provider actually answered, because this prints every step as it runs.
- The dashboard is down, or its keys are not set yet.

Whichever one you use, the work reaches the same place: `sync` writes this tool's findings into the
dashboard's own tables, and the dashboard's Research tab writes into the same ones.

## Set a student up (run this when they are new or say "set me up")

The student is not technical. Do every step you can for them and ask only for the things only they
can do, which is making the four free accounts.

1. `npx tsx research.ts setup`. It lists what is connected and what is missing, with the signup link
   for each. Run it again after every key they add.
2. Get them the four free keys: Apify (reads Instagram), Groq (writes), Gemini (watches video),
   YouTube (reads channels, finds creators). Links are in the setup output and in START-HERE.md.
3. Put them in `.env` in that folder. Copy `.env.example` first. Never put a key anywhere else, and
   never paste one into a message, a commit or a screenshot.
4. `npm install` once.
5. Make their first client and fill the profile in with them (see below). This is the step that
   decides whether the output is any good.
6. Run their first scan on two or three creators so they see standouts land, then a breakdown, then
   hooks. About two minutes and twelve pence.

## The exact command for each job

| The student says | You run |
|---|---|
| "set me up" / "what am I missing" | `npx tsx research.ts setup` |
| "add a new client" | `npx tsx research.ts client add "Their Business Name"` |
| "what do we know about them" | `npx tsx research.ts client show their-business-name` |
| "watch this account" | `npx tsx research.ts track their-business-name somehandle "@SomeChannel"` |
| "who should we be watching" | `npx tsx research.ts find their-business-name "what their customers search for"` |
| "what is working right now" | `npx tsx research.ts scan their-business-name` |
| "show me the results" | `npx tsx research.ts report their-business-name --print` |
| "why did that one do well" | `npx tsx research.ts breakdown their-business-name 1` |
| "give me hooks" | `npx tsx research.ts hooks their-business-name 1` |
| "write the script" | `npx tsx research.ts script their-business-name 1` |
| "is this any good" | `npx tsx research.ts score their-business-name path/to/draft.md` |
| "put it in my dashboard" | `npx tsx research.ts sync their-business-name --workspace <id>` |

The number after a client name (`1`, `2`, `3`) is the position in the last report. A full post link
works in the same place.

Useful flags: `--posts 30` reads more posts per creator on a scan, `--yes` skips the spend
confirmation, `--again` redoes a breakdown or hooks that already exist, `--hook "..."` writes the
script on a hook the student chose themselves, `--print` prints a report instead of just saving it,
`--add 1,3` on `find` tracks those creators without asking.

## The whole workflow for one client

Do it in this order. Each step needs the one before it.

**Once per client**

1. `client add "Their Business Name"`, then fill the profile in properly. See the next section.
2. `track` two to five creators, or `find` a niche and track the best of what comes back. Pick
   creators the client's actual customers follow, not the biggest accounts you can think of.

**Every week**

3. `scan`. Reads everybody's recent posts, works out each creator's normal, and flags what beat it.
   It prints the cost first.
4. `report --print`. Read it. The standouts are ranked by how far they beat their own normal, damped
   by the reach they actually got, so a real hit ranks above a fluke on a tiny post.
5. `breakdown <n>` on the top one or two. The AI watches the video and comes back with the exact
   opening line, the beats with timestamps, what is on screen, and the pattern to reuse.
6. `hooks <n>`. Six hooks in the client's voice. Some will have been thrown away, and it tells you
   why. Read them to the client or send them.
7. `script <n>`, or `script <n> --hook "the one they picked"`. The full script, plus what to film.
8. `score <the saved file>`. Fix what it points at. Re-score if you want.
9. `sync` if they use the dashboard. The roster, the standouts, the run, the hook cards and the
   script all land where they already look, and the Record tab films from the script.

Realistic weekly time per client: about ten minutes of commands, and the rest is the student
choosing which hook their client will actually say out loud.

## Filling in the client profile (the step that decides everything)

`client add` writes `clients/<name>/profile.md` with five headings. Everything the tool says about
that business comes from this file and nowhere else.

- **Who they help.** Not "homeowners" but "homeowners with a boiler over ten years old who have
  already had one breakdown this winter".
- **What they sell.** The real thing, the price if they are happy for it to be public, and why
  people pick them.
- **What they can show on camera.** The longest section, and the one that makes hooks good. Jobs,
  van, workshop, before and after, tools, the thing that goes wrong, the part they keep on the
  bench to show people.
- **How they talk.** Paste two or three real sentences from a voice note or a message. The hooks
  come back sounding like that.
- **Phrases to avoid.** One per line. Anything they hate, any competitor name, any claim they
  cannot back up. The tool throws away any hook that uses one.

If the profile is thin, the tool does not guess. Hooks come back with `[brackets]` where the real
detail goes and a note saying exactly what to ask the client. Take that note to the client rather
than filling the brackets in yourself.

## Wiring it to their dashboard

Only if the student has deployed this dashboard. The content tables it needs come from
`supabase/migrations` at the root of this repo, so if sync says a table is missing, those
migrations have not been run yet.

Two lines in `.env`:

```
DASHBOARD_SUPABASE_URL=https://theirprojectref.supabase.co
DASHBOARD_SUPABASE_SERVICE_KEY=their service_role key
```

Then `npx tsx research.ts sync <client> --workspace <workspace id>`.

**The workspace id** is the agency id of that client's workspace. It is in the dashboard's address
bar when that workspace is open, and in the `agencies` table in Supabase. One workspace per client
is the normal setup. Every read and every write in sync spells that id out in the query, so research
for one client can never reach another client's workspace. If the id is wrong the command stops and
says so before writing anything.

**Where the student will find each thing afterwards, on the Content page:**

| Tab | What is there | Table |
|---|---|---|
| Creators, Roster | Every tracked competitor, filed as a copy target (`role` emulate, `status` active), with posts and videos counted and the last scan time | `content_creators` |
| Creators, What it found | Every standout, with url, platform, creator, handle, posted date, post type, metric, score, the creator's median, the multiple, views, likes, comments and the caption hook. The ones with a breakdown also carry hook type, hook template, format, ask, why it worked, and are marked analysed | `content_outliers` |
| Creators, Run history | One scrape row and one parse row per scan, with creators read, outliers found and analysed, scripts written | `content_machine_runs` |
| Board, Ideas | One card per hook, the chosen hook first | `content_cards`, stage `ideas` |
| Board, Scripted | The script. The **Record** tab films straight off it | `content_cards`, stage `scripted` |
| Knowledge | `Competitor research: <Their Name>`, the write up their dashboard chat can read | `knowledge_docs` |

**The Record tab.** A scripted card's `script` column is written with the labels the dashboard's own
parser reads (`src/lib/content/film.ts`, at the root of this repo): `HOOK:`, `ON SCREEN:`, then the spoken words unlabelled,
then `CTA:` and `SHOT LIST:`. That parser is run over one of our cards in `tests/sync-map.test.ts`,
so if their parser ever changes, our tests fail rather than a student opening Record to a blank
screen. If you change the layout, run `npx vitest run tests/sync-map.test.ts` and check it still
finds the hook, the words and the ask.

**The profile, read the other way.** If a knowledge doc called `Client profile: <Their Name>`
already exists in that workspace, sync reads the client profile from there instead of the local
file, and says so. That way the Brain is the one place the client is described. Add
`--pull-profile` to copy it back down to the local file too.

**Running it twice changes nothing twice.** The roster matches on handle, the standouts on their
link, the cards on the `source` marker this tool writes (`content-research:<client>:<post>:<kind>:<n>`).
Three things are deliberately left alone on an update, and you should not work around them:

- a creator's `role` and `status`, so pausing a creator in the dashboard sticks;
- a card's `stage`, so a card the student dragged to Filming stays there;
- an analysis already on a standout, because the numbers and the analysis are written separately.

`--remove` takes it all back out. Cards and run history carry the marker so those are exact; the
roster and the standouts are matched on the handles tracked and the links the research produced.

Nothing is written to the older `content` table. That page calls it the idea list from before the
Board, so it is the wrong home for this.

## The free limits, and what to do when one is hit

| Thing | The limit | What happens, and what to do |
|---|---|---|
| Apify Instagram | Free monthly credit per account, about 5 US dollars | A spent account answers 402 and the tool rolls to the next token automatically. Add more as `APIFY_API_TOKEN_2`, `APIFY_API_TOKEN_3`. Free accounts are unlimited to make |
| Gemini, watching video | About 20 requests a day per key | It falls back to the video's words, and marks the breakdown as not watched. Wait for the reset, or add a second key from another Google project as `GEMINI_API_KEYS=key1,key2` |
| Gemini, model busy | Occasional 503 "high demand" | It waits, retries, then tries a second free model. If it still cannot, it falls back to the words. Nothing to do |
| Groq, writing | About 1,000 requests a day, and 8,000 tokens a minute | A per minute limit makes it wait a few seconds and carry on. A spent day says so plainly. Add a second key as `GROQ_API_KEYS=key1,key2` |
| Groq, transcribing | 2,000 a day, 20 a minute | Same behaviour |
| YouTube, reading channels | 10,000 units a day, and reading a channel costs 1 | You will not hit this |
| YouTube, searching | About 100 a day for the whole key | Only `find` uses it. Track by handle instead until it resets at midnight Pacific |

A spent free allowance is not a fault. The tool says which one ran out and when it resets. Do not
go looking for a bug, and never reach for a paid key.

## What it costs, and how to keep it cheap

Reading one Instagram post costs about 0.0027 US dollars. Nothing else costs anything.

- A weekly scan of three creators at fifteen posts each is about 0.12 US dollars.
- Ten clients scanned weekly for a month is about five dollars, which is one free Apify account.

To keep it down:

- Use the default of 15 posts. You only need more the first time you track someone.
- Track creators that actually post. Reading a dormant account costs the same as a live one.
- Track YouTube channels wherever you can. YouTube reading is free, so a YouTube-heavy roster is a
  free roster.
- Scan weekly, not daily. Nothing meaningful changes in a day, and the 72 hour rule means the
  newest posts are not judged yet anyway.
- `scan` prints the estimate before it spends, and refuses anything over a dollar without `--yes`.

## When Instagram returns nothing

This happens, and it is usually not a bug. The tool says which handle came back empty.

1. **Check the handle.** Open `https://www.instagram.com/<handle>/` in a browser. If it 404s, the
   handle is wrong or they renamed. Fix it in `clients/<client>/creators.json` and scan again.
2. **The account is private.** Nothing can be read. Take it off the list.
3. **They have not posted recently.** Nothing to read. Leave them, or take them off.
4. **Every Apify account is spent.** The error says so explicitly and mentions 402. Add another free
   token.

A failed lookup still costs about a third of a penny, because Apify charges for the attempt. It is
worth fixing a wrong handle rather than scanning past it every week.

If Instagram is proving painful for a client, lean on YouTube. It is free, it is more reliable, and
the same creators are usually on both.

## Rules you do not break

**Never invent a number about a client.** Not a rounded one, not a plausible one, not one borrowed
from the video being copied. Every figure in a hook or a script has to appear in that client's
profile, and the tool checks it in code after the model answers, digits and words alike. If you
catch one that slipped through, take it out. A made up "we have saved customers thousands" on a real
business's Instagram is a lie with their name on it, published by them, because of you.

**Never present a breakdown as watched when it was not.** Every breakdown says how it was made:
watched, read from the words, or read from the caption only. Keep that line when you pass it on.
A caption-only breakdown is not allowed to describe anything on screen, and the tool strips it if
the model tries.

**Never send a client hooks you have not read.** The tool throws away the bad ones and tells you
why, but the last judgement of whether their client would actually say a line out loud is yours.

**Never fill in a `[bracket]`.** It is there because the profile does not have that fact. Ask the
client.

**Say what something cost.** The report has a costs line. Leave it in.

## Files, if you need to look

```
tools/content-research/
  research.ts          every command routes from here
  lib/                 the logic, one file per job
  commands/            one file per command
  tests/               243 tests over the maths, the guards and the dashboard mapping
  clients/<name>/      one folder per client, plain JSON and markdown, not committed
  examples/            a real report the tool produced
```

To stop watching a creator, open `clients/<name>/creators.json` and delete their block. To change
what the tool believes about a client, edit `clients/<name>/profile.md`.
