import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { saveDraft, publish, getPublishedData } from "./versioning";

const T = "tenant_msfg";

type Rev = {
  id: string;
  tenantId: string;
  editableId: string;
  version: number;
  state: string;
  data: unknown;
  authorId: string | null;
  note: string | null;
};

function fakeDb(initial: { editable?: { id: string }; revisions?: Rev[] } = {}) {
  const revisions: Rev[] = initial.revisions ?? [];
  const editable = initial.editable ?? { id: "ed1" };
  return {
    editable: {
      upsert: vi.fn(async () => editable),
      findUnique: vi.fn(async () => editable),
    },
    revision: {
      findMany: vi.fn(async () => revisions),
      findFirst: vi.fn(async ({ where }: any) => {
        const matched = revisions
          .filter((r) => r.state === where.state)
          .sort((a, b) => b.version - a.version);
        return matched[0] ?? null;
      }),
      create: vi.fn(async ({ data }: any) => ({ id: "new", ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ ...revisions.find((r) => r.id === where.id), ...data })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("saveDraft", () => {
  it("creates a v1 DRAFT when none exists", async () => {
    const db = fakeDb({ revisions: [] });
    (getDb as any).mockReturnValue(db);
    await saveDraft(T, "CONFIG", "default", { brand: { shortName: "X" } }, "u1");
    expect(db.revision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: T, version: 1, state: "DRAFT", authorId: "u1" }),
    });
  });

  it("updates the existing DRAFT instead of creating a new one", async () => {
    const db = fakeDb({
      revisions: [{ id: "d1", tenantId: T, editableId: "ed1", version: 1, state: "DRAFT", data: {}, authorId: "u1", note: null }],
    });
    (getDb as any).mockReturnValue(db);
    await saveDraft(T, "CONFIG", "default", { brand: { shortName: "Y" } }, "u1");
    expect(db.revision.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1" } }));
    expect(db.revision.create).not.toHaveBeenCalled();
  });
});

describe("publish", () => {
  it("promotes the draft and archives the prior published", async () => {
    const db = fakeDb({
      revisions: [
        { id: "p1", tenantId: T, editableId: "ed1", version: 1, state: "PUBLISHED", data: {}, authorId: null, note: null },
        { id: "d2", tenantId: T, editableId: "ed1", version: 2, state: "DRAFT", data: {}, authorId: "u1", note: null },
      ],
    });
    (getDb as any).mockReturnValue(db);
    await publish(T, "CONFIG", "default", "u1");
    // draft promoted
    expect(db.revision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d2" }, data: expect.objectContaining({ state: "PUBLISHED" }) }),
    );
    // prior published archived
    expect(db.revision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: { state: "ARCHIVED" } }),
    );
  });

  it("throws when there is no draft to publish", async () => {
    const db = fakeDb({ revisions: [] });
    (getDb as any).mockReturnValue(db);
    await expect(publish(T, "CONFIG", "default", "u1")).rejects.toThrow(/no draft/i);
  });
});

describe("getPublishedData", () => {
  it("returns the published revision's data, scoped by tenantId", async () => {
    const db = fakeDb({
      revisions: [{ id: "p1", tenantId: T, editableId: "ed1", version: 1, state: "PUBLISHED", data: { ok: true }, authorId: null, note: null }],
    });
    (getDb as any).mockReturnValue(db);
    const data = await getPublishedData(T, "CONFIG", "default");
    expect(data).toEqual({ ok: true });
    // scoping: every revision query carries tenantId
    expect(db.revision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: T }) }),
    );
  });
});
