"use client";

import { useState } from "react";
import Link from "next/link";
import type { PageSeo } from "@/server/cms/seo";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/admin/fields/TextField";
import { TextAreaField } from "@/components/admin/fields/TextAreaField";
import { SwitchField } from "@/components/admin/fields/SwitchField";
import { saveSeoDraftAction, publishSeoAction } from "./actions";

export function SeoEditor({
  path,
  label,
  initial,
  hasDraft,
}: {
  path: string;
  label: string;
  initial: PageSeo;
  hasDraft: boolean;
}) {
  const [seo, setSeo] = useState<PageSeo>(initial);
  // JSON-LD is stored as an object; the textarea holds the serialised string.
  const [jsonLdText, setJsonLdText] = useState<string>(
    initial.jsonLd != null ? JSON.stringify(initial.jsonLd, null, 2) : "",
  );
  const [status, setStatus] = useState(hasDraft ? "Unpublished draft loaded." : "");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof PageSeo>(k: K, v: PageSeo[K]) =>
    setSeo((s) => ({ ...s, [k]: v }));

  /** Parse the JSON-LD textarea and return the patch, or set error + return null. */
  function buildPatch(): Record<string, unknown> | null {
    let jsonLd: Record<string, unknown> | undefined;
    if (jsonLdText.trim() !== "") {
      try {
        const parsed = JSON.parse(jsonLdText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Must be a JSON object.");
        }
        jsonLd = parsed as Record<string, unknown>;
      } catch (e) {
        setStatus(`JSON-LD is invalid: ${e instanceof Error ? e.message : "parse error"}`);
        return null;
      }
    }
    return {
      ...seo,
      ...(jsonLd !== undefined ? { jsonLd } : { jsonLd: undefined }),
    };
  }

  async function onSave() {
    const patch = buildPatch();
    if (!patch) return;
    setBusy(true);
    try {
      await saveSeoDraftAction(path, patch);
      setStatus("Draft saved.");
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    const patch = buildPatch();
    if (!patch) return;
    setBusy(true);
    try {
      await saveSeoDraftAction(path, patch);
      await publishSeoAction(path);
      setStatus("Published. Live within seconds.");
    } catch (e) {
      setStatus(`Publish failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-[13px] text-muted">
            <Link href="/admin/seo" className="underline hover:text-ink">
              Per-page SEO
            </Link>
            {" / "}
            <span>{label}</span>
          </div>
          <h1 className="text-2xl font-extrabold">SEO — {label}</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            href={`/admin/preview/enable?path=${encodeURIComponent(path)}`}
          >
            Preview
          </Button>
          <Button variant="dark" size="sm" onClick={onSave} disabled={busy}>
            Save draft
          </Button>
          <Button variant="green" size="sm" onClick={onPublish} disabled={busy}>
            Publish
          </Button>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <p
          role="status"
          className="mb-6 rounded-md border border-line bg-paper-2 px-4 py-2.5 text-[13px] text-ink"
        >
          {status}
        </p>
      )}

      {/* Core meta */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Meta tags
        </h2>
        <div className="grid gap-4">
          <TextField
            label="Title"
            name="seo.title"
            value={seo.title ?? ""}
            onChange={(v) => set("title", v || undefined)}
            placeholder="Overrides the global title template"
          />
          <TextAreaField
            label="Description"
            name="seo.description"
            value={seo.description ?? ""}
            onChange={(v) => set("description", v || undefined)}
            rows={3}
          />
          <TextField
            label="Canonical URL"
            name="seo.canonical"
            value={seo.canonical ?? ""}
            onChange={(v) => set("canonical", v || undefined)}
            placeholder="https://msfg.us/..."
          />
          <TextField
            label="Robots"
            name="seo.robots"
            value={seo.robots ?? ""}
            onChange={(v) => set("robots", v || undefined)}
            placeholder="e.g. noindex,follow"
          />
        </div>
      </section>

      {/* Open Graph */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Open Graph
        </h2>
        <div className="grid gap-4">
          <TextField
            label="OG title"
            name="seo.ogTitle"
            value={seo.ogTitle ?? ""}
            onChange={(v) => set("ogTitle", v || undefined)}
          />
          <TextAreaField
            label="OG description"
            name="seo.ogDescription"
            value={seo.ogDescription ?? ""}
            onChange={(v) => set("ogDescription", v || undefined)}
            rows={3}
          />
          <TextField
            label="OG image URL"
            name="seo.ogImage"
            value={seo.ogImage ?? ""}
            onChange={(v) => set("ogImage", v || undefined)}
            placeholder="/og/page.png"
          />
        </div>
      </section>

      {/* JSON-LD */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Structured data (JSON-LD)
        </h2>
        <TextAreaField
          label="JSON-LD object (leave blank to inherit global)"
          name="seo.jsonLd"
          value={jsonLdText}
          onChange={setJsonLdText}
          rows={8}
        />
      </section>

      {/* Sitemap */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Sitemap
        </h2>
        <div className="grid gap-4">
          <SwitchField
            label="Include in sitemap"
            checked={seo.include ?? true}
            onChange={(v) => set("include", v)}
          />
          <TextField
            label="Priority (0–1)"
            name="seo.priority"
            type="number"
            value={seo.priority != null ? String(seo.priority) : ""}
            onChange={(v) =>
              set("priority", v.trim() === "" ? undefined : parseFloat(v))
            }
            placeholder="e.g. 0.8"
          />
          <TextField
            label="Change frequency"
            name="seo.changefreq"
            value={seo.changefreq ?? ""}
            onChange={(v) =>
              set(
                "changefreq",
                (v || undefined) as PageSeo["changefreq"],
              )
            }
            placeholder="daily | weekly | monthly…"
          />
        </div>
      </section>

      {/* Footer save row */}
      <div className="flex justify-end gap-2 border-t border-line pt-6">
        <Button variant="dark" size="sm" onClick={onSave} disabled={busy}>
          Save draft
        </Button>
        <Button variant="green" size="sm" onClick={onPublish} disabled={busy}>
          Publish
        </Button>
      </div>
    </div>
  );
}
