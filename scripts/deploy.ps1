# Script de despliegue Sunday (ejecutar en el servidor desde la raíz del repo).
# Prerrequisitos: Node, npm, Prisma CLI, Git. Nginx opcional en C:\nginx.
param(
  [switch]$SkipGitPull,
  [switch]$SkipRestart,
  # Sin npm ci/install (útil si ya tienes node_modules y npm ci falla con EPERM).
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== Sunday deploy: $RepoRoot ==="

if (-not $SkipGitPull) {
  git pull
} else {
  Write-Host "(SkipGitPull: sin git pull)"
}

# Liberar query_engine de Prisma (si no, prisma generate suele fallar con EPERM en Windows).
if (-not $SkipRestart) {
  Write-Host "=== Parando backend en 3001 (antes de prisma generate) ==="
  Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

# Dependencias completas: hace falta TypeScript / Prisma CLI para npm run build
function Install-Deps {
  param([string]$Dir)
  Push-Location $Dir
  try {
    cmd /c "npm ci"
    if ($LASTEXITCODE -ne 0) { cmd /c "npm install" }
    if ($LASTEXITCODE -ne 0) { throw "npm install falló en $Dir" }
  } finally {
    Pop-Location
  }
}

# 2. Backend: dependencias, migraciones, build
if (-not $SkipInstall) {
  Install-Deps (Join-Path $RepoRoot 'backend')
} else {
  Write-Host "(SkipInstall: sin npm en backend)"
}
Set-Location (Join-Path $RepoRoot 'backend')
npx prisma generate
npx prisma migrate deploy
npm run build
Set-Location $RepoRoot

# 3. Frontend: dependencias y build
if (-not $SkipInstall) {
  Install-Deps (Join-Path $RepoRoot 'frontend')
} else {
  Write-Host "(SkipInstall: sin npm en frontend)"
}
Set-Location (Join-Path $RepoRoot 'frontend')
npm run build
Set-Location $RepoRoot

Write-Host "=== Build completado (backend + frontend dist) ==="

if (-not $SkipRestart) {
  Write-Host "=== Arrancando backend (puerto 3001) ==="
  $BackendDir = Join-Path $RepoRoot 'backend'
  $nodeExe = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
  if (-not $nodeExe) {
    $nodeExe = @(
      'C:\Program Files\nodejs\node.exe',
      'C:\Program Files (x86)\nodejs\node.exe'
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  }

  if ($nodeExe -and (Test-Path (Join-Path $BackendDir 'dist\src\index.js'))) {
    Start-Process -FilePath $nodeExe -ArgumentList 'dist/src/index.js' -WorkingDirectory $BackendDir -WindowStyle Hidden
    Write-Host "Backend Node iniciado (dist/src/index.js)."
  } else {
    Write-Host "ADVERTENCIA: no se pudo iniciar el backend (node o dist\src\index.js). Arranca con: cd backend; npm start"
  }

  $NginxExe = 'C:\nginx\nginx.exe'
  if (Test-Path $NginxExe) {
    $NginxDir = Split-Path $NginxExe -Parent
    $reload = Start-Process -FilePath $NginxExe -ArgumentList '-s', 'reload' -WorkingDirectory $NginxDir -Wait -PassThru -NoNewWindow
    if ($reload.ExitCode -eq 0) {
      Write-Host "Nginx: reload OK."
    } else {
      Write-Host "Nginx: reload devolvió $($reload.ExitCode). Si no estaba en marcha: ejecuta scripts\start-sunday-at-boot.ps1 o inicia nginx a mano."
    }
  } else {
    Write-Host "Nginx no encontrado en C:\nginx (omitido). El frontend en producción suele ser la carpeta frontend\dist servida por tu reverse proxy."
  }
} else {
  Write-Host "(SkipRestart: sin reinicio de procesos)"
}

Write-Host "=== Deploy terminado ==="
