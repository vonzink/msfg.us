/**
 * Public partner API authentication.
 *
 * Validates an `x-api-key` header against configured keys, and (for WRITE
 * endpoints) optionally verifies an HMAC `x-signature` over the raw body.
 *
 * Key sources, checked in order:
 *   1. env `MSFG_API_KEYS` — comma-separated. Each entry is either a bare key
 *      (`<key>`) or a `keyId:key:secret` triple. The optional `secret` enables
 *      HMAC for that key. A bare key has keyId = "env" + index and no secret.
 *   2. DB-backed `ApiKey` rows — checked only when a Prisma client is available
 *      AND the env keys didn't match. The stored `keyHash` is sha256(key); the
 *      optional `secret` enables HMAC. Env keys work with NO database.
 *
 * All comparisons of secret material use Node's constant-time `timingSafeEqual`
 * (via `safeEqual`), so neither key nor signature checks leak timing.
 *
 * Server-only: reads process.env + DB. Never import into a Client Component.
 */
import crypto from "node:crypto";
import { serverEnv } from "@/lib/env";

/** A resolved API key (from env or DB). */
export interface ApiKeyRecord {
  /** Stable identifier for logs (env index label or DB row id). */
  keyId: string;
  /** Human label (DB `name`, or "env" for env keys). */
  name: string;
  /** Per-key HMAC secret, when configured. Presence enables HMAC enforcement. */
  secret?: string;
  /** Coarse scopes (DB only; env keys are unscoped → []). */
  scopes: string[];
  /** Where the key came from, for logging. */
  source: "env" | "db";
}

/** Outcome of an auth attempt. Discriminated on `ok`. */
export type AuthResult =
  | { ok: true; key: ApiKeyRecord }
  | { ok: false; status: 401 | 403 | 503; error: string };

/** Constant-time string compare (utf8). Length-safe. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Constant-time compare of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** sha256(value) as lowercase hex — matches the DB `keyHash` column. */
function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** An env key record plus its raw key value (kept internal to this module). */
interface EnvKeyEntry {
  record: ApiKeyRecord;
  /** The raw key value compared against the presented `x-api-key`. */
  key: string;
}

/**
 * Parse `MSFG_API_KEYS` into entries. Each comma-separated entry is either:
 *   • `key`                 → bare key, no secret
 *   • `keyId:key`           → labeled key, no secret
 *   • `keyId:key:secret`    → labeled key with an HMAC secret
 * Empty entries are skipped. Cached after first parse (env is immutable here).
 */
let envKeysCache: EnvKeyEntry[] | null = null;
function parseEnvKeys(): EnvKeyEntry[] {
  if (envKeysCache) return envKeysCache;
  const raw = serverEnv.MSFG_API_KEYS;
  if (!raw) {
    envKeysCache = [];
    return envKeysCache;
  }
  const entries: EnvKeyEntry[] = [];
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((entry, i) => {
      const parts = entry.split(":");
      let keyId: string;
      let key: string;
      let secret: string | undefined;
      if (parts.length >= 3) {
        // keyId:key:secret — re-join the tail in case the secret had ":".
        keyId = parts[0] || `env-${i}`;
        key = parts[1];
        secret = parts.slice(2).join(":") || undefined;
      } else if (parts.length === 2) {
        keyId = parts[0] || `env-${i}`;
        key = parts[1];
      } else {
        keyId = `env-${i}`;
        key = entry;
      }
      if (!key) return;
      entries.push({
        record: { keyId, name: "env", secret, scopes: [], source: "env" },
        key,
      });
    });
  envKeysCache = entries;
  return entries;
}

/** Match a presented key against env records (constant-time). */
function matchEnvKey(presented: string): ApiKeyRecord | null {
  for (const entry of parseEnvKeys()) {
    if (safeEqual(entry.key, presented)) return entry.record;
  }
  return null;
}

/**
 * Match a presented key against DB `ApiKey` rows by sha256(key). Best-effort:
 * returns null when the DB/model is unavailable so env-only setups never break.
 * Touches `lastUsedAt` on a hit (fire-and-forget).
 */
async function matchDbKey(presented: string): Promise<ApiKeyRecord | null> {
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    // The ApiKey model is additive; guard in case the client predates it.
    const model = (db as unknown as { apiKey?: unknown }).apiKey;
    if (!model) return null;

    const hash = sha256Hex(presented);
    const row = await db.apiKey.findFirst({
      where: { keyHash: hash, active: true },
    });
    if (!row) return null;

    // Touch lastUsedAt without blocking the request.
    void db.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return {
      keyId: row.id,
      name: row.name,
      secret: row.secret ?? undefined,
      scopes: row.scopes ?? [],
      source: "db",
    };
  } catch {
    // No DB configured / not migrated / query failed → env keys still work.
    return null;
  }
}

/** Read the API key header (case-insensitive via Headers). */
function readApiKey(req: Request): string | null {
  return req.headers.get("x-api-key");
}

/** Read the HMAC signature header (`x-signature: sha256=<hex>`). */
function readSignature(req: Request): string | null {
  return req.headers.get("x-signature");
}

/**
 * Verify the HMAC signature for a WRITE request: the header must be
 * `sha256=<hex>` where hex = HMAC-SHA256(key.secret, rawBody). Constant-time.
 */
function verifyHmac(key: ApiKeyRecord, rawBody: string, header: string): boolean {
  if (!key.secret) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = crypto
    .createHmac("sha256", key.secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return safeEqualHex(expected, provided.trim());
}

/**
 * Authenticate a request by `x-api-key`. Returns the matched key or a typed
 * failure. Checks env keys first, then DB. Does NOT enforce HMAC — call
 * {@link authenticateWrite} for WRITE endpoints that need body signing.
 */
export async function authenticateKey(req: Request): Promise<AuthResult> {
  const presented = readApiKey(req);
  if (!presented) {
    return { ok: false, status: 401, error: "Missing x-api-key header" };
  }

  const envMatch = matchEnvKey(presented);
  if (envMatch) return { ok: true, key: envMatch };

  const dbMatch = await matchDbKey(presented);
  if (dbMatch) return { ok: true, key: dbMatch };

  return { ok: false, status: 401, error: "Invalid API key" };
}

/**
 * Authenticate a WRITE request. After key validation, HMAC is enforced **when
 * the matched key has a secret**: the request must carry a valid
 * `x-signature`. Keys without a secret skip HMAC (key-only auth), which lets
 * partners onboard simply and upgrade to signing later.
 */
export async function authenticateWrite(
  req: Request,
  rawBody: string,
): Promise<AuthResult> {
  const base = await authenticateKey(req);
  if (!base.ok) return base;

  const key = base.key;
  if (key.secret) {
    const sig = readSignature(req);
    if (!sig) {
      return {
        ok: false,
        status: 401,
        error: "Missing x-signature header (HMAC required for this key)",
      };
    }
    if (!verifyHmac(key, rawBody, sig)) {
      return { ok: false, status: 401, error: "Invalid HMAC signature" };
    }
  }

  return { ok: true, key };
}
