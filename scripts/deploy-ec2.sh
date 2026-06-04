#!/usr/bin/env bash
# One-command deploy of MSFG.us to the self-hosted EC2.
#
# Builds the standalone bundle LOCALLY (never on the box — a Next build there
# could OOM-kill the live apps), rsyncs it, and zero-downtime-reloads pm2.
# The server's ~/apps/msfg.us/.env (secrets) is preserved (excluded from rsync).
#
# Usage: scripts/deploy-ec2.sh [SITE_URL] [SITE_ENV]
#   SITE_URL  baked into NEXT_PUBLIC_SITE_URL  (default https://staging.msfg.us)
#   SITE_ENV  "staging" (noindex) | "production"            (default staging)
# Override host/key/dir via env: MSFG_EC2_KEY, MSFG_EC2_HOST, MSFG_EC2_DIR.
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="${MSFG_EC2_KEY:-/Users/zacharyzink/MSFG/Security/msfg-mortgage-key.pem}"
HOST="${MSFG_EC2_HOST:-ubuntu@52.203.186.217}"
REMOTE_DIR="${MSFG_EC2_DIR:-apps/msfg.us}"
SITE_URL="${1:-https://staging.msfg.us}"
SITE_ENV="${2:-staging}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=25)

echo "▶ 1/3  Build standalone locally"
bash scripts/pack-standalone.sh "$SITE_URL" "$SITE_ENV"

echo "▶ 2/3  rsync → $HOST:~/$REMOTE_DIR  (server .env preserved)"
rsync -az --delete --exclude='.env' -e "${SSH[*]}" .next/standalone/ "$HOST:~/$REMOTE_DIR/"

echo "▶ 3/3  Reload pm2 on the box"
"${SSH[@]}" "$HOST" "cd ~/$REMOTE_DIR && set -a && . ./.env && set +a && pm2 reload msfg-web --update-env && pm2 save >/dev/null && echo reloaded"

echo "✓ Deployed to $HOST ($SITE_ENV)."
