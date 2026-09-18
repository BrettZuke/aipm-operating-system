// Writing the research into the student's own dashboard, into the tables its Content page already
// draws, so the work turns up where they are already looking.
//
// After a sync, in their dashboard:
//   Creators, Roster            the competitors being watched (content_creators)
//   Creators, What it found     the standouts, with the numbers and the analysis (content_outliers)
//   Creators, Run history       what the last scan read and found (content_machine_runs)
//   Board, Ideas                one card per hook (content_cards, stage ideas)
//   Board, Scripted / Record    the script, laid out so Record can film from it (stage scripted)
//   Knowledge                   one Brain doc per client with the standouts and the patterns
//
// Two rules hold all of it together. Every read and every write spells out the workspace id, so
// research for one client can never reach another client's workspace. And a second sync updates
// what is already there rather than adding it again: the roster matches on handle, the standouts on
// their link, the cards on the source marker this tool puts on each one.

import { rest, scope, type Dashboard } from "./dashboard";
import {
  cardsFor,
  creatorRow,
  outlierAnalysis,
  outlierRow,
  normalizeHandle,
  TOOL,
  type CardRow,
  type CreatorRow,
  type OutlierRow,
} from "./sync-map";
import { rankOutliers } from "./report";
import { parseProfile, type StoredBreakdown, type StoredScript } from "./store";
import type { Adaptation, ClientProfile, Creator, ScoredPost } from "./types";

export { DashboardError, DashboardNotConfigured, dashboardFromEnv, checkWorkspace } from "./dashboard";
export type { Dashboard } from "./dashboard";

// ------------------------------------------------------------------ the Brain

export interface KnowledgeDoc {
  id: string;
  title: string;
  content_text: string | null;
  updated_at?: string;
}

export async function findDocs(db: Dashboard, title: string): Promise<KnowledgeDoc[]> {
  const rows = (await rest(
    db,
    `knowledge_docs?select=id,title,content_text,updated_at&${scope(db)}&title=eq.${encodeURIComponent(title)}&order=updated_at.desc`,
  )) as KnowledgeDoc[] | null;
  return rows ?? [];
}

export function profileDocTitle(client: { name: string }): string {
  return `Client profile: ${client.name}`;
}

export function researchDocTitle(client: { name: string }): string {
  return `Competitor research: ${client.name}`;
}

/** The client profile as the Brain holds it, or null when the Brain has no doc for them. The Brain
    wins over the local file, so the workspace is the one place the client is described. */
export async function profileFromBrain(db: Dashboard, client: ClientProfile): Promise<ClientProfile | null> {
  const docs = await findDocs(db, profileDocTitle(client));
  const text = docs[0]?.content_text?.trim();
  if (!text) return null;
  const parsed = parseProfile(client.slug, text.startsWith("#") ? text : `# ${client.name}\n\n${text}`);
  // A doc with none of the headings filled in is worse than the local file, so it is not used.
  if (!parsed.who_they_help && !parsed.what_they_sell && !parsed.proof) return null;
  return { ...parsed, name: client.name, source: "brain" };
}

/** The research doc's body: the standouts, their patterns, and what to copy. */
export function researchDocBody(args: {
  client: ClientProfile;
  posts: ScoredPost[];
  breakdowns: Map<string, StoredBreakdown>;
  at: Date;
}): string {
  const outliers = rankOutliers(args.posts);
  const out: string[] = [];
  out.push(`Competitor research for ${args.client.name}, last updated ${args.at.toISOString().slice(0, 10)}.`);
  out.push("");
  out.push(
    `${args.posts.length} recent posts read across ${new Set(args.posts.map((p) => p.creator)).size} creators. ` +
      `A standout is a post that beat its own creator's normal by 2x or more.`,
  );
  out.push("");
  if (outliers.length === 0) {
    out.push("No standouts in the last scan. The accounts being watched are posting steadily rather than hitting.");
  }
  outliers.slice(0, 15).forEach((p, i) => {
    const b = args.breakdowns.get(p.url)?.breakdown;
    const unit = p.metric === "engagement" ? "engagement" : "views";
    out.push(`${i + 1}. ${b?.title ?? p.caption?.split("\n")[0]?.slice(0, 70) ?? "Untitled post"}`);
    out.push(`   ${p.creator} on ${p.platform === "youtube" ? "YouTube" : "Instagram"}, ${Math.round(p.score ?? 0).toLocaleString("en-US")} ${unit}, ${p.multiple}x their normal.`);
    out.push(`   ${p.url}`);
    if (b?.hook.spoken) out.push(`   Opens with: "${b.hook.spoken}"`);
    else if (b?.hook.on_screen) out.push(`   On screen first: "${b.hook.on_screen}"`);
    if (b?.hook_type) out.push(`   Hook type: ${b.hook_type}${b.hook_template ? `. Reusable as: ${b.hook_template}` : ""}`);
    if (b?.why_it_holds_attention) out.push(`   Why people stayed: ${b.why_it_holds_attention}`);
    if (b?.pattern_you_can_use) out.push(`   What to copy: ${b.pattern_you_can_use}`);
    out.push("");
  });
  const patterns = [...new Set([...args.breakdowns.values()].map((b) => b.breakdown.pattern_you_can_use).filter((p): p is string => !!p))];
  if (patterns.length) {
    out.push("Patterns worth reusing:");
    for (const p of patterns) out.push(`- ${p}`);
    out.push("");
  }
  out.push("Written by the content research tool. Every number came from a live read of the public post.");
  return out.join("\n");
}

