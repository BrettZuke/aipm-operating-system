"use client";

// Standout videos: every post from the creators you track that beat that creator's own normal, with
// the newest and strongest first.
//
// Changing a filter or opening a video never reloads the page. The Content page renders every tab
// on the server, so a navigation here would freeze the whole thing for seconds. Instead a filter
// asks for one page of results and writes itself into the address, so a copied link reopens the
// same view, and opening a video swaps the grid for its detail with the summary already in hand.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, Search, Sparkles, Users } from "lucide-react";
import type { Creator } from "@/lib/content/creators";
import type { PostDetail } from "@/lib/research/detail";
import { DEFAULT_FEED_FILTERS, FEED_SORTS, FEED_WINDOWS, type FeedFilters, type FeedPost, type FeedSort } from "@/lib/research/feed";
import type { JobView } from "@/lib/research/jobs";
import type { KeyCheck } from "@/lib/research/keys";
import {
  ageText,
  compactNumber,
  FEED_FIRST_VISIBLE,
  FEED_STEP,
  filtersToParams,
  jobIsRunning,
  KIND_LABEL,
  multipleText,
  PLATFORM_LABEL,
  POLL_EVERY_MS,
  pollDecision,
  revealPlan,
  SCAN_MODE_LABEL,
  scanStartedText,
  scanStatus,
  SHOW_LABEL,
  SORT_LABEL,
  withFormatFor,
  formatsFor,
} from "@/lib/research/view";
import { loadMorePostsAction } from "./ai-actions";
import { postDetailAction } from "./feed-actions";
import { jobStatusAction, scanEstimateAction, scanNowAction } from "./scan-actions";
import { PostDetailView } from "./post-detail";
import { ErrorLine, MissingKeys, PrimaryButton, Progress, QuietButton, ResearchEmpty, SelectPill, Thumb, replaceQuery, scrollParent, useNow, OFFLINE } from "./ui";
import { usdText } from "@/lib/research/apify";

type ScanMode = "recent" | "full";

