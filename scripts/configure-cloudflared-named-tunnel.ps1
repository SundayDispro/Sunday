# Requiere: cloudflared tunnel login (navegador) y dominio gestionado en Cloudflare.
# Uso (PowerShell, desde la raíz del repo o cualquier ruta):
#   powershell -ExecutionPolicy Bypass -File scripts\configure-cloudflared-named-tunnel.ps1 -PublicHostname sunday.tudominio.com
# Servicio Windows (consola como administrador):
#   powershell -ExecutionPolicy Bypass -File scripts\configure-cloudflared-named-tunnel.ps1 -PublicHostname sunday.tudominio.com -InstallService

param(
    [Parameter(Mandatory = $true)]
    [string] $PublicHostname,

    [string] $TunnelName = "sunday",

    [string] $LocalService = "http://127.0.0.1:5173",

    [switch] $SkipDns,

    [switch] $InstallService
)

$ErrorActionPreference = "Stop"
$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
$certPath = Join-Path $cfDir "cert.pem"
$configPath = Join-Path $cfDir "config.yml"

if (-not (Test-Path $certPath)) {
    Write-Error "No existe $certPath. Ejecuta primero en una terminal interactiva: cloudflared tunnel login"
}

if (-not (Test-Path $cfDir)) {
    New-Item -ItemType Directory -Path $cfDir -Force | Out-Null
}

function Get-TunnelIdByName {
    param([string] $Name)
    # Evitar mezclar logs de cloudflared (stderr) con el JSON
    $json = cmd /c "cloudflared tunnel list -o json --name $Name --loglevel fatal 2>nul"
    if (-not $?) { throw "cloudflared tunnel list falló (¿cert.pem y login OK?)" }
    if ([string]::IsNullOrWhiteSpace($json)) { return $null }
    $parsed = $json | ConvertFrom-Json
    if ($null -eq $parsed) { return $null }
    if ($parsed -is [System.Array]) {
        if ($parsed.Count -eq 0) { return $null }
        return $parsed[0].id
    }
    return $parsed.id
}

$tunnelId = Get-TunnelIdByName -Name $TunnelName
if (-not $tunnelId) {
    Write-Host "Creando túnel '$TunnelName'..."
    cloudflared tunnel create $TunnelName
    if ($LASTEXITCODE -ne 0) { throw "cloudflared tunnel create falló" }
    $tunnelId = Get-TunnelIdByName -Name $TunnelName
    if (-not $tunnelId) { throw "No se pudo obtener el UUID del túnel tras crearlo" }
}

$credFile = Join-Path $cfDir "$tunnelId.json"
if (-not (Test-Path $credFile)) {
    throw "No se encuentra el archivo de credenciales: $credFile (¿túnel creado con otro usuario?)"
}

if (-not $SkipDns) {
    Write-Host "Registrando DNS: $PublicHostname -> túnel '$TunnelName'..."
    cloudflared tunnel route dns $TunnelName $PublicHostname
    if ($LASTEXITCODE -ne 0) { throw "cloudflared tunnel route dns falló (¿el dominio está en esta cuenta de Cloudflare?)" }
}

$configYaml = @"
tunnel: $tunnelId
credentials-file: $credFile

ingress:
  - hostname: $PublicHostname
    service: $LocalService
  - service: http_status:404
"@

Set-Content -Path $configPath -Value $configYaml -Encoding UTF8
Write-Host "Escrito: $configPath"
Write-Host "URL pública: https://$PublicHostname"
Write-Host "Origen local: $LocalService (debe estar escuchando backend + Vite o Nginx según tu despliegue)."

if ($InstallService) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "InstallService requiere PowerShell ejecutado como administrador."
    }
    cloudflared service install
    if ($LASTEXITCODE -ne 0) { throw "cloudflared service install falló" }
    Write-Host "Servicio instalado. Inicia o reinicia con: Start-Service cloudflared (o servicios.msc)."
}
