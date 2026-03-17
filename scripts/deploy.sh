#!/usr/bin/env bash
# Script de despliegue Sunday (ejecutar en el servidor desde la raíz del repo).
# Prerrequisitos: Node, npm, Prisma CLI, Git. Opcional: pm2 para reinicio.
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Sunday deploy: $REPO_ROOT ==="

# 1. Actualizar código
git pull

# 2. Backend: dependencias, migraciones, build
cd backend
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
npx prisma generate
npx prisma migrate deploy
npm run build
cd "$REPO_ROOT"

# 3. Frontend: dependencias y build
cd frontend
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
npm run build
cd "$REPO_ROOT"

echo "=== Build completado. Reinicia backend y (si aplica) el servicio que sirve frontend (nginx/systemd/pm2). ==="
# Ejemplo con pm2 (descomentar y ajustar nombres):
# pm2 restart sunday-backend || true
# pm2 restart sunday-frontend || true
