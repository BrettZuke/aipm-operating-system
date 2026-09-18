"use client";

// The Research tab: Standout videos, Creators, Score a draft and Runs.
//
// The server sends every sub-tab's data with the page, so switching between them is state in the
// browser written into the address, never a page load. Old links still land where they used to:
// sub=signal opens Standout videos and sub=roster opens Creators. All four stay mounted, so a
// half-written draft, a search or an open video survives a trip to another sub-tab.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabInfo } from "@/components/ui/tab-info";
import type { Creator } from "@/lib/content/creators";
import { listKey, RESEARCH_SUBS, type ResearchSub } from "@/lib/research/view";
import { CreatorsPanel } from "../creators-panel";
import RunsPanel, { type Run } from "../runs-panel";
import { CreatorFinder } from "./creator-finder";
import { DraftScorer } from "./draft-scorer";
import { FeedView } from "./feed-view";
import { LatestScan } from "./latest-scan";
import type { ResearchData } from "./research-data";
import { ErrorLine, replaceQuery } from "./ui";

const SUB_LABEL: Record<ResearchSub, string> = { feed: "Standout videos", creators: "Creators", drafts: "Score a draft", runs: "Runs" };

const SUB_INFO: Record<ResearchSub, string> = {
  feed:
    "Videos from the creators you track that beat that creator's own normal views, so a small account's breakout counts as much as a big one's. Open a video to see why it worked and turn it into your client's own version.",
  creators:
    "Find creators by niche on YouTube, or accounts like one you already know on Instagram, and track them. Everyone you track is read on each scan. Copy means their standouts drive your scripts.",
  drafts:
    "Paste a script or upload a video before you post it. It is scored on the hook, one clear idea, the payoff, the pace, the ask, and how well it matches what works in this niche, with the exact lines to change.",
  runs: "The last scan, then every pass the machine has made, newest first, including anyone it could not read. Check here if standout videos stop appearing.",
};

export function ResearchPanel({
  data,
  creators,
  workspace,
  lanes,
  runs,
}: {
  data: ResearchData;
  creators: Creator[];
  workspace: string | null;
  lanes: string[];
  runs: Run[];
}) {
  const router = useRouter();
  const [sub, setSub] = useState<ResearchSub>(data.ok ? data.sub : "feed");
  const [finderFocus, setFinderFocus] = useState(0);
  const openPostId = useRef<string | null>(data.ok ? (data.open?.post.id ?? null) : null);

  const switchSub = useCallback((next: ResearchSub) => {
    setSub(next);
    replaceQuery((params) => {
      params.set("tab", "creators");
      params.set("sub", next);
      if (next === "feed" && openPostId.current) params.set("post", openPostId.current);
      else params.delete("post");
    });
  }, []);

  const onOpenChange = useCallback((postId: string | null) => {
    openPostId.current = postId;
  }, []);

  const onFindCreators = useCallback(() => {
    switchSub("creators");
    setFinderFocus((n) => n + 1);
  }, [switchSub]);

  // Tracking somebody changes the roster and starts reading their posts, so the server data behind
  // both is asked for again. This is the one place a refresh is right: it follows a deliberate
  // action, unlike a filter, which must never reload the page.
  const onTracked = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-5">
      <nav className="flex overflow-x-auto border-b border-[rgba(255,255,255,0.06)]" aria-label="Research">
        {RESEARCH_SUBS.map((key) => {
          const active = sub === key;
          return (
            <div key={key} className="flex shrink-0 items-center">
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => switchSub(key)}
                className={`relative min-h-10 py-2 pl-4 pr-1.5 text-sm font-medium transition-colors ${active ? "text-[#F5F5F7]" : "text-[#A8B0BD] hover:text-[#F5F5F7]"}`}
              >
                {SUB_LABEL[key]}
                {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#0083FF]" />}
              </button>
              <TabInfo label={SUB_LABEL[key]} text={SUB_INFO[key]} className="mr-2" />
            </div>
          );
        })}
      </nav>

      {!data.ok ? (
        <ErrorLine>{data.error}</ErrorLine>
      ) : (
        <>
          <div hidden={sub !== "feed"}>
            <FeedView
              creators={creators}
              initialFilters={data.filters}
              initialPage={data.feed}
              totalPosts={data.totalPosts}
              initialJob={data.job}
              initialLastReadAt={data.lastReadAt}
              initialOpen={data.open}
              missingKeys={data.missingKeys}
              renderedAt={data.renderedAt}
              onOpenChange={onOpenChange}
              onFindCreators={onFindCreators}
            />
          </div>
          <div hidden={sub !== "creators"} className="space-y-5">
            <CreatorFinder focusSignal={finderFocus} onTracked={onTracked} />
            <CreatorsPanel key={listKey(creators.map((c) => c.id))} initialCreators={creators} workspace={workspace} lanes={lanes} />
          </div>
          <div hidden={sub !== "drafts"}>
            <DraftScorer initialDrafts={data.drafts} initialDraft={data.firstDraft} />
          </div>
          <div hidden={sub !== "runs"} className="space-y-5">
            <LatestScan job={data.job} nowMs={data.renderedAt} />
            <RunsPanel runs={runs} nextRun={null} />
          </div>
        </>
      )}
    </div>
  );
}
