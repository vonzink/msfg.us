type Obj = Record<string, unknown>;

function isPlainObject(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Merge editor `patch` over a `base` config, one level deep into each section.
 * Scalars and arrays in a patched section override; untouched siblings persist.
 * Pure — no I/O.
 */
export function mergeConfig(base: unknown, patch: unknown): Obj {
  const b = isPlainObject(base) ? base : {};
  const p = isPlainObject(patch) ? patch : {};
  const out: Obj = { ...b };
  for (const [key, value] of Object.entries(p)) {
    if (isPlainObject(value) && isPlainObject(b[key])) {
      out[key] = { ...(b[key] as Obj), ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}