/** Write or update the one research doc for this client. Never a second copy. */
export async function upsertResearchDoc(db: Dashboard, client: ClientProfile, body: string): Promise<{ id: string; created: boolean }> {
  const title = researchDocTitle(client);
  const existing = await findDocs(db, title);
  const now = new Date().toISOString();
  if (existing.length > 0) {
    await rest(db, `knowledge_docs?id=eq.${existing[0].id}&${scope(db)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ content_text: body, updated_at: now, source_type: TOOL }),
    });
    return { id: existing[0].id, created: false };
  }
  const rows = (await rest(db, "knowledge_docs?select=id", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      agency_id: db.agencyId,
      title,
      content_text: body,
      source_type: TOOL,
      metadata: { tool: TOOL, client: client.slug },
      created_at: now,
      updated_at: now,
    }),
  })) as { id: string }[] | null;
  const id = rows?.[0]?.id;
  if (!id) throw new Error("The knowledge doc was not created and the dashboard did not say why");
  return { id, created: true };
}

// ------------------------------------------------------------------ the roster

export interface UpsertCount {
  inserted: number;
  updated: number;
}

/**
 * The tracked competitors, onto the Roster.
 *
 * The roster's unique key is the handle with case ignored, and that is an expression index, which a
 * bulk upsert cannot target. So each creator is looked up first, case-insensitively, and then
 * updated or inserted. That also means a creator the student added by hand keeps its own role and
 * status: only the counts, the name and the last scan time are refreshed.
 */
export async function syncCreators(db: Dashboard, creators: CreatorRow[]): Promise<UpsertCount> {
  let inserted = 0;
  let updated = 0;
  for (const row of creators) {
    const found = (await rest(
      db,
      `content_creators?select=id,role,status&${scope(db)}&handle=ilike.${encodeURIComponent(row.handle)}&limit=1`,
    )) as { id: string; role: string; status: string }[] | null;
    if (found?.[0]) {
      // Their own choice of role and status is theirs. Pausing a creator in the dashboard has to
      // survive the next sync, or the pause button does nothing.
      const { role, status, agency_id, handle, note, ...rest_ } = row;
      void role;
      void status;
      void agency_id;
      void handle;
      void note;
      await rest(db, `content_creators?id=eq.${found[0].id}&${scope(db)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify(rest_),
      });
      updated++;
    } else {
      await rest(db, "content_creators", { method: "POST", prefer: "return=minimal", body: JSON.stringify(row) });
      inserted++;
    }
  }
  return { inserted, updated };
}

// ------------------------------------------------------------------ the standouts

/** The standouts, onto "What it found". Upserted on the link, which really is a unique key here, so
    one call handles both new and returning posts. Only the maths columns are sent, so a re-sync can
    never blank an analysis that is already on the row. */
export async function syncOutliers(db: Dashboard, rows: OutlierRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await rest(db, "content_outliers?on_conflict=agency_id,url", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(rows),
  });
  return rows.length;
}

/** The analysis half, written only for the posts that have a breakdown. An update, never an insert,
    so a post that somehow is not there yet is skipped rather than half created. */
