import { Prisma } from "@prisma/client";
import { isTenantScopedModel } from "./types";

// Prisma op args are heterogeneous (where/data/create/orderBy/…); a generic bag
// is the pragmatic shape here — the extension only reads/merges known keys.
// Proper typing is tracked for the Platform Hardening phase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>;

/**
 * Prisma operations whose `where` MUST select a single row by a top-level
 * unique field. We cannot AND-wrap their where with `{ tenantId }` — Prisma
 * rejects the nested form ("Argument where needs at least one ... unique
 * field"), so the query throws at runtime. A query extension also can't
 * transparently rewrite them into a filter op (that would change the return
 * type / cardinality). So we BAN them on the scoped client and force callers to
 * the filter-based equivalents (findFirst / updateMany / deleteMany), whose
 * where we CAN tenant-guard. `upsert` is handled separately: its `where` is left
 * untouched (caller must pass a tenantId-composite unique) and we stamp tenantId
 * into the `create` branch instead.
 */
const UNIQUE_WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

/** Ops that AND-wrap their `where` with the tenant filter. */
const FILTER_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** AND-merge a tenantId filter into a `where` (or create one if absent). */
function withTenantWhere(where: unknown, tenantId: string): AnyArgs {
  return where ? { AND: [where, { tenantId }] } : { tenantId };
}

/**
 * Merge tenantId into Prisma operation args, branching by operation class.
 * Pure + unit-tested (no Prisma import) — see scoping.test.ts.
 *
 * - create:                          inject tenantId into `data`.
 * - createMany / createManyAndReturn: inject tenantId into every row.
 * - upsert:                          inject into `create`; leave `where` (caller
 *                                    MUST use a tenantId-composite unique key).
 * - filter ops (findFirst/findMany/  AND-wrap `where` with { tenantId }.
 *   updateMany/deleteMany/count/...):
 * - unique-by-where ops (findUnique/ THROW — banned on the scoped client.
 *   findUniqueOrThrow/update/delete):
 * - anything else:                   AND-wrap `where` if present, else pass through.
 */
export function buildScopedArgs(operation: string, args: AnyArgs, tenantId: string): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };

  // Inject tenantId into created rows.
  if (operation === "create") {
    a.data = { ...a.data, tenantId };
    return a;
  }
  if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    a.data = rows.map((r: AnyArgs) => ({ ...r, tenantId }));
    return a;
  }
  if (operation === "upsert") {
    // Stamp the insert branch; the caller owns `where` and MUST pass a
    // tenantId-composite unique key (e.g. tenantId_idempotencyKey) — we do NOT
    // AND-wrap it (Prisma would reject the nested unique selector).
    a.create = { ...a.create, tenantId };
    return a;
  }

  // Fail loud, not silently leak: a unique-by-where op can't be tenant-guarded.
  if (UNIQUE_WHERE_OPS.has(operation)) {
    throw new Error(
      `tenant-scope: "${operation}" is not allowed on the scoped client (its unique where can't be tenant-guarded). Use findFirst / updateMany / deleteMany instead.`,
    );
  }

  // AND-wrap the where for filter ops (and any other op that carries a where).
  if (FILTER_OPS.has(operation) || a.where !== undefined) {
    a.where = withTenantWhere(a.where, tenantId);
    return a;
  }

  // Unknown op with no where (e.g. a future read-all) → pass through unchanged.
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
