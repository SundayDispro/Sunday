# Quick tunnel Cloudflare → C:\Users\pc\.cloudflared\current-url.txt + aviso en feed Sunday.
#
# Arranque (espera 20 s, siempre nuevo túnel tras boot):
#   powershell -ExecutionPolicy Bypass -File scripts\startup-sunday-tunnel.ps1
#
# Vigilancia (sin espera larga; si el túnel responde, sale; si no, recrea y avisa):
#   powershell -ExecutionPolicy Bypass -File scripts\startup-sunday-tunnel.ps1 -EnsureOnly
#
# -ForceRecreate: ignora comprobación HTTP y recrea túnel (útil pruebas).

param(
    [switch] $EnsureOnly,
    [switch] $ForceRecreate,
    [int] $InitialSleepSeconds = 20
)

$ErrorActionPreference = 'Continue'
$CfDir = 'C:\Users\pc\.cloudflared'
$LogFile = Join-Path $CfDir 'tunnel.log'
$UrlFile = Join-Path $CfDir 'current-url.txt'
$StdOut = Join-Path $CfDir 'tunnel-stdout.log'
$StdErr = Join-Path $CfDir 'tunnel-stderr.log'
$ApiUrl = 'http://127.0.0.1:3001/api/internal/feed/system-message'
# PS 5.1 lee .ps1 sin BOM como ANSI: no uses emoji literal en el archivo.
$GlobeEmoji = [string][char]::ConvertFromUtf32(0x1F310)
$Uacute = [char]0x00FA

function Write-TunnelLog([string]$Line) {
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $LogFile -Encoding UTF8 -Value "[$ts] $Line"
}

# Cuerpo JSON como byte[] UTF-8 (Invoke-RestMethod con string suele usar Latin-1 en PS 5.1).
function Invoke-SystemFeedPostUtf8([string]$Content) {
    $payload = @{ content = $Content }
    $json = $payload | ConvertTo-Json -Compress
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $bytes = $utf8NoBom.GetBytes($json)
    Invoke-WebRequest -Uri $ApiUrl -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes `
        -UseBasicParsing -TimeoutSec 30 | Out-Null
}

function Get-CloudflaredExe {
    foreach ($candidate in @(
            "${env:ProgramFiles}\Cloudflare\cloudflared\cloudflared.exe",
            "${env:ProgramFiles(x86)}\Cloudflare\cloudflared\cloudflared.exe",
            (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
        )) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    foreach ($userDir in Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue) {
        $wg = Join-Path $userDir.FullName 'AppData\Local\Microsoft\WinGet\Packages'
        if (-not (Test-Path -LiteralPath $wg)) { continue }
        $hit = Get-ChildItem -LiteralPath $wg -Filter 'cloudflared.exe' -Recurse -Depth 8 -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

function Test-QuickTunnelUrl([string]$Url) {
    if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
    try {
        $r = Invoke-WebRequest -Uri $Url.Trim() -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 5 -ErrorAction Stop
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    }
    catch {
        return $false
    }
}

function Stop-QuickTunnelProcesses {
    Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

function Start-QuickTunnelAndGetUrl {
    param([string]$CfExe)
    Remove-Item $StdOut, $StdErr -ErrorAction SilentlyContinue
    Write-TunnelLog "Lanzando: `"$CfExe`" tunnel --url http://127.0.0.1:5173"
    $proc = Start-Process -FilePath $CfExe -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:5173') `
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
    return $url
}

if (-not (Test-Path $CfDir)) {
    New-Item -ItemType Directory -Path $CfDir -Force | Out-Null
}

if ($EnsureOnly) {
    Write-TunnelLog 'EnsureOnly: checking tunnel...'
    if ($InitialSleepSeconds -gt 0) { Start-Sleep -Seconds $InitialSleepSeconds }
}
else {
    Write-TunnelLog "Startup script (wait $InitialSleepSeconds s for network/services)."
    if ($InitialSleepSeconds -gt 0) { Start-Sleep -Seconds $InitialSleepSeconds }
}

$cfExe = Get-CloudflaredExe
if (-not $cfExe) {
    Write-TunnelLog 'ERROR: cloudflared no encontrado.'
    exit 1
}

$savedUrl = if (Test-Path -LiteralPath $UrlFile) { (Get-Content -LiteralPath $UrlFile -Raw -Encoding UTF8).Trim() } else { '' }
$alive = (-not $ForceRecreate) -and (Test-QuickTunnelUrl $savedUrl)

if ($EnsureOnly -and $alive) {
    Write-TunnelLog "Tunnel OK: $savedUrl"
    exit 0
}

if (-not $alive) {
    Write-TunnelLog 'Tunnel down, missing, or ForceRecreate: recreating...'
    Stop-QuickTunnelProcesses
}

$newUrl = Start-QuickTunnelAndGetUrl -CfExe $cfExe
if (-not $newUrl) {
    Write-TunnelLog 'ERROR: timeout waiting for trycloudflare.com URL.'
    exit 1
}

Write-TunnelLog "URL detectada: $newUrl"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($UrlFile, $newUrl, $utf8NoBom)

# Mensaje feed: emoji via ConvertFromUtf32; texto sin literales UTF-8 en el .ps1 (PS 5.1 + sin BOM).
$prefix = if ($EnsureOnly) {
    "$GlobeEmoji T${Uacute}nel Cloudflare recuperado. Acceso externo:"
}
else {
    "$GlobeEmoji Servidor reiniciado. Acceso externo:"
}
$message = "$prefix $newUrl"

try {
    Invoke-SystemFeedPostUtf8 -Content $message
    Write-TunnelLog 'POST /api/internal/feed/system-message OK (UTF-8)'
}
catch {
    Write-TunnelLog "ERROR POST feed: $($_.Exception.Message)"
    exit 1
}

foreach ($f in @($StdErr, $StdOut)) {
    if (Test-Path $f) {
        Write-TunnelLog "--- tail $([IO.Path]::GetFileName($f)) ---"
        Get-Content -LiteralPath $f -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-TunnelLog $_ }
    }
}

Write-TunnelLog 'Done (cloudflared keeps running in background).'
