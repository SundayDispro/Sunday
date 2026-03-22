# Copia a C:\startup-sunday.ps1 (o referencia desde tarea programada).
# Quick tunnel Cloudflare → URL en C:\Users\pc\.cloudflared\current-url.txt
# y aviso en el feed via POST localhost (requiere backend Sunday en 3001).

$ErrorActionPreference = 'Continue'
$CfDir = 'C:\Users\pc\.cloudflared'
$LogFile = Join-Path $CfDir 'tunnel.log'
$UrlFile = Join-Path $CfDir 'current-url.txt'
$StdOut = Join-Path $CfDir 'tunnel-stdout.log'
$StdErr = Join-Path $CfDir 'tunnel-stderr.log'
$ApiUrl = 'http://127.0.0.1:3001/api/internal/feed/system-message'

function Write-TunnelLog([string]$Line) {
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $LogFile -Encoding UTF8 -Value "[$ts] $Line"
}

if (-not (Test-Path $CfDir)) {
    New-Item -ItemType Directory -Path $CfDir -Force | Out-Null
}

Write-TunnelLog 'Inicio script (espera 20 s para red y servicios).'
Start-Sleep -Seconds 20

$cfExe = $null
foreach ($candidate in @(
        "${env:ProgramFiles}\Cloudflare\cloudflared\cloudflared.exe",
        "${env:ProgramFiles(x86)}\Cloudflare\cloudflared\cloudflared.exe",
        (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $cfExe = $candidate
        break
    }
}
# Tarea como SYSTEM: WinGet suele instalar bajo el perfil de un usuario concreto
if (-not $cfExe) {
    foreach ($userDir in Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue) {
        $wg = Join-Path $userDir.FullName 'AppData\Local\Microsoft\WinGet\Packages'
        if (-not (Test-Path -LiteralPath $wg)) { continue }
        $hit = Get-ChildItem -LiteralPath $wg -Filter 'cloudflared.exe' -Recurse -Depth 8 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($hit) {
            $cfExe = $hit.FullName
            break
        }
    }
}
if (-not $cfExe) {
    Write-TunnelLog 'ERROR: cloudflared no encontrado. Instálalo en Program Files o en PATH del sistema.'
    exit 1
}

Remove-Item $StdOut, $StdErr -ErrorAction SilentlyContinue
Write-TunnelLog "Lanzando: `"$cfExe`" tunnel --url http://127.0.0.1:5173"

$proc = Start-Process -FilePath $cfExe -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:5173') `
    -RedirectStandardOutput $StdOut -RedirectStandardError $StdErr -WindowStyle Hidden -PassThru

Write-TunnelLog "cloudflared PID=$($proc.Id)"

$url = $null
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    foreach ($f in @($StdErr, $StdOut)) {
        if (-not (Test-Path $f)) { continue }
        $raw = Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue
        if ($raw -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $url = $Matches[0]
            break
        }
    }
    if ($url) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $url) {
    Write-TunnelLog 'ERROR: timeout sin URL trycloudflare.com en salida de cloudflared.'
    exit 1
}

Write-TunnelLog "URL detectada: $url"
Set-Content -LiteralPath $UrlFile -Encoding UTF8 -Value $url

$bodyObj = @{
    content = "🌐 Servidor reiniciado. Acceso externo: $url"
}
try {
    $json = $bodyObj | ConvertTo-Json
    Invoke-RestMethod -Uri $ApiUrl -Method Post -ContentType 'application/json; charset=utf-8' -Body $json -TimeoutSec 30 | Out-Null
    Write-TunnelLog 'POST /api/internal/feed/system-message OK'
}
catch {
    Write-TunnelLog "ERROR POST feed: $($_.Exception.Message)"
    exit 1
}

# Volcar últimas líneas de salida cloudflared al log principal (diagnóstico)
foreach ($f in @($StdErr, $StdOut)) {
    if (Test-Path $f) {
        Write-TunnelLog "--- tail $([IO.Path]::GetFileName($f)) ---"
        Get-Content -LiteralPath $f -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-TunnelLog $_ }
    }
}

Write-TunnelLog 'Fin script (cloudflared sigue en segundo plano).'