export function FeedView({
  creators,
  initialFilters,
  initialPage,
  totalPosts,
  initialJob,
  initialLastReadAt,
  initialOpen,
  missingKeys,
  renderedAt,
  onOpenChange,
  onFindCreators,
}: {
  creators: Creator[];
  initialFilters: FeedFilters;
  initialPage: { posts: FeedPost[]; nextCursor: number | null };
  totalPosts: number;
  initialJob: JobView | null;
  initialLastReadAt: string | null;
  initialOpen: { post: FeedPost; detail: PostDetail } | null;
  missingKeys: KeyCheck[];
  renderedAt: number;
  onOpenChange: (postId: string | null) => void;
  onFindCreators: () => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [visible, setVisible] = useState(FEED_FIRST_VISIBLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [opening, setOpening] = useState<string | null>(null);
  const [job, setJob] = useState(initialJob);
  const [mode, setMode] = useState<ScanMode>("recent");
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState(0);
  const [estimate, setEstimate] = useState<{ instagramCreators: number; youtubeCreators: number; estimateUsd: number; capUsd: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollBack = useRef(0);
  const nowMs = useNow(renderedAt);

  const running = jobIsRunning(job, nowMs);
  const status = scanStatus(job, initialLastReadAt, nowMs);

  // What a scan would cost, read once per mode so the button can say it before anything is spent.
  useEffect(() => {
    let live = true;
    scanEstimateAction({ mode })
      .then((answer) => {
        if (live && answer.ok) setEstimate(answer);
      })
      .catch(() => {
        // A price we could not read is shown as not known, never as free.
        if (live) setEstimate(null);
      });
    return () => {
      live = false;
    };
  }, [mode]);

  const refresh = useCallback(async (next: FeedFilters, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const answer = await loadMorePostsAction({ filters: next, cursor: 0 });
      if (!answer.ok) setError(answer.error);
      else {
        setPosts(answer.posts);
        setCursor(answer.nextCursor);
        setVisible(FEED_FIRST_VISIBLE);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setLoading(false);
    }
  }, []);

  // While a scan is running, ask how it is going. This is also how the result arrives when there is
  // no public address for Apify to call back to.
  useEffect(() => {
    if (!running) return;
    const startedMs = Date.now();
    let stopped = false;
    const tick = async () => {
      const decision = pollDecision({ running: true, visible: document.visibilityState === "visible", startedMs, nowMs: Date.now() });
      if (decision === "stop") {
        stopped = true;
        return;
      }
      if (decision === "wait") return;
      try {
        const answer = await jobStatusAction();
        if (answer.ok) {
          setJob(answer.job);
          if (answer.finished) {
            stopped = true;
            await refresh(filters, true);
          }
        }
      } catch {
        // A check that does not go through is not worth showing: the next one tries again.
      }
    };
    const id = window.setInterval(() => {
      if (!stopped) void tick();
    }, POLL_EVERY_MS);
    void tick();
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const change = useCallback(
    (next: FeedFilters) => {
      setFilters(next);
      replaceQuery((params) => filtersToParams(params, next));
      void refresh(next);
    },
    [refresh],
  );

  const showMore = useCallback(async () => {
    const plan = revealPlan({ visible, loaded: posts.length, hasMore: cursor !== null, step: FEED_STEP });
    setVisible(plan.nextVisible);
    if (!plan.fetch || cursor === null) return;
    setLoading(true);
    try {
      const answer = await loadMorePostsAction({ filters, cursor });
      if (!answer.ok) setError(answer.error);
      else {
        setPosts((p) => [...p, ...answer.posts]);
        setCursor(answer.nextCursor);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setLoading(false);
    }
  }, [visible, posts.length, cursor, filters]);

  const openPost = useCallback(
    async (post: FeedPost) => {
      scrollBack.current = scrollParent(gridRef.current)?.scrollTop ?? 0;
      setOpening(post.id);
      setError(null);
      try {
        const answer = await postDetailAction({ postId: post.id });
        if (!answer.ok) setError(answer.error);
        else {
          setOpen({ post: answer.post, detail: answer.detail });
          onOpenChange(post.id);
          replaceQuery((params) => {
            params.set("post", post.id);
          });
          scrollParent(gridRef.current)?.scrollTo({ top: 0 });
        }
      } catch {
        setError(OFFLINE);
      } finally {
        setOpening(null);
      }
    },
    [onOpenChange],
  );

  const closePost = useCallback(() => {
    setOpen(null);
    onOpenChange(null);
    replaceQuery((params) => {
      params.delete("post");
    });
    requestAnimationFrame(() => scrollParent(gridRef.current)?.scrollTo({ top: scrollBack.current }));
  }, [onOpenChange]);

  const markChanged = useCallback((postId: string, patch: { analysed?: boolean; adapted?: boolean }) => {
    setPosts((all) => all.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanStartedAt(Date.now());
    setError(null);
    setScanNote(null);
    try {
      const answer = await scanNowAction({ mode });
      if (!answer.ok) setError(answer.error);
      else {
        setScanNote(scanStartedText(answer));
        const check = await jobStatusAction();
        if (check.ok) setJob(check.job);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setScanning(false);
    }
  }, [mode]);

  const creatorOptions = useMemo(
    () => [{ value: "", label: "All creators" }, ...creators.map((c) => ({ value: c.id, label: c.name }))],
    [creators],
  );

  if (open) {
    return <PostDetailView post={open.post} detail={open.detail} nowMs={nowMs} onBack={closePost} onChanged={markChanged} />;
  }

  const shown = posts.slice(0, visible);
  const hasMore = visible < posts.length || cursor !== null;

  return (
    <div className="space-y-5" ref={gridRef}>
      <MissingKeys keys={missingKeys} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-[#F5F5F7]">Videos that beat their own creator&apos;s normal numbers.</p>
          <p className="mt-0.5 text-xs text-[#7C8595]">
            A small account&apos;s breakout counts as much as a big account&apos;s, because every video is measured against the person who posted it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-mono text-[11px] ${status.tone === "live" ? "text-[#0083FF]" : status.tone === "bad" ? "text-[#FF6466]" : "text-[#7C8595]"}`}>
            {status.text}
          </span>
          <SelectPill
            label="How far back to read"
            value={mode}
            onChange={(v) => setMode(v)}
            disabled={scanning || running}
            options={(Object.keys(SCAN_MODE_LABEL) as ScanMode[]).map((m) => ({ value: m, label: SCAN_MODE_LABEL[m] }))}
          />
          <PrimaryButton onClick={scan} busy={scanning} disabled={running} icon={RefreshCw}>
            {running ? "Scanning" : "Scan now"}
          </PrimaryButton>
        </div>
      </div>

      {estimate && estimate.instagramCreators + estimate.youtubeCreators > 0 && (
        <p className="text-xs text-[#7C8595]">
          A scan reads {estimate.instagramCreators} Instagram {estimate.instagramCreators === 1 ? "account" : "accounts"} and {estimate.youtubeCreators} YouTube{" "}
          {estimate.youtubeCreators === 1 ? "channel" : "channels"}.{" "}
          {estimate.instagramCreators > 0
            ? `YouTube is free. Instagram costs about ${usdText(estimate.estimateUsd)}, and the read carries a hard cap of ${usdText(estimate.capUsd)} that Apify itself will not spend past.`
            : "Reading YouTube is free."}
        </p>
      )}
      {scanNote && <p className="text-[13px] text-[#7BE0A5]">{scanNote}</p>}
      {running && <Progress text="Reading their recent posts" startedAt={job ? Date.parse(job.created_at) : scanStartedAt} />}
      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="flex flex-wrap items-center gap-2">
        <SelectPill
          label="Window"
          value={String(filters.window)}
          onChange={(v) => change({ ...filters, window: Number(v) as FeedFilters["window"] })}
          options={FEED_WINDOWS.map((w) => ({ value: String(w), label: `Last ${w} days` }))}
        />
        <SelectPill
          label="Platform"
          value={filters.platform ?? ""}
          onChange={(v) => change(withFormatFor(filters, (v || null) as FeedFilters["platform"]))}
          options={[{ value: "", label: "All platforms" }, { value: "instagram", label: PLATFORM_LABEL.instagram }, { value: "youtube", label: PLATFORM_LABEL.youtube }]}
        />
        <SelectPill
          label="Format"
          value={filters.format ?? ""}
          onChange={(v) => change({ ...filters, format: (v || null) as FeedFilters["format"] })}
          options={[{ value: "", label: "All formats" }, ...formatsFor(filters.platform).map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
        />
        <SelectPill
          label="Creator"
          value={filters.creatorId ?? ""}
          onChange={(v) => change({ ...filters, creatorId: v || null })}
          options={creatorOptions}
        />
        <SelectPill label="Sort" value={filters.sort} onChange={(v) => change({ ...filters, sort: v as FeedSort })} options={FEED_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))} />
        <SelectPill
          label="Show"
          value={filters.show}
          onChange={(v) => change({ ...filters, show: v as FeedFilters["show"] })}
          options={(["standouts", "all"] as const).map((s) => ({ value: s, label: SHOW_LABEL[s] }))}
        />
        <span className="font-mono text-[11px] text-[#5C6472]">{loading ? "loading" : `${posts.length} shown`}</span>
      </div>

      {shown.length === 0 ? (
        <EmptyFeed creators={creators.length} totalPosts={totalPosts} running={running} filters={filters} onFindCreators={onFindCreators} onReset={() => change(DEFAULT_FEED_FILTERS)} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((post) => (
              <PostCard key={post.id} post={post} nowMs={nowMs} busy={opening === post.id} onOpen={() => openPost(post)} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <QuietButton onClick={showMore} busy={loading}>
                Show more
              </QuietButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PostCard({ post, nowMs, busy, onOpen }: { post: FeedPost; nowMs: number; busy: boolean; onOpen: () => void }) {
  const multiple = multipleText(post.multiple);
  const unit = post.metric === "engagement" ? "engagement" : "views";
  const headline = compactNumber(post.metric === "engagement" ? post.score : (post.views ?? post.score));
  const age = ageText(post.posted_at, nowMs);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] transition-colors hover:border-[rgba(255,255,255,0.18)]">
      <button type="button" onClick={onOpen} disabled={busy} className="block w-full text-left" aria-label={`Open ${post.title ?? "this video"}`}>
        <div className="relative">
          <Thumb src={post.thumb_url} alt="" className="aspect-[4/5] w-full" />
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
            {KIND_LABEL[post.kind]}
          </span>
          {post.analysed && (
            // On a narrow card the words would sit on top of the format badge, so only the mark
            // shows there; the title says it either way once the video is opened.
            <span
              title="Broken down"
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-1 text-[10px] text-[#7BE0A5] sm:px-2 sm:py-0.5"
            >
              <Sparkles className="size-2.5" aria-hidden />
              <span className="hidden sm:inline">broken down</span>
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold leading-none text-[#F5F5F7]" style={{ fontFamily: "var(--font-settoku-display), Georgia, serif" }}>
              {multiple ? `${multiple}x` : "-"}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#7BE0A5]">{post.is_outlier ? "standout" : "normal"}</span>
          </div>
          <p className="line-clamp-2 text-[13px] leading-snug text-[#F5F5F7]">{post.title ?? "No title yet"}</p>
          <p className="truncate font-mono text-[11px] text-[#7C8595]">
            {headline ? `${headline} ${unit}` : unit} {post.creator?.name ? `- ${post.creator.name}` : ""} {age ? `- ${age}` : ""}
          </p>
        </div>
      </button>
      <a
        href={post.url}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        aria-label="Open the original"
        className="absolute bottom-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-black/60 text-[#A8B0BD] opacity-0 transition-opacity hover:text-[#F5F5F7] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}

function EmptyFeed({
  creators,
  totalPosts,
  running,
  filters,
  onFindCreators,
  onReset,
}: {
  creators: number;
  totalPosts: number;
  running: boolean;
  filters: FeedFilters;
  onFindCreators: () => void;
  onReset: () => void;
}) {
  if (creators === 0) {
    return (
      <ResearchEmpty icon={Users} title="Find creators to track" action={<PrimaryButton onClick={onFindCreators} icon={Search}>Find creators</PrimaryButton>}>
        Research reads the people your client&apos;s customers already watch. Search a niche on YouTube, or start from one Instagram account you know, and track the
        ones worth copying.
      </ResearchEmpty>
    );
  }
  if (running) {
    return (
      <ResearchEmpty icon={RefreshCw} title="The scan is running">
        It reads each creator&apos;s recent posts, works out what normal looks like for them, and then flags the ones that beat it. This usually takes a few minutes.
      </ResearchEmpty>
    );
  }
  if (totalPosts === 0) {
    return (
      <ResearchEmpty icon={RefreshCw} title="Run your first scan">
        Nothing has been read yet. A scan reads the recent posts of everyone on your roster, works out each creator&apos;s own normal, and shows you the videos that
        beat it. Use the Scan now button above.
      </ResearchEmpty>
    );
  }
  const narrowed = filters.show === "standouts" || filters.platform || filters.format || filters.creatorId || filters.window !== DEFAULT_FEED_FILTERS.window;
  return (
    <ResearchEmpty icon={Search} title="Nothing matches these filters" action={narrowed ? <QuietButton onClick={onReset}>Clear the filters</QuietButton> : undefined}>
      {totalPosts} videos have been read for this workspace. Widen the window, switch Show to All videos, or clear the filters to see them.
    </ResearchEmpty>
  );
}
