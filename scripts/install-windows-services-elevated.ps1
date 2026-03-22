# Ejecutar en PowerShell COMO ADMINISTRADOR (clic derecho → Ejecutar como administrador).
# Crea/inicia el servicio nginx y, si existe config.yml de cloudflared, instala el servicio cloudflared.

$ErrorActionPreference = "Stop"

$nginxExe = "C:\nginx\nginx.exe"
if (-not (Test-Path $nginxExe)) {
    Write-Error "No se encuentra $nginxExe. Ajusta la ruta en este script."
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Este script debe ejecutarse como administrador."
}

$svc = Get-Service -Name nginx -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "Creando servicio nginx..."
    # sc exige un espacio después del = en binPath= y start=
    & sc.exe create nginx binPath= "$nginxExe" start= auto
    if ($LASTEXITCODE -ne 0) { throw "sc create nginx falló con código $LASTEXITCODE" }
} else {
    Write-Host "Servicio nginx ya existe."
}

Write-Host "Iniciando nginx..."
& sc.exe start nginx
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1056) {
    # 1056 = ya está en ejecución
    Write-Warning "sc start nginx devolvió $LASTEXITCODE (si nginx ya estaba en marcha, ignora)."
}

$cfConfig = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
if (Test-Path $cfConfig) {
    Write-Host "Instalando servicio cloudflared (lee $cfConfig)..."
    cloudflared service install
    if ($LASTEXITCODE -ne 0) { throw "cloudflared service install falló" }
    Start-Service cloudflared -ErrorAction SilentlyContinue
} else {
    Write-Warning "No existe $cfConfig. Tras: cloudflared tunnel login, tunnel create sunday, y scripts\configure-cloudflared-named-tunnel.ps1 -PublicHostname TU_DOMINIO, vuelve a ejecutar este script o ejecuta manualmente: cloudflared service install"
}

Write-Host "Listo. Comprueba: Get-Service nginx,cloudflared"
