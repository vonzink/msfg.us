import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Self-contained server bundle for self-hosting (build locally, run on the
  // EC2 via pm2 — no build on the box). Produces .next/standalone/server.js.
  output: "standalone",
  // Pin the workspace root — other MSFG projects have lockfiles up the tree,
  // and Next would otherwise infer the wrong root for file tracing.
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingRoot: path.join(__dirname),
  // Server-only deps that file tracing misses for the standalone bundle
  // (dynamic/conditional requires). Force-include so the bundle runs anywhere.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@prisma/adapter-pg/**",
      "./node_modules/@prisma/driver-adapter-utils/**",
      "./node_modules/jose/**",
      "./node_modules/zod/**",
      "./node_modules/openai/**",
    ],
  },
};

export default nextConfig;
