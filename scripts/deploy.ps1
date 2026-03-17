# Script de despliegue Sunday (ejecutar en el servidor desde la raíz del repo).
# Prerrequisitos: Node, npm, Prisma CLI, Git. Opcional: pm2 para reinicio.
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== Sunday deploy: $RepoRoot ==="

# 1. Actualizar código
git pull

# 2. Backend: dependencias, migraciones, build
Set-Location (Join-Path $RepoRoot backend)
npm ci --omit=dev 2>$null; if (-not $?) { npm install --omit=dev }
npx prisma generate
npx prisma migrate deploy
npm run build
Set-Location $RepoRoot

# 3. Frontend: dependencias y build
Set-Location (Join-Path $RepoRoot frontend)
npm ci --omit=dev 2>$null; if (-not $?) { npm install --omit=dev }
npm run build
Set-Location $RepoRoot

Write-Host "=== Build completado. Reinicia backend y (si aplica) el servicio que sirve frontend (nginx/systemd/pm2). ==="
# Ejemplo con pm2 (descomentar y ajustar nombres):
# pm2 restart sunday-backend
# pm2 restart sunday-frontend