export async function syncOutlierAnalysis(db: Dashboard, url: string, breakdown: StoredBreakdown): Promise<void> {
  await rest(db, `content_outliers?${scope(db)}&url=eq.${encodeURIComponent(url)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify(outlierAnalysis(breakdown.breakdown)),
  });
}

// ------------------------------------------------------------------ the board

/** The next free position at the bottom of a board column, so a new card lands after what is there
    rather than on top of it. */
export async function nextPosition(db: Dashboard, stage: string): Promise<number> {
  const rows = (await rest(
    db,
    `content_cards?select=position&${scope(db)}&stage=eq.${encodeURIComponent(stage)}&order=position.desc&limit=1`,
  )) as { position: number }[] | null;
  const last = rows?.[0]?.position;
  return typeof last === "number" && Number.isFinite(last) ? last + 1 : 0;
}

/** Hooks and scripts onto the board. Matched on the source marker, which is this tool's own key,
    so running sync twice moves nothing and duplicates nothing. */
export async function syncCards(db: Dashboard, cards: CardRow[]): Promise<UpsertCount> {
  let inserted = 0;
  let updated = 0;
  const nextBy = new Map<string, number>();
  for (const card of cards) {
    const found = (await rest(
      db,
      `content_cards?select=id&${scope(db)}&source=eq.${encodeURIComponent(card.source)}&limit=1`,
    )) as { id: string }[] | null;
    if (found?.[0]) {
      const { agency_id, position, ...rest_ } = card;
      void agency_id;
      void position;
      await rest(db, `content_cards?id=eq.${found[0].id}&${scope(db)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        // stage is left alone on an update: a student who dragged a card to Filming keeps it there.
        body: JSON.stringify({ ...rest_, stage: undefined }),
      });
      updated++;
      continue;
    }
    if (!nextBy.has(card.stage)) nextBy.set(card.stage, await nextPosition(db, card.stage));
    const position = nextBy.get(card.stage)!;
    nextBy.set(card.stage, position + 1);
    await rest(db, "content_cards", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ ...card, position }),
    });
    inserted++;
  }
  return { inserted, updated };
}

// ------------------------------------------------------------------ run history

export interface RunSummary {
  scanAt: string;
  creatorsRead: number;
  creatorsSkipped: number;
  outliersFound: number;
  outliersAnalysed: number;
  scriptsWritten: number;
  costUsd: number;
}

/** Two rows on Run history, one for the reading and one for the maths, matching the two stages the
    dashboard's own flow map expects. Written once per scan: a second sync of the same scan adds
    nothing, because the scan's own timestamp is on the row. */
export async function syncRun(db: Dashboard, slug: string, run: RunSummary): Promise<boolean> {
  const existing = (await rest(
    db,
    `content_machine_runs?select=id&${scope(db)}&detail->>tool=eq.${TOOL}&detail->>client=eq.${encodeURIComponent(slug)}&detail->>scan_at=eq.${encodeURIComponent(run.scanAt)}&limit=1`,
  )) as { id: string }[] | null;
  if (existing?.[0]) return false;
  const detail = { tool: TOOL, client: slug, scan_at: run.scanAt, cost_usd: run.costUsd };
  await rest(db, "content_machine_runs", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify([
      {
        agency_id: db.agencyId,
        stage: "scrape",
        ran_at: run.scanAt,
        creators_read: run.creatorsRead,
        creators_skipped: run.creatorsSkipped,
        outliers_found: 0,
        outliers_analysed: 0,
        scripts_written: 0,
        detail,
      },
      {
        agency_id: db.agencyId,
        stage: "parse",
        ran_at: run.scanAt,
        creators_read: run.creatorsRead,
        creators_skipped: run.creatorsSkipped,
        outliers_found: run.outliersFound,
        outliers_analysed: run.outliersAnalysed,
        scripts_written: run.scriptsWritten,
        detail,
      },
    ]),
  });
  return true;
}

// ------------------------------------------------------------------ building the rows

export interface SyncPlan {
  creators: CreatorRow[];
  outliers: OutlierRow[];
  cards: CardRow[];
  analysed: { url: string; breakdown: StoredBreakdown }[];
}

/** Everything this client's work turns into, worked out before anything is written. Pure, so what
    goes to the dashboard is decided in one place and tested. */
export function buildPlan(args: {
  agencyId: string;
  client: ClientProfile;
  creators: Creator[];
  posts: ScoredPost[];
  breakdowns: Map<string, StoredBreakdown>;
  hooks: Map<string, { postUrl: string; adaptation: Adaptation }>;
  scripts: Map<string, StoredScript>;
  at: Date;
}): SyncPlan {
  const handleOf = new Map(args.creators.map((c) => [c.name, normalizeHandle(c.handle ?? c.name)]));
  const outliers = rankOutliers(args.posts);
  const byId = new Map(args.posts.map((p) => [`${p.platform === "youtube" ? "yt" : "ig"}-${p.external_id}`, p]));

  const cards: CardRow[] = [];
  const ids = new Set([...args.hooks.keys(), ...args.scripts.keys()]);
  for (const postId of [...ids].sort()) {
    const post = byId.get(postId);
    if (!post) continue;
    const stored = args.scripts.get(postId);
    cards.push(
      ...cardsFor({
        agencyId: args.agencyId,
        slug: args.client.slug,
        postId,
        post,
        breakdown: args.breakdowns.get(post.url)?.breakdown ?? null,
        adaptation: args.hooks.get(postId)?.adaptation ?? null,
        script: stored
          ? { hook: stored.hook, onScreen: stored.on_screen, spoken: stored.script, cta: stored.cta, shots: stored.shot_list }
          : null,
        at: args.at,
      }),
    );
  }

  return {
    creators: args.creators.map((creator) => creatorRow({ agencyId: args.agencyId, creator, clientName: args.client.name, posts: args.posts, at: args.at })),
    outliers: outliers.map((p) => outlierRow(args.agencyId, p, handleOf.get(p.creator) ?? null)),
    cards,
    analysed: outliers
      .map((p) => ({ url: p.url, breakdown: args.breakdowns.get(p.url) }))
      .filter((x): x is { url: string; breakdown: StoredBreakdown } => !!x.breakdown),
  };
}

