import { describe, it, expect } from "vitest";
import { buildScopedArgs } from "./scoping";

const T = "tenant_msfg";

describe("buildScopedArgs", () => {
  it("injects tenantId into a read where", () => {
    expect(buildScopedArgs("findMany", { where: { email: "a@b.c" } }, T))
      .toEqual({ where: { AND: [{ email: "a@b.c" }, { tenantId: T }] } });
  });
  it("adds where when none given", () => {
    expect(buildScopedArgs("findFirst", {}, T)).toEqual({ where: { tenantId: T } });
  });
  it("forces tenantId on create data", () => {
    expect(buildScopedArgs("create", { data: { email: "a@b.c" } }, T))
      .toEqual({ data: { email: "a@b.c", tenantId: T } });
  });
  it("forces tenantId on every createMany row", () => {
    expect(buildScopedArgs("createMany", { data: [{ a: 1 }, { a: 2 }] }, T))
      .toEqual({ data: [{ a: 1, tenantId: T }, { a: 2, tenantId: T }] });
  });
  it("scopes update/delete by where", () => {
    expect(buildScopedArgs("updateMany", { where: { id: "x" }, data: { name: "n" } }, T))
      .toEqual({ where: { AND: [{ id: "x" }, { tenantId: T }] }, data: { name: "n" } });
  });
  it("forces tenantId on upsert create + scopes where", () => {
    expect(buildScopedArgs("upsert", { where: { id: "x" }, create: { a: 1 }, update: { b: 2 } }, T))
      .toEqual({ where: { AND: [{ id: "x" }, { tenantId: T }] }, create: { a: 1, tenantId: T }, update: { b: 2 } });
  });
});
