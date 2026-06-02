"use client";

/**
 * Progressive Swagger UI embed — loads the Swagger UI bundle from a CDN at
 * runtime (no npm dependency) and renders the live API explorer against our
 * OpenAPI document. If the CDN is blocked or scripts are disabled, the rest of
 * the Developers page still documents everything, so this is purely additive.
 */
import { useEffect, useRef, useState } from "react";

const SWAGGER_VERSION = "5.17.14";
const CSS_URL = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const JS_URL = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;

declare global {
  interface Window {
    SwaggerUIBundle?: (opts: Record<string, unknown>) => unknown;
  }
}

/** Load a <script> once; resolve when ready. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Load a stylesheet once. */
function loadStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

export function SwaggerEmbed({ specUrl }: { specUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStyle(CSS_URL);
    loadScript(JS_URL)
      .then(() => {
        if (cancelled || !ref.current || !window.SwaggerUIBundle) return;
        window.SwaggerUIBundle({
          url: specUrl,
          domNode: ref.current,
          deepLinking: true,
          tryItOutEnabled: true,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  if (failed) {
    return (
      <p className="text-[15px] text-muted">
        The interactive explorer could not load. View the raw spec at{" "}
        <a href={specUrl} className="font-semibold text-spring-3 underline">
          {specUrl}
        </a>
        .
      </p>
    );
  }

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-2xl border border-line bg-white"
      aria-label="Interactive API explorer"
    />
  );
}
