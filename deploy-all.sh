#!/bin/bash
# Desplega PatrolTrack a tot arreu en un sol pas:
#   1. git push          (si hi ha commits no pujats a origin/main)
#   2. wrangler deploy   (Worker → patroltrack-api.patroltrack.workers.dev)
#   3. deploy-frontend   (Pages → patroltrack.pages.dev)
#
# Per defecte refusa si hi ha canvis no committejats al working tree, així no
# desplegues codi que encara no està al repo. Passa --dirty per saltar-ho
# (útil per fer proves ràpides). Cada fase es pot saltar individualment.
#
# Ús:
#   ./deploy-all.sh                  # tot
#   ./deploy-all.sh --dirty          # tot, ignorant canvis sense committejar
#   ./deploy-all.sh --skip-worker    # només git push + frontend
#   ./deploy-all.sh --skip-pages     # només git push + worker
#   ./deploy-all.sh --skip-git       # només cloud (no toca GitHub)
#   ./deploy-all.sh -h | --help      # ajut

set -e
cd "$(dirname "$0")"

ALLOW_DIRTY=0
SKIP_GIT=0
SKIP_WORKER=0
SKIP_PAGES=0

for arg in "$@"; do
  case $arg in
    --dirty) ALLOW_DIRTY=1 ;;
    --skip-git) SKIP_GIT=1 ;;
    --skip-worker) SKIP_WORKER=1 ;;
    --skip-pages) SKIP_PAGES=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "❌ Opció desconeguda: $arg (prova --help)"
      exit 1 ;;
  esac
done

# ── 0. Working tree net ───────────────────────────────────────────────────
if [ $ALLOW_DIRTY -eq 0 ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "❌ Working tree brut. Commiteja primer o passa --dirty per ignorar-ho."
    echo ""
    git status --short
    exit 1
  fi
fi

# ── 1. Git push ───────────────────────────────────────────────────────────
if [ $SKIP_GIT -eq 0 ]; then
  # @{u} = upstream del branch actual (origin/main típicament)
  UNPUSHED=$(git log @{u}..HEAD --oneline 2>/dev/null || echo "")
  if [ -n "$UNPUSHED" ]; then
    echo "▶ Pujant commits a GitHub..."
    echo "$UNPUSHED" | sed 's/^/   /'
    git push
    echo "✓ GitHub actualitzat."
  else
    echo "✓ GitHub ja al dia."
  fi
  echo ""
fi

# ── Account ID (necessari per wrangler 4 quan OAuth no té user:read) ──────
ACCOUNT_ID=$(cat cloudflare/.account-id.txt 2>/dev/null || echo "")
if [ -z "$ACCOUNT_ID" ] && { [ $SKIP_WORKER -eq 0 ] || [ $SKIP_PAGES -eq 0 ]; }; then
  echo "❌ No trobo cloudflare/.account-id.txt — necessari per al deploy de Cloudflare."
  echo "   Pots obtenir-lo del dashboard de Cloudflare → Workers & Pages → Account ID."
  exit 1
fi

# ── 2. Worker ─────────────────────────────────────────────────────────────
if [ $SKIP_WORKER -eq 0 ]; then
  echo "▶ Desplegant Worker (patroltrack-api)..."
  (
    cd cloudflare
    CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID npx wrangler deploy
  )
  echo "✓ Worker desplegat."
  echo ""
fi

# ── 3. Pages (frontend) ───────────────────────────────────────────────────
if [ $SKIP_PAGES -eq 0 ]; then
  echo "▶ Desplegant frontend (patroltrack.pages.dev)..."
  ./deploy-frontend.sh
  echo ""
fi

# ── Resum ─────────────────────────────────────────────────────────────────
echo "═════════════════════════════════════════════════════════════"
echo "✅ Desplegament complet"
[ $SKIP_GIT -eq 0 ]    && echo "   • GitHub:   https://github.com/joelreintegra-collab/patroltrack"
[ $SKIP_WORKER -eq 0 ] && echo "   • Worker:   https://patroltrack-api.patroltrack.workers.dev"
[ $SKIP_PAGES -eq 0 ]  && echo "   • Frontend: https://patroltrack.pages.dev"
echo "═════════════════════════════════════════════════════════════"