// ------------------------------------------------------------------ taking it back out

export interface RemovedCounts {
  creators: number;
  outliers: number;
  cards: number;
  runs: number;
  docs: number;
}

/** Everything this tool put in one workspace for one client, removed again.
 *
 * Cards and run history carry this tool's own marker, so those are exact. The roster and the
 * standouts have no spare column to mark, so they are matched on the handles and the links this
 * client's own research produced, which is stated in the docs so nobody is surprised. */
export async function removeToolRows(
  db: Dashboard,
  client: ClientProfile,
  handles: string[],
  urls: string[],
): Promise<RemovedCounts> {
  const cards = (await rest(db, `content_cards?select=id&${scope(db)}&source=like.${encodeURIComponent(`${TOOL}:${client.slug}:%`)}`)) as { id: string }[] | null;
  for (const row of cards ?? []) {
    await rest(db, `content_cards?id=eq.${row.id}&${scope(db)}`, { method: "DELETE", prefer: "return=minimal" });
  }

  let outliers = 0;
  for (const url of urls) {
    const found = (await rest(db, `content_outliers?select=id&${scope(db)}&url=eq.${encodeURIComponent(url)}`)) as { id: string }[] | null;
    for (const row of found ?? []) {
      await rest(db, `content_outliers?id=eq.${row.id}&${scope(db)}`, { method: "DELETE", prefer: "return=minimal" });
      outliers++;
    }
  }

  let creators = 0;
  for (const handle of handles) {
    const found = (await rest(db, `content_creators?select=id&${scope(db)}&handle=ilike.${encodeURIComponent(handle)}`)) as { id: string }[] | null;
    for (const row of found ?? []) {
      await rest(db, `content_creators?id=eq.${row.id}&${scope(db)}`, { method: "DELETE", prefer: "return=minimal" });
      creators++;
    }
  }

  const runs = (await rest(db, `content_machine_runs?select=id&${scope(db)}&detail->>tool=eq.${TOOL}&detail->>client=eq.${encodeURIComponent(client.slug)}`)) as { id: string }[] | null;
  for (const row of runs ?? []) {
    await rest(db, `content_machine_runs?id=eq.${row.id}&${scope(db)}`, { method: "DELETE", prefer: "return=minimal" });
  }

  const docs = await findDocs(db, researchDocTitle(client));
  for (const doc of docs) {
    await rest(db, `knowledge_docs?id=eq.${doc.id}&${scope(db)}`, { method: "DELETE", prefer: "return=minimal" });
  }

  return { creators, outliers, cards: (cards ?? []).length, runs: (runs ?? []).length, docs: docs.length };
}

/** What this tool currently has in one workspace, for the count it prints at the end. */
export async function countToolRows(db: Dashboard, client: ClientProfile, handles: string[], urls: string[]): Promise<RemovedCounts> {
  const count = async (path: string): Promise<number> => (((await rest(db, path)) as unknown[] | null) ?? []).length;
  let outliers = 0;
  for (const url of urls) outliers += await count(`content_outliers?select=id&${scope(db)}&url=eq.${encodeURIComponent(url)}`);
  let creators = 0;
  for (const handle of handles) creators += await count(`content_creators?select=id&${scope(db)}&handle=ilike.${encodeURIComponent(handle)}`);
  return {
    creators,
    outliers,
    cards: await count(`content_cards?select=id&${scope(db)}&source=like.${encodeURIComponent(`${TOOL}:${client.slug}:%`)}`),
    runs: await count(`content_machine_runs?select=id&${scope(db)}&detail->>tool=eq.${TOOL}&detail->>client=eq.${encodeURIComponent(client.slug)}`),
    docs: (await findDocs(db, researchDocTitle(client))).length,
  };
}
