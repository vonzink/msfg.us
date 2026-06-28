#!/usr/bin/env bash
# ============================================================================
# msfg.us Deploy Script   (DRAFT — review before first use; not yet run)
#
# Runs from your laptop. Builds the Next.js *standalone* bundle locally (the box
# does NOT build — next.config.ts has `output: "standalone"`), assembles it, and
# rsyncs it into /home/ubuntu/apps/msfg.us on the EC2, then `pm2 restart msfg-web`.
# Mirrors apps/mortgage-app/deploy.sh in spirit.
#
# Topology (verified 2026-06-22): msfg.us runs as PM2 process `msfg-web` →
# server.js on 127.0.0.1:3007, nginx proxies msfg.us → :3007. The box dir is a
# build artifact (no .git). Runtime/server env lives in the box's
# ~/apps/msfg.us/.env (PORT, DATABASE_URL, COGNITO_*, HANDOFF_TOKEN_SECRET, …) and
# is PRESERVED by this script (rsync excludes .env*). There is NO auto-deploy.
#
# ⚠️ HOLD for the passwordless /continue work: the real Cognito email-OTP adapter
#    is not built yet. Deploying this branch sends a /continue page that can't
#    authenticate in prod. Deploy only after that adapter lands + Cognito is enabled.
# ============================================================================
set -euo pipefail

# ── Config (override via env) ───────────────────────────────────────────────
EC2_HOST="${EC2_HOST:-ubuntu@52.203.186.217}"
EC2_KEY="${EC2_KEY:-/Users/zacharyzink/MSFG/Security/msfg-mortgage-key.pem}"
EC2_DIR="${EC2_DIR:-/home/ubuntu/apps/msfg.us}"
PM2_NAME="${PM2_NAME:-msfg-web}"
APP_PORT="${APP_PORT:-3007}"                 # nginx → 127.0.0.1:3007 (for the health check only)
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH=(ssh -i "$EC2_KEY" -o StrictHostKeyChecking=accept-new)

# ── Colors ──────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; N='\033[0m'
say(){ printf "${C}▸ %s${N}\n" "$1"; }
ok(){ printf "${G}✓ %s${N}\n" "$1"; }
warn(){ printf "${Y}! %s${N}\n" "$1"; }
die(){ printf "${R}✗ %s${N}\n" "$1" >&2; exit 1; }

