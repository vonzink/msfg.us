import { Prisma } from "@prisma/client";
import { isTenantScopedModel } from "./types";

type AnyArgs = Record<string, any>;

/** Merge a tenantId filter/value into Prisma operation args. Pure + unit-tested. */
export function buildScopedArgs(operation: string, args: AnyArgs, tenantId: string): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };

  // Force tenantId onto created rows. `create` carries the new row under
  // `data`; `upsert` carries it under `create` (its insert branch) — stamp
  // whichever is present so a freshly-inserted row always gets the tenant.
  if (operation === "create" || operation === "upsert") {
    if (a.data) a.data = { ...a.data, tenantId };
    if (a.create) a.create = { ...a.create, tenantId };
  }
  if (operation === "createMany") {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    a.data = rows.map((r: AnyArgs) => ({ ...r, tenantId }));
    return a;
  }

  // Constrain reads/updates/deletes by tenantId.
  const needsWhere = operation !== "create" && operation !== "createMany";
  if (needsWhere) {
    a.where = a.where ? { AND: [a.where, { tenantId }] } : { tenantId };
  }
  return a;
}

/** A Prisma client extension that auto-scopes all tenant-owned models. */
export function tenantScope(tenantId: string) {
  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScopedModel(model)) return query(args as AnyArgs);
          return query(buildScopedArgs(operation, args as AnyArgs, tenantId));
        },
      },
    },
  });
}
