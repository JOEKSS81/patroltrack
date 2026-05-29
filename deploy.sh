#!/usr/bin/env bash
# PatrolTrack — puja els canvis als 3 llocs d'un sol cop:
#   LOCAL (git commit) -> GitHub (push) -> Cloudflare (build + deploy)
#
# Ús:   ./deploy.sh "missatge del canvi"
#       ./deploy.sh           (posa un missatge amb la data automàticament)

set -e
cd "$(dirname "$0")"

MSG="${*:-Update $(date '+%Y-%m-%d %H:%M')}"
API="https://patroltrack-api.patroltrack.workers.dev"

echo "▶ 1/4  Desant a Git i pujant a GitHub…"
git add -A
git commit -m "$MSG" || echo "   (res nou a desar)"
git push

echo "▶ 2/4  Compilant el frontend…"
( cd frontend && VITE_API_URL="$API" npm run build )

echo "▶ 3/4  Desplegant el frontend a Cloudflare Pages…"
( cd frontend && npx wrangler pages deploy dist --project-name patroltrack --branch main --commit-dirty=true )

echo "▶ 4/4  Desplegant l'API (Worker)…"
( cd cloudflare && npx wrangler deploy )

echo ""
echo "✅ Fet — LOCAL + GitHub + Cloudflare (frontend + Worker) actualitzats."
echo "   App en viu: https://patroltrack.pages.dev"
echo "   API:        https://patroltrack-api.patroltrack.workers.dev"
