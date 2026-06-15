"use client";

import { useState } from "react";
import type { TenantConfig } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/admin/fields/TextField";
import { TextAreaField } from "@/components/admin/fields/TextAreaField";
import { SwitchField } from "@/components/admin/fields/SwitchField";
import { saveConfigDraftAction, publishConfigAction } from "./actions";

export function ConfigEditor({
  initialConfig,
  hasDraft,
}: {
  initialConfig: TenantConfig;
  hasDraft: boolean;
}) {
  const [cfg, setCfg] = useState<TenantConfig>(initialConfig);
  const [status, setStatus] = useState(hasDraft ? "Unpublished draft loaded." : "");
  const [busy, setBusy] = useState(false);

  const setBrand = <K extends keyof TenantConfig["brand"]>(
    k: K,
    v: TenantConfig["brand"][K],
  ) => setCfg((c) => ({ ...c, brand: { ...c.brand, [k]: v } }));

  const setContact = <K extends keyof TenantConfig["contact"]>(
    k: K,
    v: TenantConfig["contact"][K],
  ) => setCfg((c) => ({ ...c, contact: { ...c.contact, [k]: v } }));

  const setLegal = <K extends keyof TenantConfig["legal"]>(
    k: K,
    v: TenantConfig["legal"][K],
  ) => setCfg((c) => ({ ...c, legal: { ...c.legal, [k]: v } }));

  const setSeo = <K extends keyof TenantConfig["seo"]>(
    k: K,
    v: TenantConfig["seo"][K],
  ) => setCfg((c) => ({ ...c, seo: { ...c.seo, [k]: v } }));

  const setFeature = <K extends keyof TenantConfig["features"]>(
    k: K,
    v: boolean,
  ) => setCfg((c) => ({ ...c, features: { ...c.features, [k]: v } }));

  const patch = () => ({
    brand: cfg.brand,
    contact: cfg.contact,
    legal: cfg.legal,
    seo: cfg.seo,
    features: cfg.features,
  });

  async function onSave() {
    setBusy(true);
    try {
      await saveConfigDraftAction(patch());
      setStatus("Draft saved.");
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    setBusy(true);
    try {
      await saveConfigDraftAction(patch());
      await publishConfigAction();
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
        <h1 className="text-2xl font-extrabold">Content &amp; SEO</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" href="/admin/preview/enable?path=/">
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

      {/* Brand */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Brand
        </h2>
        <div className="grid gap-4">
          <TextField
            label="Short name"
            name="brand.shortName"
            value={cfg.brand.shortName}
            onChange={(v) => setBrand("shortName", v)}
          />
          <TextField
            label="Legal name"
            name="brand.legalName"
            value={cfg.brand.legalName}
            onChange={(v) => setBrand("legalName", v)}
          />
          <TextField
            label="Founded year"
            name="brand.foundedYear"
            type="number"
            value={String(cfg.brand.foundedYear)}
            onChange={(v) => setBrand("foundedYear", Number(v) || 0)}
          />
          <TextField
            label="Assistant name"
            name="brand.assistantName"
            value={cfg.brand.assistantName}
            onChange={(v) => setBrand("assistantName", v)}
          />
        </div>
      </section>

      {/* Contact */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Contact
        </h2>
        <div className="grid gap-4">
          <TextField
            label="Phone (display)"
            name="contact.phoneDisplay"
            value={cfg.contact.phoneDisplay}
            onChange={(v) => setContact("phoneDisplay", v)}
          />
          <TextField
            label="Phone (href)"
            name="contact.phoneHref"
            value={cfg.contact.phoneHref}
            onChange={(v) => setContact("phoneHref", v)}
          />
          <TextField
            label="Email"
            name="contact.email"
            value={cfg.contact.email}
            onChange={(v) => setContact("email", v)}
          />
          <TextField
            label="NMLS #"
            name="contact.nmls"
            value={cfg.contact.nmls}
            onChange={(v) => setContact("nmls", v)}
          />
          <TextField
            label="NMLS consumer access URL"
            name="contact.nmlsConsumerAccessUrl"
            value={cfg.contact.nmlsConsumerAccessUrl}
            onChange={(v) => setContact("nmlsConsumerAccessUrl", v)}
          />
        </div>
      </section>

      {/* Legal */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Legal
        </h2>
        <div className="grid gap-4">
          <TextField
            label="Registered office address"
            name="legal.address"
            value={cfg.legal.address ?? ""}
            onChange={(v) => setLegal("address", v)}
          />
        </div>
      </section>

      {/* SEO */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          SEO
        </h2>
        <div className="grid gap-4">
          <TextField
            label="Default title"
            name="seo.titleDefault"
            value={cfg.seo.titleDefault}
            onChange={(v) => setSeo("titleDefault", v)}
          />
          <TextField
            label="Title template"
            name="seo.titleTemplate"
            value={cfg.seo.titleTemplate}
            onChange={(v) => setSeo("titleTemplate", v)}
          />
          <TextAreaField
            label="Meta description"
            name="seo.description"
            value={cfg.seo.description}
            onChange={(v) => setSeo("description", v)}
          />
          <TextField
            label="OG title"
            name="seo.ogTitle"
            value={cfg.seo.ogTitle}
            onChange={(v) => setSeo("ogTitle", v)}
          />
          <TextAreaField
            label="OG description"
            name="seo.ogDescription"
            value={cfg.seo.ogDescription}
            onChange={(v) => setSeo("ogDescription", v)}
          />
          <TextField
            label="Site name"
            name="seo.siteName"
            value={cfg.seo.siteName}
            onChange={(v) => setSeo("siteName", v)}
          />
          <TextAreaField
            label="Org description (JSON-LD)"
            name="seo.orgDescription"
            value={cfg.seo.orgDescription}
            onChange={(v) => setSeo("orgDescription", v)}
          />
          <TextField
            label="Keywords (comma-separated)"
            name="seo.keywords"
            value={(cfg.seo.keywords ?? []).join(", ")}
            onChange={(v) =>
              setSeo(
                "keywords",
                v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </div>
      </section>

      {/* Features */}
      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
          Features
        </h2>
        <div className="grid gap-3">
          <SwitchField
            label="Show family of companies"
            checked={cfg.features.showFamily}
            onChange={(v) => setFeature("showFamily", v)}
          />
          <SwitchField
            label="GHL chat"
            checked={cfg.features.ghlChat}
            onChange={(v) => setFeature("ghlChat", v)}
          />
          <SwitchField
            label="AI assistant"
            checked={cfg.features.aiAssistant}
            onChange={(v) => setFeature("aiAssistant", v)}
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
