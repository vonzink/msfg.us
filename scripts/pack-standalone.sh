#!/usr/bin/env bash
# Build the self-contained Next.js standalone bundle for self-hosting.
#
# Run this LOCALLY (not on the EC2 — that box lacks the RAM to build and a build
# there could OOM-kill the live apps). Produces ./.next/standalone, ready to
# rsync to the server and run with `node server.js` behind nginx via pm2.
#
# Usage: scripts/pack-standalone.sh [SITE_URL] [SITE_ENV]
#   SITE_URL  public origin baked into NEXT_PUBLIC_SITE_URL (default staging)
#   SITE_ENV  "staging" (robots noindex) or "production"      (default staging)
set -euo pipefail
cd "$(dirname "$0")/.."

SITE_URL="${1:-https://staging.msfg.us}"
SITE_ENV="${2:-staging}"

echo "▶ Building standalone  (SITE_URL=$SITE_URL  SITE_ENV=$SITE_ENV)"
NEXT_PUBLIC_SITE_URL="$SITE_URL" NEXT_PUBLIC_SITE_ENV="$SITE_ENV" npm run build

SA=".next/standalone"
echo "▶ Assembling static assets + public/"
rm -rf "$SA/.next/static" "$SA/public"
cp -R .next/static "$SA/.next/static"
[ -d public ] && cp -R public "$SA/public"

echo "▶ Ensuring server runtime deps are present"
for pkg in @prisma/adapter-pg @prisma/driver-adapter-utils jose zod openai; do
  if [ ! -d "$SA/node_modules/$pkg" ] && [ -d "node_modules/$pkg" ]; then
    mkdir -p "$SA/node_modules/$(dirname "$pkg")"
    cp -R "node_modules/$pkg" "$SA/node_modules/$pkg"
    echo "  + copied $pkg"
  fi
done

echo "✓ Standalone ready: $SA  ($(du -sh "$SA" | cut -f1))"