# ── Flags ───────────────────────────────────────────────────────────────────
DO_BUILD=true
DO_MIGRATE=false
RESTART_ONLY=false
ALLOW_DIRTY=false
usage(){ cat <<EOF
Usage: ./deploy.sh [OPTIONS]

  (no flags)      Build standalone locally → rsync to the box → pm2 restart msfg-web
  --no-build      Skip the build; rsync the existing .next/standalone + restart
  --restart-only  Just pm2 restart msfg-web on the box (no copy)
  --migrate       Run \`prisma migrate deploy\` against PROD before restart.
                  Requires PROD_DATABASE_URL in your env and network reach to the
                  prod DB (e.g. over Tailscale — the box runs tailscaled). Runs
                  LOCALLY (the standalone bundle has no prisma CLI). OMIT unless a
                  migration actually changed (the transition-page work added none).
  -h, --help      This help

Build env: \`next build\` bakes NEXT_PUBLIC_* into the client bundle from
.env.production / .env.production.local (NODE_ENV=production). Make sure those hold
PROD values (NEXT_PUBLIC_APP_URL=https://app.msfgco.com, NEXT_PUBLIC_SITE_URL=https://msfg.us,
GHL ids, …) — the script warns if neither file exists.
EOF
}
for a in "$@"; do case "$a" in
  --no-build) DO_BUILD=false;;
  --restart-only) RESTART_ONLY=true;;
  --migrate) DO_MIGRATE=true;;
  --allow-dirty) ALLOW_DIRTY=true;;
  -h|--help) usage; exit 0;;
  *) die "Unknown option: $a (see --help)";;
esac; done

# GUARD: `next build` bundles from the WORKING TREE, so any uncommitted file under
# src/ silently ships to prod. Abort on a dirty src/ unless --allow-dirty.
if $DO_BUILD && [ "$ALLOW_DIRTY" != "true" ]; then
  DIRTY="$(git -C "$LOCAL_DIR" status --porcelain -- src 2>/dev/null)"
  if [ -n "$DIRTY" ]; then
    printf "${R}✗ ABORT: src/ has uncommitted changes — these would ship to prod:${N}\n"
    printf '%s\n' "$DIRTY" | sed 's/^/    /'
    die "Commit or stash them, or re-run with --allow-dirty to deploy anyway."
  fi
fi

cd "$LOCAL_DIR"
command -v rsync >/dev/null || die "rsync not found on your laptop"
[ -f "$EC2_KEY" ] || die "SSH key not found: $EC2_KEY"

# ── Restart-only shortcut ─────────────────────────────────────────────────────
if $RESTART_ONLY; then
  say "Restarting $PM2_NAME on $EC2_HOST"
  "${SSH[@]}" "$EC2_HOST" "pm2 restart $PM2_NAME"
  ok "Restarted."; exit 0
fi

# ── 1) Build the standalone bundle ────────────────────────────────────────────
if $DO_BUILD; then
  if [ ! -f .env.production ] && [ ! -f .env.production.local ]; then
    warn "No .env.production[.local] found — NEXT_PUBLIC_* will fall back to .env/.env.local."
    warn "That risks baking DEV public values into the prod bundle. Ctrl-C to abort, or wait 5s…"; sleep 5
  fi
  say "Installing deps (npm ci)"; npm ci
  say "prisma generate"; npx prisma generate
  say "next build (standalone)"; NODE_ENV=production npm run build
  [ -d .next/standalone ] || die ".next/standalone not produced — is output:'standalone' set in next.config?"

  # Standalone omits static assets + public/ — copy them into the bundle so the
  # box has a self-contained tree (server.js serves .next/static and public).
  say "Assembling standalone (static + public)"
  mkdir -p .next/standalone/.next
  rsync -a --delete .next/static/ .next/standalone/.next/static/
  [ -d public ] && rsync -a public/ .next/standalone/public/
  ok "Build assembled at .next/standalone"
fi
[ -d .next/standalone ] || die "No .next/standalone to deploy (run without --no-build first)"

# ── 2) (optional) Migrate prod DB ─────────────────────────────────────────────
if $DO_MIGRATE; then
  [ -n "${PROD_DATABASE_URL:-}" ] || die "--migrate needs PROD_DATABASE_URL in your env (reachable, e.g. via Tailscale)"
  say "prisma migrate deploy → PROD"
  DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
  ok "Migrations applied."
fi

# ── 3) Ship it (preserve the box's .env*) ─────────────────────────────────────
say "rsync → $EC2_HOST:$EC2_DIR (preserving .env*)"
rsync -az --delete \
  --exclude='.env' --exclude='.env.*' \
  -e "ssh -i $EC2_KEY -o StrictHostKeyChecking=accept-new" \
  .next/standalone/ "$EC2_HOST:$EC2_DIR/"
ok "Bundle synced."

# ── 4) Restart + health check ─────────────────────────────────────────────────
say "pm2 restart $PM2_NAME"
"${SSH[@]}" "$EC2_HOST" "pm2 restart $PM2_NAME"
sleep 3
say "Health check (localhost:$APP_PORT on the box)"
if "${SSH[@]}" "$EC2_HOST" "curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/ || true" | grep -qE '^(200|3..)$'; then
  ok "msfg.us is up on :$APP_PORT (https://msfg.us)"
else
  warn "Health check didn't return 2xx/3xx — check: ${SSH[*]} $EC2_HOST 'pm2 logs $PM2_NAME --lines 50'"
fi
ok "Deploy complete."
