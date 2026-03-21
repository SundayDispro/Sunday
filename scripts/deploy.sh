#!/usr/bin/env bash
# Script de despliegue Sunday (ejecutar en el servidor desde la raíz del repo).
# Uso: ./scripts/deploy.sh           → git pull + build + (opcional) pm2
#      ./scripts/deploy.sh --no-pull → solo build
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKIP_PULL=0
SKIP_RESTART=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) SKIP_PULL=1 ;;
    --no-restart) SKIP_RESTART=1 ;;
  esac
done

echo "=== Sunday deploy: $REPO_ROOT ==="

if [ "$SKIP_PULL" -eq 0 ]; then
  git pull
else
  echo "(sin git pull)"
fi

install_deps() {
  ( cd "$1" && (npm ci || npm install) )
}

# Backend: dependencias completas (tsc / prisma en devDependencies)
install_deps "$REPO_ROOT/backend"
cd "$REPO_ROOT/backend"
npx prisma generate
npx prisma migrate deploy
npm run build
cd "$REPO_ROOT"

install_deps "$REPO_ROOT/frontend"
cd "$REPO_ROOT/frontend"
npm run build
cd "$REPO_ROOT"

echo "=== Build completado (backend + frontend dist) ==="

if [ "$SKIP_RESTART" -eq 0 ]; then
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart sunday-backend 2>/dev/null || true
    pm2 restart sunday-frontend 2>/dev/null || true
    echo "=== pm2 restart intentado (sunday-backend / sunday-frontend) ==="
  else
    echo "=== pm2 no instalado: reinicia backend (node dist) y el servidor estático del frontend a mano ==="
  fi
  if command -v nginx >/dev/null 2>&1; then
    sudo nginx -s reload 2>/dev/null || true
  fi
fi

echo "=== Deploy terminado ==="
