# Start here

This tool finds the posts that are beating their own creator's normal numbers, works out exactly
why they worked, and turns that into hooks and scripts written for one of your clients.

Ten minutes, four free accounts, then a real run on a real client.

The fastest path is to open this folder in Claude Code and say:

> set me up for content research

Claude reads SKILL.md, checks what you have, and walks you through the rest. If you would rather
drive it yourself, it is five steps.

## Before you start: you may not need this

This tool sits inside the Settoku OS dashboard. If you have that dashboard deployed, the same thing
is already in it. Open the Content page, go to the Research tab, and you get the standout videos with their cover images, the
breakdown of any video, hooks in your client's voice, saving a hook or writing a script straight
onto your Board, the creator finder and the draft scorer. It uses the same free keys as this tool
and puts everything where you already work.

This command line tool is still the right choice when you have not deployed the dashboard yet, when
you want a written report as a file to send a client, or when you are doing something big enough that a browser
tab would give up on it: a deep scan of thirty accounts, or a batch of breakdowns in one go.

Both write into the same place, so nothing is lost either way.

---

## 1. Get the four free keys (about eight minutes)

All four are free. None of them asks for a card.

| Key | What it actually does for you | Where |
|---|---|---|
| Apify | Reads the recent posts of the Instagram accounts you watch. The only one that can cost money, and it comes out of a free monthly credit first | https://console.apify.com/sign-up then Settings, Integrations |
| Groq | Writes the hooks and the scripts, and turns a video's audio into text | https://console.groq.com/keys |
| Gemini | Watches the video itself, so the breakdown is about what is really on screen | https://aistudio.google.com/apikey |
| YouTube | Reads YouTube channels and finds creators by niche | https://console.cloud.google.com/apis/library/youtube.googleapis.com then Credentials, Create API key |

The YouTube one has one extra click: on that page press **Enable** first, then go to Credentials
and press **Create credentials**, then **API key**. Copy what it gives you.

## 2. Put them in a file

In this folder, copy `.env.example` to a new file called `.env`, and paste each key in:

```
APIFY_API_TOKEN=apify_api_your_real_token
GROQ_API_KEY=gsk_your_real_key
GEMINI_API_KEY=AIza_your_real_key
YOUTUBE_API_KEY=AIza_your_real_key
```

`.env` is never committed. Nobody else sees it.

## 3. Check it worked (free, ten seconds)

```bash
npm install
npx tsx research.ts setup
```

It tells you which keys it can see, what each one is for, how much free Apify credit is left, and
exactly where to get anything missing. It runs no search and spends nothing.

## 4. Add your first client

```bash
npx tsx research.ts client add "Their Business Name"
```

It asks you five questions, or writes you a blank file to fill in later. **Answer them properly.**
Everything the tool writes about that business comes from this file and nothing else. The section
that matters most is "What they can show on camera": the desk, the screen recording, the before and
after, the moment a client gets it. That is where every good hook comes from.

If you leave it blank the tool will not guess. It writes hooks with `[brackets]` where the client's
own details go, and tells you what to ask them. That is deliberate. A made up detail about a real
business is a lie published in their name.

## 5. Your first real run

Watch two or three accounts your client's customers already follow:

```bash
npx tsx research.ts track their-business-name someinstagramhandle "@SomeYouTubeChannel"
```

Not sure who to watch? Let it find them:

```bash
npx tsx research.ts find their-business-name "what their customers would search for"
```

Then read everybody's recent posts and see which ones beat their own normal:

```bash
npx tsx research.ts scan their-business-name
```

It tells you what that will cost before it spends anything. Three creators at fifteen posts each is
about twelve pence.

Then, in order:

```bash
npx tsx research.ts report their-business-name --print     # the standouts, ranked
npx tsx research.ts breakdown their-business-name 1        # why the top one worked
npx tsx research.ts hooks their-business-name 1            # six hooks in your client's voice
npx tsx research.ts script their-business-name 1           # the full script
npx tsx research.ts score their-business-name <the file it saved>
```

That is the whole loop. Repeat it weekly per client.

## 6. Optional: put it in your dashboard

If you have deployed this dashboard, one more command sends everything into it:

```bash
npx tsx research.ts sync their-business-name --workspace <that client's workspace id>
```

Open the Content page afterwards and it is all there:

- **Creators, Roster**: the competitors you track.
- **Creators, What it found**: the standouts, their numbers, and why each one worked.
- **Creators, Run history**: what your last scan read.
- **Board, Ideas**: one card per hook.
- **Board, Scripted**: the script. Open the **Record** tab and film straight off it.
- **Knowledge**: the write up, which your dashboard chat can read.

Run it again next week and it updates rather than duplicating. You need two more lines in `.env`
first, and the workspace id. See README.md.

---

## What it costs

Reading Instagram costs about a third of a penny a post, from Apify's free monthly credit. A normal
weekly scan of three creators is about twelve pence. Everything else, YouTube, watching the videos,
writing the hooks and the scripts, is free.

## When something is not right

Run `npx tsx research.ts setup` first. It is the fastest way to find out what is missing.

Every command that could cost money says so before it does. Nothing in here will ever use a paid
key, even if you have one sitting in your `.env`.
