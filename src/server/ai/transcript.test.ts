import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db", () => ({
  getTenantDb: vi.fn(async () => ({
    chatSession: { findFirst, create },
    chatMessage: { count },
  })),
}));

import { findOrCreateBrainSession, nextOrderIndex } from "./transcript";

beforeEach(() => vi.clearAllMocks());

describe("findOrCreateBrainSession", () => {
  it("returns the existing session id when one already records this conversation", async () => {
    findFirst.mockResolvedValue({ id: "sess_1" });
    expect(await findOrCreateBrainSession("c1")).toBe("sess_1");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a session storing the conversationId when none exists", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "sess_new" });
    const id = await findOrCreateBrainSession("c2", { surface: "homepage-widget" });
    expect(id).toBe("sess_new");
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.data.metadata).toMatchObject({ conversationId: "c2", surface: "homepage-widget" });
  });

  it("returns null on a db error (best-effort)", async () => {
    findFirst.mockRejectedValue(new Error("db down"));
    expect(await findOrCreateBrainSession("c3")).toBeNull();
  });
});

describe("nextOrderIndex", () => {
  it("returns the message count for the session", async () => {
    count.mockResolvedValue(4);
    expect(await nextOrderIndex("sess_1")).toBe(4);
  });

  it("returns 0 for a null session", async () => {
    expect(await nextOrderIndex(null)).toBe(0);
  });
});
