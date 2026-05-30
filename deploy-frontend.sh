#!/bin/bash
# Build i deploy del frontend a Cloudflare Pages.
# Inclou el truc del CLOUDFLARE_ACCOUNT_ID perquè wrangler 4 no falli amb
# "Failed to automatically retrieve account IDs" quan l'OAuth no té el permís
# user:read.

set -e

cd "$(dirname "$0")"

ACCOUNT_ID=$(cat cloudflare/.account-id.txt 2>/dev/null || echo "")
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ No trobo cloudflare/.account-id.txt — necessari per al deploy."
  echo "   Pots obtenir-lo del dashboard de Cloudflare → Workers & Pages → Account ID."
  exit 1
fi

echo "▶ Building frontend..."
cd frontend
VITE_API_URL=https://patroltrack-api.patroltrack.workers.dev npm run build

echo "▶ Deploying to Cloudflare Pages..."
CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID npx wrangler pages deploy dist \
  --project-name patroltrack \
  --commit-dirty=true

echo "✅ Desplegat a https://patroltrack.pages.dev"
