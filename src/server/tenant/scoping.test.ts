import { describe, it, expect } from "vitest";
import { buildScopedArgs } from "./scoping";

const T = "tenant_msfg";

describe("buildScopedArgs", () => {
  // --- filter ops: AND-wrap the where ---------------------------------------
  it("injects tenantId into a findMany where", () => {
    expect(buildScopedArgs("findMany", { where: { email: "a@b.c" } }, T))
      .toEqual({ where: { AND: [{ email: "a@b.c" }, { tenantId: T }] } });
  });
  it("adds a where to findFirst when none given", () => {
    expect(buildScopedArgs("findFirst", {}, T)).toEqual({ where: { tenantId: T } });
  });
  it("scopes updateMany by where (and keeps data)", () => {
    expect(buildScopedArgs("updateMany", { where: { id: "x" }, data: { name: "n" } }, T))
      .toEqual({ where: { AND: [{ id: "x" }, { tenantId: T }] }, data: { name: "n" } });
  });
  it("scopes deleteMany by where", () => {
    expect(buildScopedArgs("deleteMany", { where: { id: "x" } }, T))
      .toEqual({ where: { AND: [{ id: "x" }, { tenantId: T }] } });
  });

  // --- create ops: inject tenantId into the row(s) --------------------------
  it("forces tenantId on create data", () => {
    expect(buildScopedArgs("create", { data: { email: "a@b.c" } }, T))
      .toEqual({ data: { email: "a@b.c", tenantId: T } });
  });
  it("forces tenantId on every createMany row", () => {
    expect(buildScopedArgs("createMany", { data: [{ a: 1 }, { a: 2 }] }, T))
      .toEqual({ data: [{ a: 1, tenantId: T }, { a: 2, tenantId: T }] });
  });

  // --- upsert: stamp `create`, leave `where` untouched ----------------------
  it("forces tenantId on upsert create and does NOT touch where", () => {
    expect(
      buildScopedArgs(
        "upsert",
        { where: { tenantId_idempotencyKey: { tenantId: T, idempotencyKey: "k" } }, create: { a: 1 }, update: { b: 2 } },
        T,
      ),
    ).toEqual({
      where: { tenantId_idempotencyKey: { tenantId: T, idempotencyKey: "k" } },
      create: { a: 1, tenantId: T },
      update: { b: 2 },
    });
  });

  // --- unique-by-where ops: BANNED on the scoped client (fail loud) ---------
  it("throws on update", () => {
    expect(() => buildScopedArgs("update", { where: { id: "x" }, data: {} }, T)).toThrow(/not allowed/);
  });
  it("throws on delete", () => {
    expect(() => buildScopedArgs("delete", { where: { id: "x" } }, T)).toThrow(/not allowed/);
  });
  it("throws on findUnique", () => {
    expect(() => buildScopedArgs("findUnique", { where: { id: "x" } }, T)).toThrow(/not allowed/);
  });
  it("throws on findUniqueOrThrow", () => {
    expect(() => buildScopedArgs("findUniqueOrThrow", { where: { id: "x" } }, T)).toThrow(/not allowed/);
  });
});
