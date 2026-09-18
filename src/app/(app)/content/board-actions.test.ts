import { beforeEach, describe, expect, it, vi } from "vitest";

// board-actions is a "use server" module; in a plain vitest run the directive is inert and the
// exports are ordinary async functions. We mock the auth gate, the cache revalidation, and the
// settings loader (which otherwise pulls the request-scoped Supabase server client) so these tests
// exercise the action logic (the id guard, the stage whitelist, and the member-scoped delete)
// without a database or a session.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/creator/settings", () => ({ loadCreatorSettings: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { createCard, deleteCard } from "./board-actions";

type DeleteChain = {
  delete: () => DeleteChain;
  eq: (col: string, val: unknown) => DeleteChain;
  then: (res: (v: { error: unknown }) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
};

// A minimal thenable Supabase stand-in that records the delete().eq().eq() chain and resolves to a
// preset { error }.
function fakeSupabase(result: { error: unknown }) {
  const eqCalls: [string, unknown][] = [];
  const fromTables: string[] = [];
  let deletes = 0;
  const chain: DeleteChain = {
    delete() {
      deletes += 1;
      return chain;
    },
    eq(col, val) {
      eqCalls.push([col, val]);
      return chain;
    },
    then(res, rej) {
      return Promise.resolve(result).then(res, rej);
    },
  };
  const client = {
    from(table: string) {
      fromTables.push(table);
      return chain;
    },
  };
  return { client, calls: { get eqCalls() { return eqCalls; }, get deletes() { return deletes; }, get fromTables() { return fromTables; } } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteCard", () => {
  it("rejects a missing id before touching auth", async () => {
    const r = await deleteCard("");
    expect(r).toEqual({ ok: false, error: "Missing card id" });
    expect(getAuthContext).not.toHaveBeenCalled();
  });

  it("rejects when there is no active workspace", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ supabase: {}, agencyId: null } as never);
    const r = await deleteCard("card-1");
    expect(r).toEqual({ ok: false, error: "No active workspace" });
  });

  it("hard-deletes, scoped to id AND agency, and revalidates", async () => {
    const sb = fakeSupabase({ error: null });
    vi.mocked(getAuthContext).mockResolvedValue({ supabase: sb.client, agencyId: "agency-9" } as never);

    const r = await deleteCard("card-1");

    expect(r).toEqual({ ok: true });
    expect(sb.calls.fromTables).toEqual(["content_cards"]);
    expect(sb.calls.deletes).toBe(1);
    // both filters present: the row id and the tenant scope (defense in depth over RLS)
    expect(sb.calls.eqCalls).toContainEqual(["id", "card-1"]);
    expect(sb.calls.eqCalls).toContainEqual(["agency_id", "agency-9"]);
    expect(revalidatePath).toHaveBeenCalledWith("/content");
  });

  it("surfaces a database error and does not revalidate", async () => {
    const sb = fakeSupabase({ error: { message: "delete failed" } });
    vi.mocked(getAuthContext).mockResolvedValue({ supabase: sb.client, agencyId: "agency-9" } as never);

    const r = await deleteCard("card-1");

    expect(r).toEqual({ ok: false, error: "delete failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createCard stage whitelist", () => {
  it("rejects a stage outside the six-stage set before touching auth", async () => {
    const r = await createCard({ title: "x" }, "done");
    expect(r).toEqual({ ok: false, error: "Invalid stage" });
    expect(getAuthContext).not.toHaveBeenCalled();
  });
});
