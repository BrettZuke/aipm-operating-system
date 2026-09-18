"use server";

// The reads the Research screens make after the page has already rendered. Nothing here writes
// anything, and every read is scoped to the signed-in workspace.

import { z } from "zod";
import { loadPostDetail, type PostDetail } from "@/lib/research/detail";
import type { FeedPost } from "@/lib/research/feed";
import { actionFailure, isFail, researchContext, type Fail } from "./action-context";

/** The heavy fields one video's detail view needs: the breakdown, Make it yours, the transcript.
    A card already has everything else, so opening a video never reloads the page. */
export async function postDetailAction(input: { postId: string }): Promise<{ ok: true; post: FeedPost; detail: PostDetail } | Fail> {
  const ctx = await researchContext();
  if (isFail(ctx)) return ctx;
  const parsed = z.object({ postId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That video could not be found." };
  try {
    const found = await loadPostDetail(ctx.member, ctx.agencyId, parsed.data.postId);
    if (!found) return { ok: false, error: "That video is not in this workspace." };
    return { ok: true, ...found };
  } catch (e) {
    return actionFailure(e, "open video", ctx.agencyId);
  }
}
