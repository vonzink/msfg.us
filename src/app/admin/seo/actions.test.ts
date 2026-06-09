import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const rollback = vi.fn();
const revalidateCmsTag = vi.fn();
const auditCreate = vi.fn();
const getDraftData = vi.fn();
const getPublishedData = vi.fn();

vi.mock("@/server/admin/access", () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock("@/server/cms/versioning", () => ({
  saveDraft: (...a: unknown[]) => saveDraft(...a),
  publish: (...a: unknown[]) => publish(...a),
  rollback: (...a: unknown[]) => rollback(...a),
  getDraftData: (...a: unknown[]) => getDraftData(...a),
  getPublishedData: (...a: unknown[]) => getPublishedData(...a),
}));
vi.mock("@/server/cms/cache", () => ({
  seoTag: (t: string, p: string) => `t:${t}:seo:${p}`,
  revalidateCmsTag: (...a: unknown[]) => revalidateCmsTag(...a),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ auditLog: { create: (...a: unknown[]) => auditCreate(...a) } }) }));

import { saveSeoDraftAction, publishSeoAction, rollbackSeoAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ tenant: { id: "tenant_msfg" }, user: { id: "u1" } });
  getDraftData.mockResolvedValue(null);
  getPublishedData.mockResolvedValue(null);
});

describe("saveSeoDraftAction", () => {
  it("rejects an unknown route", async () => {
    await expect(saveSeoDraftAction("/evil", { title: "x" })).rejects.toThrow();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("validates + saves a draft for a known route under tenantId from ctx", async () => {
    await saveSeoDraftAction("/buy", { title: "Buy a Home", priority: 0.9 });
    expect(saveDraft).toHaveBeenCalledWith(
      "tenant_msfg",
      "PAGE_SEO",
      "/buy",
      expect.objectContaining({ title: "Buy a Home", priority: 0.9, include: true }),
      "u1",
    );
    expect(auditCreate).toHaveBeenCalled();
  });
});

describe("publishSeoAction", () => {
  it("rejects an unknown route", async () => {
    await expect(publishSeoAction("/evil")).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes + busts the per-path tag", async () => {
    await publishSeoAction("/buy");
    expect(publish).toHaveBeenCalledWith("tenant_msfg", "PAGE_SEO", "/buy", "u1");
    expect(revalidateCmsTag).toHaveBeenCalledWith("t:tenant_msfg:seo:/buy");
    expect(auditCreate).toHaveBeenCalled();
  });
});

describe("rollbackSeoAction", () => {
  it("rejects an unknown route", async () => {
    await expect(rollbackSeoAction("/evil", 1)).rejects.toThrow();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rolls back to a version under tenantId from ctx", async () => {
    await rollbackSeoAction("/rates", 3);
    expect(rollback).toHaveBeenCalledWith("tenant_msfg", "PAGE_SEO", "/rates", 3, "u1");
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "seo.rollback", meta: { path: "/rates", version: 3 } }),
      }),
    );
  });
});
