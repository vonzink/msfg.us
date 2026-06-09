import { describe, it, expect, vi, beforeEach } from "vitest";

const getPublishedData = vi.fn();
const getDraftData = vi.fn();
vi.mock("./versioning", () => ({
  getPublishedData: (...a: unknown[]) => getPublishedData(...a),
  getDraftData: (...a: unknown[]) => getDraftData(...a),
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("next/headers", () => ({ draftMode: async () => ({ isEnabled: false }) }));
vi.mock("@/server/tenant/resolve", () => ({ getTenant: async () => ({ id: "tenant_msfg" }) }));

import { getPageSeo } from "./seo";

beforeEach(() => vi.clearAllMocks());

describe("getPageSeo", () => {
  it("returns parsed published page-seo for the path", async () => {
    getPublishedData.mockResolvedValue({ title: "Buy", priority: 0.9 });
    const seo = await getPageSeo("/buy");
    expect(seo.title).toBe("Buy");
    expect(seo.include).toBe(true);
    expect(getPublishedData).toHaveBeenCalledWith("tenant_msfg", "PAGE_SEO", "/buy");
  });

  it("returns the safe default when no revision exists", async () => {
    getPublishedData.mockResolvedValue(null);
    expect(await getPageSeo("/buy")).toEqual({ include: true });
  });
});
